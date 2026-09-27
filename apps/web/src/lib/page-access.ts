import type {
  GroupListResponse,
  LocalUserListResponse,
  PermissionAction,
  PermissionGrant,
  PermissionGrantCreateInput,
  PermissionGrantListResponse,
  PermissionGrantMutationResponse,
  PermissionPrincipalType,
  Surface
} from "@forgetbase/schema";
import type { AppRequest } from "./app-api.js";

export const grantSurfaceOptions: Surface[] = ["web", "api", "cli", "mcp", "export"];

export function pageAccessError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/^401\b/.test(message)) return "Your session expired. Sign in again to manage page access.";
  if (/^403\b/.test(message)) return "Your account cannot perform this access operation.";
  if (/^400\b/.test(message)) return "The grant was rejected. Check the principal ID, permission, and selected surfaces.";
  if (/^404\b/.test(message)) return "The page or grant is no longer available. Refresh page access.";
  if (/^5\d\d\b/.test(message) || /API request failed/.test(message)) return "Page access is temporarily unavailable. Try again.";
  return message;
}

export async function loadPageGrants(request: AppRequest, pageId: string, signal?: AbortSignal): Promise<PermissionGrant[]> {
  const grants = new Map<string, PermissionGrant>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const page = await request<PermissionGrantListResponse>(`/assets/${encodeURIComponent(pageId)}/grants?${params}`, { signal });
    for (const grant of page.grants) grants.set(grant.id, grant);
    cursor = page.nextCursor;
    if (cursor && seenCursors.has(cursor)) throw new Error("The grant list did not complete. Refresh page access.");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return [...grants.values()];
}

export async function loadGrantPrincipals(request: AppRequest, signal?: AbortSignal) {
  const [users, groups] = await Promise.allSettled([
    request<LocalUserListResponse>("/auth/users?limit=200", { signal }),
    request<GroupListResponse>("/auth/groups?limit=200", { signal })
  ]);
  return {
    users: users.status === "fulfilled" ? users.value.users : [],
    groups: groups.status === "fulfilled" ? groups.value.groups : [],
    errors: [
      ...(users.status === "rejected" ? [`People: ${pageAccessError(users.reason)}`] : []),
      ...(groups.status === "rejected" ? [`Groups: ${pageAccessError(groups.reason)}`] : [])
    ],
    mayBeIncomplete: (users.status === "fulfilled" && users.value.users.length === 200) ||
      (groups.status === "fulfilled" && groups.value.groups.length === 200)
  };
}

export type PageGrantDraft = {
  principalType: PermissionPrincipalType;
  principalId: string;
  action: PermissionAction;
  surfaces: Surface[];
};

export function pageGrantPayload(draft: PageGrantDraft, allowedSurfaces: Surface[]): Omit<PermissionGrantCreateInput, "stableId" | "tenantId" | "createdBy"> {
  const principalId = draft.principalId.trim();
  if (!principalId) throw new Error("Choose a person or group, or enter a principal ID.");
  const surfaces = [...new Set(draft.surfaces)].filter((surface) => allowedSurfaces.includes(surface));
  if (!surfaces.length) throw new Error("Choose at least one surface allowed for this page.");
  return { principalType: draft.principalType, principalId, action: draft.action, surfaces };
}

export function grantMutationMessage(result: PermissionGrantMutationResponse, action: "saved" | "revoked"): string {
  return result.reconciliation?.status === "pending"
    ? `Grant ${action}. The server is still completing ${result.reconciliation.pendingActions.join(" and ")}. Refresh before relying on this change.`
    : `Grant ${action}. The grant list has been refreshed.`;
}
