import type { Pool, QueryResult, QueryResultRow } from "pg";
import {
  assetRecordSchema,
  citationSchema,
  retrievalEventCreateInputSchema,
  retrievalEventSchema,
  searchResultSchema,
  type AssetDetail,
  type AssetRecord,
  type AssetVersionAssetSnapshot,
  type ChunkSourceKind,
  type RetrievalEvent,
  type RetrievalEventCreateInput,
  type SearchInput,
  type SearchRanking,
  type SearchResult
} from "@forgetbase/schema";
import {
  defaultRetrievalRankingPolicy,
  type RetrievalRankingPolicyRepository
} from "./retrieval-ranking-policy.js";
import {
  buildHashEmbedding,
  cosineSimilarity,
  DEFAULT_EMBEDDING_DIMENSIONS,
  LocalHashEmbeddingProvider,
  LOCAL_HASH_EMBEDDING_MODEL,
  LOCAL_HASH_EMBEDDING_PROVIDER,
  type EmbeddingProvider
} from "./embeddings.js";

const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.35;

export interface IndexAssetResult {
  assetId: string;
  chunksIndexed: number;
}

export interface IndexAllAssetsResult {
  assetsIndexed: number;
  chunksIndexed: number;
}

export interface RetrievalEventListOptions {
  tenantId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface RetrievalEventPurgeOptions {
  tenantId?: string;
  before: string;
  dryRun?: boolean;
}

export interface RetrievalRepository {
  indexAsset(detail: AssetDetail): Promise<IndexAssetResult>;
  indexAllAssets(tenantId?: string): Promise<IndexAllAssetsResult>;
  search(input: SearchInput): Promise<SearchResult[]>;
  recordRetrievalEvent(input: RetrievalEventCreateInput): Promise<RetrievalEvent>;
  listRetrievalEvents(options?: RetrievalEventListOptions): Promise<RetrievalEvent[]>;
  purgeRetrievalEvents(options: RetrievalEventPurgeOptions): Promise<number>;
}

export class PostgresRetrievalRepository implements RetrievalRepository {
  constructor(
    private readonly pool: Pool,
    private readonly rankingPolicyRepository?: RetrievalRankingPolicyRepository,
    private readonly embeddingProvider: EmbeddingProvider = new LocalHashEmbeddingProvider()
  ) {}

