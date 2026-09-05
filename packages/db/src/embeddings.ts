import { createHash } from "node:crypto";

export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
export const LOCAL_HASH_EMBEDDING_PROVIDER = "local-hash";
export const LOCAL_HASH_EMBEDDING_MODEL = "hash-embedding-v1";
export const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_OPENAI_EMBEDDING_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS = 30_000;

export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embedTexts(texts: string[]): Promise<number[][]>;
}

export interface OpenAiEmbeddingProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  dimensions?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly provider = LOCAL_HASH_EMBEDDING_PROVIDER;
  readonly model = LOCAL_HASH_EMBEDDING_MODEL;
  readonly dimensions = DEFAULT_EMBEDDING_DIMENSIONS;

  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map(buildHashEmbedding);
  }
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "openai";
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiEmbeddingProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_OPENAI_EMBEDDING_MODEL;
    this.dimensions = options.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    const baseUrl = options.baseUrl ?? DEFAULT_OPENAI_EMBEDDING_BASE_URL;
    let end = baseUrl.length;
    while (end > 0 && baseUrl[end - 1] === "/") end -= 1;
    this.baseUrl = baseUrl.slice(0, end);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.apiKey.trim()) {
      throw new Error("OpenAI embeddings require a non-empty API key");
    }

    if (this.dimensions !== DEFAULT_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `FORGETBASE_EMBEDDINGS_DIMENSIONS must be ${DEFAULT_EMBEDDING_DIMENSIONS} for the current pgvector schema`
      );
    }
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          input: texts,
          model: this.model,
          dimensions: this.dimensions
        }),
        signal: controller.signal,
        redirect: "error"
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`OpenAI embeddings request failed with HTTP ${response.status}`);
      }

      const payload = await response.json() as OpenAiEmbeddingResponse;
      const byIndex = new Map<number, number[]>();

      for (const item of payload.data ?? []) {
        byIndex.set(item.index, normalizeEmbeddingVector(item.embedding, this.dimensions));
      }

      return texts.map((_, index) => {
        const embedding = byIndex.get(index);

        if (!embedding) {
          throw new Error(`OpenAI embeddings response omitted index ${index}`);
        }

        return embedding;
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createEmbeddingProviderFromEnv(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  const provider = (env.FORGETBASE_EMBEDDINGS_PROVIDER ?? LOCAL_HASH_EMBEDDING_PROVIDER).trim().toLowerCase();

  switch (provider) {
    case "":
    case "hash":
    case "local-hash":
      return new LocalHashEmbeddingProvider();
    case "openai": {
      const apiKeyEnvVar = env.FORGETBASE_EMBEDDINGS_API_KEY_ENV_VAR ?? "OPENAI_API_KEY";
      const apiKey = env[apiKeyEnvVar];

      if (!apiKey) {
        throw new Error(`FORGETBASE_EMBEDDINGS_PROVIDER=openai requires ${apiKeyEnvVar} to be set`);
      }

      return new OpenAiEmbeddingProvider({
        apiKey,
        model: env.FORGETBASE_EMBEDDINGS_MODEL,
        baseUrl: env.FORGETBASE_EMBEDDINGS_BASE_URL,
        dimensions: readPositiveIntegerEnv(env, "FORGETBASE_EMBEDDINGS_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS),
        timeoutMs: readPositiveIntegerEnv(env, "FORGETBASE_EMBEDDINGS_TIMEOUT_MS", DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS)
      });
    }
    default:
      throw new Error(`Unsupported FORGETBASE_EMBEDDINGS_PROVIDER: ${provider}`);
  }
}

export function buildHashEmbedding(text: string): number[] {
  const vector = Array.from({ length: DEFAULT_EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [];

  for (const token of tokens) {
    const hash = createHash("sha256").update(token).digest();
    const index = hash.readUInt32BE(0) % DEFAULT_EMBEDDING_DIMENSIONS;
    const sign = (hash[4] ?? 0) % 2 === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let score = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return Math.max(0, score);
}

function normalizeEmbeddingVector(vector: unknown, expectedDimensions: number): number[] {
  if (!Array.isArray(vector) || vector.length !== expectedDimensions) {
    throw new Error(`Embedding vector must contain ${expectedDimensions} numeric dimensions`);
  }

  return vector.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Embedding vector contains a non-finite value at dimension ${index}`);
    }

    return value;
  });
}

function readPositiveIntegerEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const raw = env[name];

  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

interface OpenAiEmbeddingResponse {
  data?: Array<{
    index: number;
    embedding: unknown;
  }>;
}
