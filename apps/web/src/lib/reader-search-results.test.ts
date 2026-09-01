import type { AssetRecord, SearchResult } from "@forgetbase/schema";
import { describe, expect, it } from "vitest";
import { groupReaderSearchResults } from "./reader-search-results.js";

function asset(stableId: string): AssetRecord {
  return {
    id: `asset_${stableId}`,
    tenantId: "tenant_demo",
    stableId,
    type: "human-document",
    title: stableId,
    ownerId: "owner",
    lifecycleState: "active",
    sensitivity: "public-demo",
    audience: ["readers"],
    status: "approved",
    reviewDueAt: "2100-01-01",
    sourceKind: "demo",
    sourceRef: "corpus/demo/assets.json",
    allowedSurfaces: ["web"],
    allowedExports: [],
    allowedActions: [],
    metadata: {},
    currentVersionId: "version_1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  };
}

function searchResult(
  stableId: string,
  chunkId: string,
  finalScore: number,
  options: { rank?: number; chunkIndex?: number; sourceKind?: SearchResult["sourceKind"] } = {}
): SearchResult {
  const record = asset(stableId);
  const sourceKind = options.sourceKind ?? "human-document";
  return {
    asset: record,
    chunkId,
    sourceKind,
    title: `${stableId} result`,
    content: `Content for ${chunkId}`,
    rank: options.rank ?? finalScore,
    ranking: {
      strategy: "lexical-weighted-v1",
      lexicalRank: finalScore,
      sourceKindWeight: 1,
      exactPhraseBoost: 0,
      vectorSimilarity: null,
      vectorWeight: null,
      embeddingProvider: null,
      embeddingModel: null,
      embeddingDimensions: null,
      finalScore
    },
    citation: {
      stableId,
      assetId: record.id,
      chunkId,
      sourceKind,
      sourceId: "document_1",
      sourceRef: record.sourceRef,
      versionId: record.currentVersionId,
      title: record.title,
      chunkIndex: options.chunkIndex ?? 0,
      snippet: `Snippet for ${chunkId}`
    }
  };
}

describe("reader search result grouping", () => {
  it("returns one result per stable page ID with a match count", () => {
    const grouped = groupReaderSearchResults([
      searchResult("page.alpha", "alpha:1", 5),
      searchResult("page.alpha", "alpha:2", 4),
      searchResult("page.beta", "beta:1", 3)
    ]);

    expect(grouped.map(({ result, matchCount }) => ({ stableId: result.asset.stableId, matchCount }))).toEqual([
      { stableId: "page.alpha", matchCount: 2 },
      { stableId: "page.beta", matchCount: 1 }
    ]);
  });

  it("orders pages by their strongest result", () => {
    const grouped = groupReaderSearchResults([
      searchResult("page.alpha", "alpha:weak", 2),
      searchResult("page.gamma", "gamma:best", 8),
      searchResult("page.beta", "beta:best", 8),
      searchResult("page.alpha", "alpha:best", 6)
    ]);

    expect(grouped.map(({ result }) => result.asset.stableId)).toEqual(["page.beta", "page.gamma", "page.alpha"]);
  });

  it("selects final score and rank before deterministic chunk metadata", () => {
    const first = searchResult("page.alpha", "alpha:first", 7, { rank: 10 });
    const strongerRank = searchResult("page.alpha", "alpha:stronger-rank", 7, { rank: 11 });
    const strongerScore = searchResult("page.alpha", "alpha:stronger-score", 8, { rank: 1 });
    const lowerChunkIndex = searchResult("page.alpha", "alpha:index-one", 8, { rank: 1, chunkIndex: 1 });
    const higherChunkIndex = searchResult("page.alpha", "alpha:index-two", 8, { rank: 1, chunkIndex: 2 });
    const earlierChunkId = searchResult("page.alpha", "alpha:a", 8, { rank: 1, chunkIndex: 1 });
    const laterChunkId = searchResult("page.alpha", "alpha:z", 8, { rank: 1, chunkIndex: 1 });
    const earlierSourceKind = searchResult("page.alpha", "alpha:same", 8, { rank: 1, sourceKind: "asset-summary" });
    const laterSourceKind = searchResult("page.alpha", "alpha:same", 8, { rank: 1, sourceKind: "human-document" });

    expect(groupReaderSearchResults([first, strongerRank])[0]?.result.chunkId).toBe("alpha:stronger-rank");
    expect(groupReaderSearchResults([first, strongerScore])[0]?.result.chunkId).toBe("alpha:stronger-score");
    expect(groupReaderSearchResults([first, strongerScore])[0]?.result.citation.snippet).toBe("Snippet for alpha:stronger-score");
    expect(groupReaderSearchResults([higherChunkIndex, lowerChunkIndex])[0]?.result.chunkId).toBe("alpha:index-one");
    expect(groupReaderSearchResults([laterChunkId, earlierChunkId])[0]?.result.chunkId).toBe("alpha:a");
    expect(groupReaderSearchResults([laterSourceKind, earlierSourceKind])[0]?.result.sourceKind).toBe("asset-summary");
  });

  it("returns an empty list for an empty response", () => {
    expect(groupReaderSearchResults([])).toEqual([]);
  });
});