  async indexAsset(detail: AssetDetail): Promise<IndexAssetResult> {
    const chunks = buildChunks(detail);
    const embeddings = await this.embeddingProvider.embedTexts(chunks.map((chunk) => chunkEmbeddingText(chunk)));
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const current = await client.query<{ current_version_id: string | null }>(
        "SELECT current_version_id FROM assets WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [detail.asset.tenantId, detail.asset.id]
      );
      const currentVersionId = current.rows[0]?.current_version_id ?? null;

      if (!currentVersionId || currentVersionId !== detail.asset.currentVersionId) {
        throw new Error(`Refusing to index stale asset detail for ${detail.asset.stableId}`);
      }

      await client.query("DELETE FROM asset_chunks WHERE asset_id = $1", [detail.asset.id]);

      for (const [embeddingIndex, chunk] of chunks.entries()) {
        await client.query(
          `
            INSERT INTO asset_chunks (
              tenant_id,
              asset_id,
              version_id,
              source_kind,
              source_id,
              chunk_index,
              title,
              body,
              citation,
              embedding,
              embedding_provider,
              embedding_model,
              embedding_dimensions
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::vector, $11, $12, $13)
          `,
          [
            detail.asset.tenantId,
            detail.asset.id,
            chunk.versionId,
            chunk.sourceKind,
            chunk.sourceId,
            chunk.chunkIndex,
            chunk.title,
            chunk.body,
            JSON.stringify(chunk.citation),
            vectorToSql(requireEmbedding(embeddings, embeddingIndex)),
            this.embeddingProvider.provider,
            this.embeddingProvider.model,
            this.embeddingProvider.dimensions
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return {
      assetId: detail.asset.id,
      chunksIndexed: chunks.length
    };
  }

  async indexAllAssets(tenantId = "tenant_demo"): Promise<IndexAllAssetsResult> {
    const assets = await this.pool.query<{ id: string }>(
      "SELECT id FROM assets WHERE tenant_id = $1 ORDER BY stable_id ASC",
      [tenantId]
    );
    let chunksIndexed = 0;

    for (const asset of assets.rows) {
      const detail = await getAssetDetail(this.pool, asset.id);
      const result = await this.indexAsset(detail);
      chunksIndexed += result.chunksIndexed;
    }

    return {
      assetsIndexed: assets.rows.length,
      chunksIndexed
    };
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const strategy = input.strategy ?? "lexical";
    const rankingPolicy = this.rankingPolicyRepository
      ? await this.rankingPolicyRepository.getPolicy(tenantId)
      : defaultRetrievalRankingPolicy(tenantId);
    const queryEmbedding = strategy === "lexical"
      ? null
      : vectorToSql(requireEmbedding(await this.embeddingProvider.embedTexts([input.query]), 0));
    const result = await this.pool.query<SearchRow>(
      `
        WITH search_query AS (
          SELECT
            websearch_to_tsquery('english', $2) AS query,
            lower($2) AS raw_query,
            $8::vector AS query_embedding,
            $11::text AS query_embedding_provider,
            $12::text AS query_embedding_model,
            $13::integer AS query_embedding_dimensions
        ),
        ranked_chunks AS (
          SELECT
            asset_chunks.id AS chunk_id,
            asset_chunks.source_kind AS chunk_source_kind,
            asset_chunks.chunk_index,
            asset_chunks.title AS chunk_title,
            asset_chunks.body,
            asset_chunks.citation,
            ts_rank_cd(asset_chunks.search_vector, search_query.query) AS lexical_rank,
            CASE asset_chunks.source_kind
              WHEN 'agent-instruction' THEN $4::numeric
              WHEN 'asset-summary' THEN $5::numeric
              ELSE $6::numeric
            END AS source_kind_weight,
            CASE
              WHEN length(search_query.raw_query) >= 3
                AND lower(asset_chunks.title || ' ' || asset_chunks.body) LIKE '%' || search_query.raw_query || '%'
              THEN $7::numeric
              ELSE 0
            END AS exact_phrase_boost,
            CASE
              WHEN search_query.query_embedding IS NOT NULL
                AND asset_chunks.embedding IS NOT NULL
                AND asset_chunks.embedding_provider = search_query.query_embedding_provider
                AND asset_chunks.embedding_model = search_query.query_embedding_model
                AND asset_chunks.embedding_dimensions = search_query.query_embedding_dimensions
              THEN greatest(0::numeric, 1::numeric - (asset_chunks.embedding <=> search_query.query_embedding)::numeric)
              ELSE 0::numeric
            END AS vector_similarity,
            CASE WHEN $9 = 'lexical' THEN NULL ELSE search_query.query_embedding_provider END AS ranking_embedding_provider,
            CASE WHEN $9 = 'lexical' THEN NULL ELSE search_query.query_embedding_model END AS ranking_embedding_model,
            CASE WHEN $9 = 'lexical' THEN NULL ELSE search_query.query_embedding_dimensions END AS ranking_embedding_dimensions,
            assets.*
          FROM asset_chunks
          JOIN assets ON assets.id = asset_chunks.asset_id
          CROSS JOIN search_query
          WHERE asset_chunks.tenant_id = $1
            AND asset_chunks.version_id = assets.current_version_id
            AND (
              ($9 = 'lexical' AND asset_chunks.search_vector @@ search_query.query)
              OR ($9 = 'vector'
                AND search_query.query_embedding IS NOT NULL
                AND asset_chunks.embedding IS NOT NULL
                AND asset_chunks.embedding_provider = search_query.query_embedding_provider
                AND asset_chunks.embedding_model = search_query.query_embedding_model
                AND asset_chunks.embedding_dimensions = search_query.query_embedding_dimensions)
              OR ($9 = 'hybrid' AND (
                asset_chunks.search_vector @@ search_query.query
                OR (
                  search_query.query_embedding IS NOT NULL
                  AND asset_chunks.embedding IS NOT NULL
                  AND asset_chunks.embedding_provider = search_query.query_embedding_provider
                  AND asset_chunks.embedding_model = search_query.query_embedding_model
                  AND asset_chunks.embedding_dimensions = search_query.query_embedding_dimensions
                )
              ))
            )
        ),
        scored_chunks AS (
          SELECT
            *,
            CASE $9
              WHEN 'vector' THEN vector_similarity * source_kind_weight
              WHEN 'hybrid' THEN ((lexical_rank * source_kind_weight) + exact_phrase_boost) + ($10::numeric * vector_similarity)
              ELSE ((lexical_rank * source_kind_weight) + exact_phrase_boost)
            END AS rank,
            CASE $9
              WHEN 'vector' THEN CASE WHEN $11 = 'local-hash' THEN 'vector-hash-v1' ELSE 'vector-provider-v1' END
              WHEN 'hybrid' THEN CASE WHEN $11 = 'local-hash' THEN 'hybrid-hash-lexical-v1' ELSE 'hybrid-provider-lexical-v1' END
              ELSE 'lexical-weighted-v1'
            END AS ranking_strategy
          FROM ranked_chunks
        )
        SELECT
          *
        FROM scored_chunks
        ORDER BY rank DESC, stable_id ASC, chunk_index ASC
        LIMIT $3
      `,
      [
        tenantId,
        input.query,
        limit * 5,
        rankingPolicy.agentInstructionWeight,
        rankingPolicy.assetSummaryWeight,
        rankingPolicy.humanDocumentWeight,
        rankingPolicy.exactPhraseBoost,
        queryEmbedding,
        strategy,
        DEFAULT_HYBRID_VECTOR_WEIGHT,
        this.embeddingProvider.provider,
        this.embeddingProvider.model,
        this.embeddingProvider.dimensions
      ]
    );

    return result.rows.slice(0, limit).map(mapSearchRow);
  }

  async recordRetrievalEvent(input: RetrievalEventCreateInput): Promise<RetrievalEvent> {
    const parsed = retrievalEventCreateInputSchema.parse(input);
    const result = await this.pool.query<RetrievalEventRow>(
      `
        INSERT INTO retrieval_events (
          tenant_id,
          actor_user_id,
          actor_service_account_id,
          actor_api_key_id,
          surface,
          query,
          result_count,
          denied_count,
          latency_ms,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.actorUserId ?? null,
        parsed.actorServiceAccountId ?? null,
        parsed.actorApiKeyId ?? null,
        parsed.surface,
        parsed.query,
        parsed.resultCount,
        parsed.deniedCount,
        parsed.latencyMs,
        JSON.stringify(parsed.metadata)
      ]
    );

    return mapRetrievalEventRow(requireRow(result));
  }

  async listRetrievalEvents(options: RetrievalEventListOptions = {}): Promise<RetrievalEvent[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<RetrievalEventRow>(
      `
        SELECT *
        FROM retrieval_events
        WHERE tenant_id = $1
          AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [tenantId, options.since ?? null, options.until ?? null, limit]
    );

    return result.rows.map(mapRetrievalEventRow);
  }

  async purgeRetrievalEvents(options: RetrievalEventPurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";

    if (options.dryRun ?? true) {
      const result = await this.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM retrieval_events WHERE tenant_id = $1 AND created_at < $2::timestamptz",
        [tenantId, options.before]
      );

      return Number.parseInt(result.rows[0]?.count ?? "0", 10);
    }

    const result = await this.pool.query<{ id: string }>(
      "DELETE FROM retrieval_events WHERE tenant_id = $1 AND created_at < $2::timestamptz RETURNING id",
      [tenantId, options.before]
    );

    return result.rowCount ?? 0;
  }
}

export class InMemoryRetrievalRepository implements RetrievalRepository {
  private readonly chunks: SearchResult[] = [];
  private readonly events: RetrievalEvent[] = [];
  private sequence = 0;

  constructor(private readonly rankingPolicyRepository?: RetrievalRankingPolicyRepository) {}

  async indexAsset(detail: AssetDetail): Promise<IndexAssetResult> {
    const chunks = buildChunks(detail).map((chunk) => {
      const ranking = buildSearchRanking({
        lexicalRank: 1,
        sourceKind: chunk.sourceKind,
        exactPhraseBoost: 0
      });

      return searchResultSchema.parse({
        asset: detail.asset,
        chunkId: `${detail.asset.id}:${chunk.sourceKind}:${chunk.sourceId ?? "asset"}:${chunk.chunkIndex}`,
        sourceKind: chunk.sourceKind,
        title: chunk.title,
        content: chunk.body,
        rank: ranking.finalScore,
        ranking,
        citation: chunk.citation
      });
    });
    const next = this.chunks.filter((chunk) => chunk.asset.id !== detail.asset.id);
    next.push(...chunks);
    this.chunks.splice(0, this.chunks.length, ...next);

    return {
      assetId: detail.asset.id,
      chunksIndexed: chunks.length
    };
  }

  async indexAllAssets(): Promise<IndexAllAssetsResult> {
    return {
      assetsIndexed: 0,
      chunksIndexed: this.chunks.length
    };
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const strategy = input.strategy ?? "lexical";
    const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    const queryEmbedding = buildHashEmbedding(input.query);
    const rankingPolicy = this.rankingPolicyRepository
      ? await this.rankingPolicyRepository.getPolicy(tenantId)
      : defaultRetrievalRankingPolicy(tenantId);

    return this.chunks
      .filter((chunk) => chunk.asset.tenantId === tenantId)
      .filter((chunk) => chunk.citation.versionId === chunk.asset.currentVersionId)
      .map((chunk) => {
        const lexicalRank = scoreChunk(chunk, terms);
        const exactPhraseBoost = exactPhraseMatches(chunk, input.query) ? rankingPolicy.exactPhraseBoost : 0;
        const vectorSimilarity = strategy === "lexical"
          ? null
          : cosineSimilarity(queryEmbedding, buildHashEmbedding(`${chunk.title}\n\n${chunk.content}`));
        const ranking = buildSearchRanking({
          strategy,
          lexicalRank,
          sourceKind: chunk.sourceKind,
          exactPhraseBoost,
          sourceKindWeight: searchSourceKindWeight(chunk.sourceKind, rankingPolicy),
          vectorSimilarity,
          vectorWeight: strategy === "hybrid" ? DEFAULT_HYBRID_VECTOR_WEIGHT : null,
          embeddingProvider: strategy === "lexical" ? null : LOCAL_HASH_EMBEDDING_PROVIDER,
          embeddingModel: strategy === "lexical" ? null : LOCAL_HASH_EMBEDDING_MODEL,
          embeddingDimensions: strategy === "lexical" ? null : DEFAULT_EMBEDDING_DIMENSIONS
        });

        return {
          ...chunk,
          rank: ranking.finalScore,
          ranking
        };
      })
      .filter((chunk) => chunk.rank > 0)
      .sort((left, right) => right.rank - left.rank || left.asset.stableId.localeCompare(right.asset.stableId))
      .slice(0, limit);
  }

  async recordRetrievalEvent(input: RetrievalEventCreateInput): Promise<RetrievalEvent> {
    const parsed = retrievalEventCreateInputSchema.parse(input);
    this.sequence += 1;
    const event = retrievalEventSchema.parse({
      id: `retrieval_${this.sequence}`,
      tenantId: parsed.tenantId,
      actorUserId: parsed.actorUserId ?? null,
      actorServiceAccountId: parsed.actorServiceAccountId ?? null,
      actorApiKeyId: parsed.actorApiKeyId ?? null,
      surface: parsed.surface,
      query: parsed.query,
      resultCount: parsed.resultCount,
      deniedCount: parsed.deniedCount,
      latencyMs: parsed.latencyMs,
      metadata: parsed.metadata,
      createdAt: new Date().toISOString()
    });

    this.events.unshift(event);
    return event;
  }

  async listRetrievalEvents(options: RetrievalEventListOptions = {}): Promise<RetrievalEvent[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const since = options.since ? Date.parse(options.since) : undefined;
    const until = options.until ? Date.parse(options.until) : undefined;

    return this.events
      .filter((event) => event.tenantId === tenantId)
      .filter((event) => isCreatedAtInWindow(event.createdAt, since, until))
      .slice(0, limit);
  }

  async purgeRetrievalEvents(options: RetrievalEventPurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const cutoff = Date.parse(options.before);
    const matches = this.events.filter((event) =>
      event.tenantId === tenantId &&
      !Number.isNaN(Date.parse(event.createdAt)) &&
      Date.parse(event.createdAt) < cutoff
    );

    if (!(options.dryRun ?? true)) {
      const matchIds = new Set(matches.map((event) => event.id));
      this.events.splice(0, this.events.length, ...this.events.filter((event) => !matchIds.has(event.id)));
    }

    return matches.length;
  }
}

function isCreatedAtInWindow(createdAt: string, since?: number, until?: number): boolean {
  const value = Date.parse(createdAt);

  return !Number.isNaN(value) &&
    (since === undefined || value >= since) &&
    (until === undefined || value <= until);
}

function buildChunks(detail: AssetDetail): BuiltChunk[] {
  const chunks: BuiltChunk[] = [];
  const currentVersionId = detail.asset.currentVersionId;

  if (!currentVersionId) {
    throw new Error(`Cannot index asset ${detail.asset.stableId} without a current version`);
  }

  if (detail.asset.summary) {
    chunks.push(...splitIntoChunks({
      asset: detail.asset,
      sourceKind: "asset-summary",
      sourceId: detail.asset.id,
      versionId: currentVersionId,
      title: detail.asset.title,
      body: `${detail.asset.title}\n\n${detail.asset.summary}`
    }));
  }

  for (const instruction of detail.instructionObjects) {
    if (instruction.versionId !== currentVersionId) {
      continue;
    }

    chunks.push(...splitIntoChunks({
      asset: detail.asset,
      sourceKind: "agent-instruction",
      sourceId: instruction.id,
      versionId: instruction.versionId,
      title: `${detail.asset.title} instruction`,
      body: [
        instruction.body,
        instruction.constraints.length ? `Constraints:\n${instruction.constraints.join("\n")}` : "",
        instruction.examples.length ? `Examples:\n${instruction.examples.join("\n")}` : "",
        instruction.failureModes.length ? `Failure modes:\n${instruction.failureModes.join("\n")}` : "",
        instruction.escalation ? `Escalation:\n${instruction.escalation}` : ""
      ].filter(Boolean).join("\n\n")
    }));
  }

  for (const document of detail.humanDocuments) {
    if (document.versionId !== currentVersionId) {
      continue;
    }

    chunks.push(...splitIntoChunks({
      asset: detail.asset,
      sourceKind: "human-document",
      sourceId: document.id,
      versionId: document.versionId,
      title: `${detail.asset.title} document`,
      body: document.body
    }));
  }

  return chunks;
}

function splitIntoChunks(input: {
  asset: AssetRecord;
  sourceKind: ChunkSourceKind;
  sourceId: string | null;
  versionId: string;
  title: string;
  body: string;
}): BuiltChunk[] {
  const paragraphs = input.body.split(/\n{2,}/);
  const bodies: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length > 1200 && current) {
      bodies.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    bodies.push(current);
  }

  return bodies.map((body, index) => {
    const snippet = body.replace(/\s+/g, " ").slice(0, 240);

    return {
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      versionId: input.versionId,
      chunkIndex: index,
      title: input.title,
      body,
      citation: citationSchema.parse({
        stableId: input.asset.stableId,
        assetId: input.asset.id,
        chunkId: "pending",
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        sourceRef: input.asset.sourceRef,
        versionId: input.versionId,
        title: input.title,
        chunkIndex: index,
        snippet: snippet || input.title
      })
    };
  });
}

function mapSearchRow(row: SearchRow): SearchResult {
  const asset = mapAssetRow(row);
  const citation = citationSchema.parse({
    ...row.citation,
    chunkId: row.chunk_id
  });

  return searchResultSchema.parse({
    asset,
    chunkId: row.chunk_id,
    sourceKind: row.chunk_source_kind,
    title: row.chunk_title,
    content: row.body,
    rank: Number(row.rank),
    ranking: buildSearchRanking({
      strategy: row.ranking_strategy,
      lexicalRank: Number(row.lexical_rank),
      sourceKind: row.chunk_source_kind,
      exactPhraseBoost: Number(row.exact_phrase_boost),
      sourceKindWeight: Number(row.source_kind_weight),
      vectorSimilarity: isVectorRankingStrategy(row.ranking_strategy) ? Number(row.vector_similarity) : null,
      vectorWeight: isHybridRankingStrategy(row.ranking_strategy) ? DEFAULT_HYBRID_VECTOR_WEIGHT : null,
      embeddingProvider: isVectorRankingStrategy(row.ranking_strategy) ? row.ranking_embedding_provider : null,
      embeddingModel: isVectorRankingStrategy(row.ranking_strategy) ? row.ranking_embedding_model : null,
      embeddingDimensions: isVectorRankingStrategy(row.ranking_strategy) ? Number(row.ranking_embedding_dimensions) : null
    }),
    citation
  });
}

function mapRetrievalEventRow(row: RetrievalEventRow): RetrievalEvent {
  return retrievalEventSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorServiceAccountId: row.actor_service_account_id,
    actorApiKeyId: row.actor_api_key_id,
    surface: row.surface,
    query: row.query,
    resultCount: row.result_count,
    deniedCount: row.denied_count,
    latencyMs: row.latency_ms,
    metadata: row.metadata,
    createdAt: toIso(row.created_at)
  });
}

