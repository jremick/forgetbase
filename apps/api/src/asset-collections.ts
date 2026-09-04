import type { AuthRepository, RegistryRepository } from "@forgetbase/db";
import type { AssetRecord, AuthPrincipal, Surface } from "@forgetbase/schema";

type CollectionContext = {
  registryRepository: RegistryRepository;
  authRepository?: AuthRepository;
  principal: AuthPrincipal | null;
  surface: Surface;
  view?: "current" | "published";
  action?: "read" | "export";
  packageName?: string;
};

export class InvalidAssetCursorError extends Error {
  constructor() { super("Invalid asset cursor"); }
}

function cursorContext(input: CollectionContext) {
  return {
    tenantId: input.principal?.tenantId ?? "tenant_demo",
    surface: input.surface,
    view: input.view ?? "published",
    action: input.action ?? "read",
    packageName: input.packageName ?? null
  };
}

function decodeCursor(value: string | undefined, input: CollectionContext): string | undefined {
  if (!value) return undefined;
  if (value.length > 4096) throw new InvalidAssetCursorError();
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const context = cursorContext(input);
    if (parsed.version !== 1 || typeof parsed.after !== "string" || !parsed.after ||
        Object.entries(context).some(([key, field]) => parsed[key] !== field)) {
      throw new InvalidAssetCursorError();
    }
    return parsed.after;
  } catch {
    throw new InvalidAssetCursorError();
  }
}

function encodeCursor(after: string, input: CollectionContext): string {
  return Buffer.from(JSON.stringify({ version: 1, ...cursorContext(input), after })).toString("base64url");
}

/** Scan bounded storage pages until the requested number of eligible assets exists.
 * Cursor positions are stable IDs, never offsets in an authorization-filtered set.
 * Every continuation is authorized again against current grants.
 */
export async function readAccessibleAssetPage(input: CollectionContext & { limit: number; cursor?: string }) {
  let afterStableId = decodeCursor(input.cursor, input);
  const assets: AssetRecord[] = [];
  let deniedCount = 0;
  while (true) {
    const batch = await input.registryRepository.listAssets({
      tenantId: input.principal?.tenantId,
      view: input.view ?? "published",
      limit: 200,
      afterStableId
    });
    if (!batch.length) return { assets, deniedCount, nextCursor: null, complete: true };
    const eligible = input.packageName
      ? batch.filter((asset) => asset.allowedExports.includes(input.packageName!))
      : batch;
    let permitted = input.authRepository
      ? await input.authRepository.filterAccessibleAssets({
          principal: input.principal, assets: eligible, action: input.action ?? "read", surface: input.surface
        })
      : eligible;
    if (input.view === "current" && input.authRepository) {
      permitted = await input.authRepository.filterAccessibleAssets({
        principal: input.principal, assets: permitted, action: "write", surface: input.surface
      });
    }
    deniedCount += eligible.length - permitted.length;
    for (const asset of permitted) {
      if (assets.length === input.limit) {
        return { assets, deniedCount, nextCursor: encodeCursor(assets.at(-1)!.stableId, input), complete: false };
      }
      assets.push(asset);
    }
    afterStableId = batch.at(-1)!.stableId;
    if (batch.length < 200) return { assets, deniedCount, nextCursor: null, complete: true };
  }
}

export async function readAllAccessibleAssets(input: CollectionContext): Promise<AssetRecord[]> {
  const assets: AssetRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await readAccessibleAssetPage({ ...input, cursor, limit: 200 });
    assets.push(...page.assets);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return assets;
}
