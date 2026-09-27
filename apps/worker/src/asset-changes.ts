import {
  PostgresAssetChangeOutboxRepository,
  PostgresManagedQueryCacheRepository,
  PostgresRegistryRepository,
  PostgresRetrievalRepository,
  createEmbeddingProviderFromEnv,
  type AssetChangeClaimOptions,
  type AssetChangeErrorCode,
  type AssetChangeOutboxHealth,
  type AssetChangeOutboxRepository,
  type ManagedQueryCacheRepository,
  type RegistryRepository,
  type RetrievalRepository
} from "@forgetbase/db";
import { withWorkerRuntime, type WorkerRuntime } from "./runtime.js";

export interface AssetChangeReconciliationDependencies {
  outbox: AssetChangeOutboxRepository;
  registry: RegistryRepository;
  retrieval: RetrievalRepository;
  cache: ManagedQueryCacheRepository;
}

export interface AssetChangeReconciliationResult {
  claimed: number;
  completed: number;
  retryScheduled: number;
  leaseLost: number;
  errors: Partial<Record<AssetChangeErrorCode, number>>;
  health: AssetChangeOutboxHealth;
}

export async function reconcileAssetChanges(
  dependencies: AssetChangeReconciliationDependencies,
  options: AssetChangeClaimOptions = {}
): Promise<AssetChangeReconciliationResult> {
  const result: AssetChangeReconciliationResult = {
    claimed: 0, completed: 0, retryScheduled: 0, leaseLost: 0, errors: {},
    health: { pending: 0, processing: 0, failed: 0, oldestPendingAt: null, oldestPendingAgeMs: null }
  };
  const limit = options.limit !== undefined && Number.isSafeInteger(options.limit)
    ? Math.min(Math.max(options.limit, 1), 100) : 25;

  try {
    for (let index = 0; index < limit; index += 1) {
      // Claim just before processing so a slow preceding asset cannot exhaust
      // another asset's lease while it waits within this bounded batch.
      const work = (await dependencies.outbox.claim({ ...options, limit: 1 }))[0];
      if (!work) break;
      result.claimed += 1;
      let failureCode: AssetChangeErrorCode = "asset_lookup_failed";
      try {
        const published = await dependencies.registry.getAssetByStableId(work.stableId, {
          tenantId: work.tenantId, view: "published"
        });
        if (published?.asset.id === work.assetId) {
          failureCode = "asset_index_failed";
          await dependencies.retrieval.indexAsset(published, { assetChangeWork: work });
        } else {
          const current = await dependencies.registry.getAssetByStableId(work.stableId, {
            tenantId: work.tenantId, view: "current"
          });
          failureCode = "asset_index_failed";
          const cleared = await dependencies.retrieval.clearAssetIndex({
            tenantId: work.tenantId, assetId: work.assetId,
            expectedPublishedVersionId: current?.asset.id === work.assetId ? current.asset.publishedVersionId ?? null : null,
            assetChangeWork: work
          });
          if (!cleared) throw new Error("asset_changed_during_reconciliation");
        }
        failureCode = "asset_cache_invalidation_failed";
        await dependencies.cache.invalidateTenant({ tenantId: work.tenantId });
        failureCode = "asset_reconciliation_failed";
        if (await dependencies.outbox.complete(work)) result.completed += 1;
        else result.leaseLost += 1;
      } catch {
        result.errors[failureCode] = (result.errors[failureCode] ?? 0) + 1;
        if (await dependencies.outbox.fail(work, failureCode)) result.retryScheduled += 1;
        else result.leaseLost += 1;
      }
    }
    result.health = await dependencies.outbox.getHealth(options.tenantId);
    return result;
  } catch {
    // Repository/provider exceptions can contain connection strings or content.
    throw new Error("asset_outbox_unavailable");
  }
}

export async function runAssetChangeMaintenance(
  options: AssetChangeClaimOptions = {},
  runtime?: WorkerRuntime
): Promise<AssetChangeReconciliationResult> {
  try {
    return await withWorkerRuntime(runtime, async (_runtime, pool) => reconcileAssetChanges({
      outbox: new PostgresAssetChangeOutboxRepository(pool),
      registry: new PostgresRegistryRepository(pool),
      retrieval: new PostgresRetrievalRepository(pool, undefined, createEmbeddingProviderFromEnv()),
      cache: new PostgresManagedQueryCacheRepository(pool)
    }, options));
  } catch {
    throw new Error("asset_outbox_unavailable");
  }
}

export function logAssetChangeMaintenance(result: AssetChangeReconciliationResult): void {
  console.log(JSON.stringify({ job: "asset-change-reconciliation", ...result }));
}