async function getAssetDetail(client: Queryable, assetId: string): Promise<AssetDetail> {
  const asset = await client.query<AssetRow>("SELECT * FROM assets WHERE id = $1", [assetId]);
  const assetRow = requireRow(asset);
  const versions = await client.query<AssetVersionRow>(
    "SELECT * FROM asset_versions WHERE asset_id = $1 ORDER BY version_number DESC",
    [assetId]
  );
  const instructions = await client.query<InstructionObjectRow>(
    "SELECT * FROM instruction_objects WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [assetId, assetRow.current_version_id]
  );
  const humanDocuments = await client.query<HumanDocumentRow>(
    "SELECT * FROM human_documents WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [assetId, assetRow.current_version_id]
  );

  return {
    asset: mapAssetRow(assetRow),
    versions: versions.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      versionNumber: row.version_number,
      contentHash: row.content_hash,
      metadata: row.metadata,
      assetSnapshot: row.asset_snapshot,
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
      changeNote: row.change_note
    })),
    instructionObjects: instructions.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      versionId: row.version_id,
      instructionKind: row.instruction_kind,
      targetAgents: row.target_agents,
      body: row.body,
      inputContract: row.input_contract,
      outputContract: row.output_contract,
      constraints: row.constraints_list,
      examples: row.examples,
      failureModes: row.failure_modes,
      escalation: row.escalation,
      createdAt: toIso(row.created_at)
    })),
    humanDocuments: humanDocuments.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      versionId: row.version_id,
      format: row.format as "markdown" | "html" | "plain-text",
      body: row.body,
      renderOptions: row.render_options,
      linkedInstructionIds: row.linked_instruction_ids,
      createdAt: toIso(row.created_at)
    }))
  };
}

