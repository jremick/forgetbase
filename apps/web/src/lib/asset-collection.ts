import type { AssetRecord } from "@forgetbase/schema";
import type { AppRequest } from "./app-api.js";

export async function loadAssetCollection(
  request: AppRequest,
  options: { preview?: boolean; authKey?: string; signal?: AbortSignal } = {}
): Promise<AssetRecord[]> {
  const assets = new Map<string, AssetRecord>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "200" });
    if (options.preview) params.set("preview", "true");
    if (cursor) params.set("cursor", cursor);
    const page = await request<{ assets: AssetRecord[]; nextCursor?: string | null; complete?: boolean }>(
      `/assets?${params}`, { signal: options.signal }, options.authKey
    );
    for (const asset of page.assets) assets.set(asset.id, asset);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new Error("Asset listing did not advance. Reload the library.");
    if (page.complete === false && !cursor) throw new Error("Asset listing is incomplete. Reload the library.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...assets.values()];
}