function mapAssetRow(row: AssetRow): AssetRecord {
  return assetRecordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    stableId: row.stable_id,
    type: row.type,
    ownerId: row.owner_id,
    title: row.title,
    summary: row.summary ?? undefined,
    lifecycleState: row.lifecycle_state,
    sensitivity: row.sensitivity,
    audience: row.audience,
    status: row.status,
    reviewDueAt: toDateOnly(row.review_due_at),
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    allowedSurfaces: row.allowed_surfaces,
    allowedExports: row.allowed_exports,
    allowedActions: row.allowed_actions,
    currentVersionId: row.current_version_id,
    metadata: row.metadata,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  });
}

function scoreChunk(chunk: SearchResult, terms: string[]): number {
  const haystack = `${chunk.title} ${chunk.content} ${chunk.asset.title}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function exactPhraseMatches(chunk: SearchResult, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length < 3) {
    return false;
  }

  return `${chunk.title} ${chunk.content}`.toLowerCase().includes(normalizedQuery);
}

function buildSearchRanking(input: {
  strategy?: SearchInput["strategy"] | SearchRanking["strategy"];
  lexicalRank: number;
  sourceKind: ChunkSourceKind;
  exactPhraseBoost: number;
  sourceKindWeight?: number;
  vectorSimilarity?: number | null;
  vectorWeight?: number | null;
  embeddingProvider?: string | null;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
}): SearchRanking {
  const strategy = normalizeRankingStrategy(input.strategy ?? "lexical");
  const sourceKindWeight = input.sourceKindWeight ?? searchSourceKindWeight(input.sourceKind);
  const vectorSimilarity = input.vectorSimilarity ?? null;
  const vectorWeight = input.vectorWeight ?? null;
  const lexicalScore = (input.lexicalRank * sourceKindWeight) + input.exactPhraseBoost;
  const finalScore = isVectorOnlyRankingStrategy(strategy)
    ? (vectorSimilarity ?? 0) * sourceKindWeight
    : isHybridRankingStrategy(strategy)
      ? lexicalScore + ((vectorWeight ?? DEFAULT_HYBRID_VECTOR_WEIGHT) * (vectorSimilarity ?? 0))
      : lexicalScore;

  return {
    strategy,
    lexicalRank: input.lexicalRank,
    sourceKindWeight,
    exactPhraseBoost: input.exactPhraseBoost,
    vectorSimilarity,
    vectorWeight,
    embeddingProvider: input.embeddingProvider ?? null,
    embeddingModel: input.embeddingModel ?? null,
    embeddingDimensions: input.embeddingDimensions ?? null,
    finalScore
  };
}

function normalizeRankingStrategy(strategy: SearchInput["strategy"] | SearchRanking["strategy"]): SearchRanking["strategy"] {
  switch (strategy) {
    case "vector":
    case "vector-hash-v1":
      return "vector-hash-v1";
    case "vector-provider-v1":
      return "vector-provider-v1";
    case "hybrid":
    case "hybrid-hash-lexical-v1":
      return "hybrid-hash-lexical-v1";
    case "hybrid-provider-lexical-v1":
      return "hybrid-provider-lexical-v1";
    case "lexical":
    case "lexical-weighted-v1":
      return "lexical-weighted-v1";
    default:
      return "lexical-weighted-v1";
  }
}

function searchSourceKindWeight(
  sourceKind: ChunkSourceKind,
  policy = defaultRetrievalRankingPolicy("tenant_demo")
): number {
  switch (sourceKind) {
    case "agent-instruction":
      return policy.agentInstructionWeight;
    case "asset-summary":
      return policy.assetSummaryWeight;
    case "human-document":
      return policy.humanDocumentWeight;
  }
}

function chunkEmbeddingText(chunk: BuiltChunk): string {
  return `${chunk.title}\n\n${chunk.body}`;
}

function requireEmbedding(embeddings: number[][], index: number): number[] {
  const embedding = embeddings[index];

  if (!embedding) {
    throw new Error(`Embedding provider returned no vector for chunk index ${index}`);
  }

  return embedding;
}

function isVectorRankingStrategy(strategy: SearchRanking["strategy"]): boolean {
  return strategy !== "lexical-weighted-v1";
}

function isVectorOnlyRankingStrategy(strategy: SearchRanking["strategy"]): boolean {
  return strategy === "vector-hash-v1" || strategy === "vector-provider-v1";
}

function isHybridRankingStrategy(strategy: SearchRanking["strategy"]): boolean {
  return strategy === "hybrid-hash-lexical-v1" || strategy === "hybrid-provider-lexical-v1";
}

function vectorToSql(vector: number[]): string {
  return `[${vector.map((value) => roundVectorValue(value)).join(",")}]`;
}

function roundVectorValue(value: number): string {
  if (Object.is(value, -0)) {
    return "0";
  }

  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function requireRow<T extends QueryResultRow>(result: QueryResult<T>): T {
  const row = result.rows[0];

  if (!row) {
    throw new Error("Expected database row");
  }

  return row;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDateOnly(value: Date | string): string {
  if (!(value instanceof Date)) {
    return value;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface BuiltChunk {
  sourceKind: ChunkSourceKind;
  sourceId: string | null;
  versionId: string;
  chunkIndex: number;
  title: string;
  body: string;
  citation: {
    stableId: string;
    assetId: string;
    chunkId: string;
    sourceKind: ChunkSourceKind;
    sourceId: string | null;
    sourceRef: string | null;
    versionId: string | null;
    title: string;
    chunkIndex: number;
    snippet: string;
  };
}

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

interface SearchRow extends AssetRow {
  chunk_id: string;
  chunk_source_kind: ChunkSourceKind;
  chunk_title: string;
  body: string;
  citation: Record<string, unknown>;
  rank: string | number;
  lexical_rank: string | number;
  source_kind_weight: string | number;
  exact_phrase_boost: string | number;
  vector_similarity: string | number;
  ranking_strategy: SearchRanking["strategy"];
  ranking_embedding_provider: string | null;
  ranking_embedding_model: string | null;
  ranking_embedding_dimensions: number | string | null;
}

interface RetrievalEventRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_service_account_id: string | null;
  actor_api_key_id: string | null;
  surface: string;
  query: string;
  result_count: number;
  denied_count: number;
  latency_ms: number;
  metadata: Record<string, unknown>;
  created_at: Date | string;
}

interface AssetRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  stable_id: string;
  type: string;
  owner_id: string;
  title: string;
  summary: string | null;
  lifecycle_state: string;
  sensitivity: string;
  audience: string[];
  status: string;
  review_due_at: Date | string;
  source_kind: string | null;
  source_ref: string | null;
  allowed_surfaces: string[];
  allowed_exports: string[];
  allowed_actions: string[];
  metadata: Record<string, unknown>;
  current_version_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AssetVersionRow extends QueryResultRow {
  id: string;
  asset_id: string;
  version_number: number;
  content_hash: string;
  metadata: Record<string, unknown>;
  asset_snapshot: AssetVersionAssetSnapshot;
  created_by: string | null;
  created_at: Date | string;
  change_note: string | null;
}

interface InstructionObjectRow extends QueryResultRow {
  id: string;
  asset_id: string;
  version_id: string;
  instruction_kind: string;
  target_agents: string[];
  body: string;
  input_contract: Record<string, unknown>;
  output_contract: Record<string, unknown>;
  constraints_list: string[];
  examples: string[];
  failure_modes: string[];
  escalation: string | null;
  created_at: Date | string;
}

interface HumanDocumentRow extends QueryResultRow {
  id: string;
  asset_id: string;
  version_id: string;
  format: string;
  body: string;
  render_options: Record<string, unknown>;
  linked_instruction_ids: string[];
  created_at: Date | string;
}
