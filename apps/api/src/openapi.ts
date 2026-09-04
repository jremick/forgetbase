import { forgetBaseVersion } from "@forgetbase/schema";

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "ForgetBase API",
      version: forgetBaseVersion,
      description: "Agent-native instruction registry, permission, retrieval, and export API."
    },
    servers: [
      {
        url: "http://127.0.0.1:3000"
      }
    ],
    security: [
      {
        bearerAuth: []
      }
    ],
    paths: {
      "/health": {
        get: {
          summary: "Liveness check",
          security: [],
          responses: {
            "200": jsonResponse("Service health response")
          }
        }
      },
      "/ready": {
        get: {
          summary: "Database and migration readiness check",
          security: [],
          responses: {
            "200": jsonResponse("Service and dependencies are ready"),
            "503": jsonResponse("Service dependencies are not ready")
          }
        }
      },
      "/auth/bootstrap": {
        post: {
          summary: "Create the first local admin and one-time API key",
          security: [],
          responses: {
            "201": jsonResponse("Created bootstrap admin and API key"),
            "409": jsonResponse("Bootstrap already completed")
          }
        }
      },
      "/auth/login": {
        post: {
          summary: "Authenticate a local user and issue a short-lived API key",
          security: [],
          responses: {
            "201": jsonResponse("Authenticated user and one-time API key"),
            "401": jsonResponse("Invalid credentials")
          }
        }
      },
      "/auth/oidc/authorize": {
        post: {
          summary: "Create an OIDC authorization URL with signed state and PKCE verifier",
          security: [],
          responses: {
            "200": jsonResponse("OIDC authorization URL and client-held verifier"),
            "404": jsonResponse("Auth provider not enabled")
          }
        }
      },
      "/auth/oidc/callback": {
        post: {
          summary: "Exchange an OIDC authorization code, validate the ID token, and issue a short-lived API key",
          security: [],
          responses: {
            "201": jsonResponse("Authenticated external user and one-time API key"),
            "401": jsonResponse("OIDC validation failed"),
            "403": jsonResponse("External user denied")
          }
        }
      },
      "/auth/me": {
        get: {
          summary: "Inspect current API key principal",
          responses: {
            "200": jsonResponse("Authenticated principal")
          }
        }
      },
      "/auth/session/refresh": {
        post: {
          summary: "Rotate a browser login session with the HttpOnly refresh cookie",
          security: [],
          responses: {
            "200": jsonResponse("Refreshed browser login session"),
            "401": jsonResponse("Refresh token missing or invalid")
          }
        }
      },
      "/auth/logout": {
        post: {
          summary: "Revoke the current bearer API key",
          responses: {
            "200": jsonResponse("Revoked current API key"),
            "401": jsonResponse("Authentication required")
          }
        }
      },
      "/auth/sessions": {
        get: {
          summary: "List password/OIDC login sessions",
          parameters: [
            queryParameter("userId", false),
            queryParameter("includeRevoked", false),
            queryParameter("limit", false)
          ],
          responses: {
            "200": jsonResponse("Login sessions"),
            "401": jsonResponse("Authentication required")
          }
        }
      },
      "/auth/sessions/{sessionId}": {
        delete: {
          summary: "Revoke a login session and its underlying login API key",
          parameters: [pathParameter("sessionId")],
          responses: {
            "200": jsonResponse("Revoked login session"),
            "401": jsonResponse("Authentication required"),
            "404": jsonResponse("Session not found")
          }
        }
      },
      "/auth/users": {
        get: {
          summary: "List local users for admins",
          parameters: [queryParameter("limit", false)],
          responses: {
            "200": jsonResponse("Local users")
          }
        },
        post: {
          summary: "Create a local user",
          responses: {
            "201": jsonResponse("Created local user")
          }
        }
      },
      "/auth/users/{userId}": {
        put: {
          summary: "Update a local user's display name, role, status, or password",
          parameters: [pathParameter("userId")],
          responses: {
            "200": jsonResponse("Updated local user"),
            "404": jsonResponse("User not found")
          }
        }
      },
      "/auth/service-accounts": {
        get: {
          summary: "List service accounts for admins",
          parameters: [queryParameter("limit", false)],
          responses: {
            "200": jsonResponse("Service account records")
          }
        },
        post: {
          summary: "Create a service account",
          responses: {
            "201": jsonResponse("Created service account"),
            "409": jsonResponse("Service-account policy limit exceeded")
          }
        }
      },
      "/auth/service-accounts/{serviceAccountId}": {
        put: {
          summary: "Update a service account's name, description, role, or status",
          parameters: [pathParameter("serviceAccountId")],
          responses: {
            "200": jsonResponse("Updated service account"),
            "404": jsonResponse("Service account not found")
          }
        }
      },
      "/admin/service-account-policy": {
        get: {
          summary: "Get service-account policy for admins",
          responses: {
            "200": jsonResponse("Service-account policy")
          }
        },
        put: {
          summary: "Update service-account policy for admins",
          responses: {
            "200": jsonResponse("Updated service-account policy")
          }
        }
      },
      "/auth/api-keys": {
        get: {
          summary: "List tenant API key records for admins",
          parameters: [queryParameter("limit", false)],
          responses: {
            "200": jsonResponse("API key records without raw secrets")
          }
        },
        post: {
          summary: "Create a scoped API key for a local user or service account",
          responses: {
            "201": jsonResponse("Created API key with one-time raw secret"),
            "404": jsonResponse("API key owner not found"),
            "409": jsonResponse("Service-account API-key policy limit exceeded")
          }
        }
      },
      "/auth/api-keys/rotation-due": {
        get: {
          summary: "List API keys that are expired, near expiry, or missing expiry",
          parameters: [
            queryParameter("asOf", false),
            queryParameter("dueWithinDays", false),
            queryParameter("includeUserKeys", false),
            queryParameter("includeRevoked", false),
            queryParameter("limit", false)
          ],
          responses: {
            "200": jsonResponse("API key rotation report without raw secrets"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/auth/api-keys/{apiKeyId}/rotate": {
        post: {
          summary: "Create a replacement API key from an existing key",
          parameters: [pathParameter("apiKeyId")],
          responses: {
            "201": jsonResponse("Created replacement API key with one-time raw secret"),
            "404": jsonResponse("API key not found")
          }
        }
      },
      "/auth/api-keys/{apiKeyId}/revoke": {
        post: {
          summary: "Revoke an API key by ID",
          parameters: [pathParameter("apiKeyId")],
          responses: {
            "200": jsonResponse("Revoked API key record"),
            "404": jsonResponse("API key not found")
          }
        }
      },
      "/auth/groups": {
        get: {
          summary: "List local auth groups for admins",
          parameters: [queryParameter("limit", false)],
          responses: {
            "200": jsonResponse("Group records")
          }
        },
        post: {
          summary: "Create a local auth group",
          responses: {
            "201": jsonResponse("Created group")
          }
        }
      },
      "/auth/groups/{groupId}": {
        delete: {
          summary: "Delete a local auth group and its group grants",
          parameters: [pathParameter("groupId")],
          responses: {
            "200": jsonResponse("Deleted group record"),
            "404": jsonResponse("Group not found")
          }
        }
      },
      "/auth/groups/{groupId}/members": {
        get: {
          summary: "List members for a local auth group",
          parameters: [
            pathParameter("groupId"),
            queryParameter("limit", false)
          ],
          responses: {
            "200": jsonResponse("Group membership records")
          }
        },
        post: {
          summary: "Add a local user to a local auth group",
          parameters: [pathParameter("groupId")],
          responses: {
            "201": jsonResponse("Group membership record"),
            "404": jsonResponse("Group or user not found")
          }
        }
      },
      "/auth/groups/{groupId}/members/{userId}": {
        delete: {
          summary: "Remove a local user from a local auth group",
          parameters: [
            pathParameter("groupId"),
            pathParameter("userId")
          ],
          responses: {
            "200": jsonResponse("Removed group membership record"),
            "404": jsonResponse("Group membership not found")
          }
        }
      },
      "/assets": {
        get: {
          summary: "List published governed assets with permission-aware continuation",
          description: "limit is 1-200. Follow nextCursor until complete=true. Authorization is checked again on every page. preview=true selects editing heads and requires a maintainer/admin with read/write scopes and target grants.",
          parameters: [queryParameter("limit", false), queryParameter("cursor", false), queryParameter("preview", false)],
          responses: {
            "200": jsonResponse("Visible assets, complete flag and nextCursor"),
            "400": jsonResponse("Invalid limit or cursor"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Preview access denied")
          }
        },
        post: {
          summary: "Create a governed asset",
          description: "The authenticated creator receives read and write grants bounded by the key and asset surfaces in the same transaction as asset creation. ownerId remains descriptive ownership metadata, not authorization identity.",
          responses: {
            "201": jsonResponse("Created asset")
          }
        }
      },
      "/assets/review-queue": {
        get: {
          summary: "List governed assets needing review",
          parameters: [
            queryParameter("asOf", false),
            queryParameter("includeApproved", false),
            queryParameter("limit", false)
          ],
          responses: {
            "200": jsonResponse("Assets needing review"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/assets/{stableId}": {
        get: {
          summary: "Fetch the approved published version of a governed asset",
          description: "Ordinary reads return published content and metadata under current access restrictions, without draft history. Set preview=true to read the editing head; preview requires a maintainer or administrator with asset:read and asset:write scopes and current target read and write permission.",
          parameters: [pathParameter("stableId"), queryParameter("preview", false)],
          responses: {
            "200": jsonResponse("Asset detail"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset not found")
          }
        }
      },
      "/assets/{stableId}/attachments": {
        get: {
          summary: "List active attachments for a visible governed asset",
          description: "The asset must be published unless preview=true is supplied by an authorized maintainer or administrator.",
          parameters: [pathParameter("stableId"), queryParameter("preview", false)],
          responses: {
            "200": jsonResponse("Active attachment metadata"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset not found")
          }
        },
        post: {
          summary: "Upload a bounded attachment to a governed asset",
          description: "Publish the current asset version before uploading attachments. Attachments are asset-level resources; they are not versioned draft content. An unpublished editing head returns publication_required.",
          parameters: [
            pathParameter("stableId"),
            headerParameter("x-forgetbase-attachment-filename-encoded", true),
            headerParameter("x-forgetbase-attachment-media-type", true)
          ],
          requestBody: {
            required: true,
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          responses: {
            "201": jsonResponse("Created attachment metadata"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "409": jsonResponse("Publication required, or tenant/principal attachment quota exceeded"),
            "422": jsonResponse("Attachment content or malware scan rejected the file"),
            "429": jsonResponse("Attachment upload rate or concurrency limited"),
            "413": jsonResponse("Attachment exceeds configured byte limit"),
            "415": jsonResponse("Attachment media type not allowed"),
            "503": jsonResponse("Attachment storage or malware scanner unavailable")
          }
        }
      },
      "/assets/{stableId}/attachments/{attachmentId}/download": {
        get: {
          summary: "Download an authorized active attachment",
          description: "The asset must be published unless preview=true is supplied by an authorized maintainer or administrator.",
          parameters: [pathParameter("stableId"), pathParameter("attachmentId"), queryParameter("preview", false)],
          responses: {
            "200": binaryResponse("Attachment content"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset or attachment not found"),
            "503": jsonResponse("Attachment storage unavailable or integrity check failed")
          }
        }
      },
      "/assets/{stableId}/attachments/{attachmentId}": {
        delete: {
          summary: "Delete an attachment and tombstone its metadata",
          description: "Publish the current asset version before deleting attachments. An unpublished editing head returns publication_required.",
          parameters: [pathParameter("stableId"), pathParameter("attachmentId")],
          responses: {
            "200": jsonResponse("Deleted attachment metadata"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset or attachment not found"),
            "409": jsonResponse("Publication required or attachment delete conflict"),
            "503": jsonResponse("Attachment storage unavailable")
          }
        }
      },
      "/admin/attachments/reconcile": {
        post: {
          summary: "Dry-run or execute bounded attachment storage reconciliation",
          responses: {
            "200": jsonResponse("Attachment reconciliation report"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Admin access required"),
            "503": jsonResponse("Attachment reconciliation unavailable")
          }
        }
      },
      "/assets/{stableId}/review": {
        post: {
          summary: "Mark an asset reviewed by updating review metadata",
          description: "Requires a maintainer or administrator with current read and write permission on the request surface. Supply expectedVersionId in the JSON body to require the editing head seen by the caller; a stale base returns 409 without changing content.",
          parameters: [pathParameter("stableId")],
          responses: {
            "200": jsonResponse("Reviewed asset detail"),
            "403": jsonResponse("Access denied"),
            "409": jsonResponse("asset_version_conflict with expectedVersionId and currentVersionId"),
            "404": jsonResponse("Asset not found")
          }
        }
      },
      "/assets/{stableId}/versions": {
        post: {
          summary: "Create a new version for an existing asset",
          description: "Requires a maintainer or administrator with current read and write permission on the request surface. Supply expectedVersionId in the JSON body to require the editing head seen by the caller; a stale base returns 409 without changing content.",
          parameters: [pathParameter("stableId")],
          responses: {
            "200": jsonResponse("Updated asset detail"),
            "403": jsonResponse("Access denied"),
            "409": jsonResponse("asset_version_conflict with expectedVersionId and currentVersionId"),
            "404": jsonResponse("Asset not found")
          }
        }
      },
      "/assets/{stableId}/versions/{versionNumber}": {
        get: {
          summary: "Fetch content for a specific asset version",
          description: "Version history is a preview capability. Requires a maintainer or administrator with asset:read and asset:write scopes and read and write permission under the asset's current access policy.",
          parameters: [
            pathParameter("stableId"),
            pathParameter("versionNumber")
          ],
          responses: {
            "200": jsonResponse("Asset version snapshot"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset or version not found")
          }
        }
      },
      "/assets/{stableId}/versions/by-id/{versionId}": {
        get: {
          summary: "Fetch content for a specific asset version ID",
          description: "Version history is a preview capability. Requires a maintainer or administrator with asset:read and asset:write scopes and read and write permission under the asset's current access policy.",
          parameters: [
            pathParameter("stableId"),
            pathParameter("versionId")
          ],
          responses: {
            "200": jsonResponse("Asset version snapshot"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset or version not found")
          }
        }
      },
      "/assets/{stableId}/publish": {
        post: {
          summary: "Publish an asset by setting it active and approved",
          description: "Requires a maintainer or administrator with current read and write permission on the request surface. Supply expectedVersionId in the JSON body to require the editing head seen by the caller; a stale base returns 409 without changing content.",
          parameters: [pathParameter("stableId")],
          responses: {
            "200": jsonResponse("Published asset detail"),
            "403": jsonResponse("Access denied"),
            "409": jsonResponse("asset_version_conflict with expectedVersionId and currentVersionId"),
            "404": jsonResponse("Asset not found")
          }
        }
      },
      "/assets/{stableId}/restore": {
        post: {
          summary: "Restore earlier content into a new draft version",
          description: "Requires a maintainer or administrator with current read and write permission on the request surface. Preserves current access restrictions and the previous published version; publish the restored draft explicitly to serve it to ordinary consumers. Supply expectedVersionId in the JSON body to require the editing head seen by the caller; a stale base returns 409 without changing content.",
          parameters: [pathParameter("stableId")],
          responses: {
            "200": jsonResponse("Restored asset detail"),
            "403": jsonResponse("Access denied"),
            "409": jsonResponse("asset_version_conflict with expectedVersionId and currentVersionId"),
            "404": jsonResponse("Asset or version not found")
          }
        }
      },
      "/assets/{stableId}/grants": {
        get: {
          summary: "List current asset grants with a continuation cursor (permission administrators)",
          parameters: [pathParameter("stableId"), queryParameter("limit", false), queryParameter("cursor", false)],
          responses: {
            "200": jsonResponse("Permission grants and nullable nextCursor"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset not found")
          }
        },
        post: {
          summary: "Grant document-level asset permission to a user, group, or service account",
          description: "A 201 response confirms the grant committed. reconciliation.status=pending identifies cache or audit follow-up that requires operator reconciliation; it does not undo the grant.",
          parameters: [pathParameter("stableId")],
          responses: {
            "201": jsonResponse("Permission grant"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset not found")
          }
        }
      },
      "/assets/{stableId}/grants/{grantId}": {
        delete: {
          summary: "Revoke a current grant scoped to this tenant and asset (permission administrators)",
          description: "A 200 response confirms revocation committed. reconciliation.status=pending identifies cache or audit follow-up that requires operator reconciliation; subsequent access checks already use the revoked state.",
          parameters: [pathParameter("stableId"), pathParameter("grantId")],
          responses: {
            "200": jsonResponse("Revoked permission grant"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Asset or permission grant not found")
          }
        }
      },
      "/validation/assets": {
        post: {
          summary: "Validate governed asset payloads",
          responses: {
            "200": jsonResponse("Asset validation report"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/search": {
        get: {
          summary: "Search permission-filtered retrieval chunks with citations",
          security: [],
          parameters: [
            queryParameter("query", true),
            queryParameter("strategy", false),
            queryParameter("limit", false)
          ],
          responses: {
            "200": jsonResponse("Search response")
          }
        }
      },
      "/agent/query": {
        post: {
          summary: "Run managed query over permission-filtered governed context",
          security: [],
          responses: {
            "200": jsonResponse("Managed query response with answer draft, citations, and generation metadata"),
            "401": jsonResponse("Authentication required for provider-routed mode when auth is configured")
          }
        }
      },
      "/agent/query/feedback": {
        get: {
          summary: "List managed query feedback for admins",
          parameters: [queryParameter("limit", false)],
          responses: {
            "200": jsonResponse("Managed query feedback records")
          }
        },
        post: {
          summary: "Submit managed query outcome and quality feedback",
          responses: {
            "201": jsonResponse("Managed query feedback record"),
            "401": jsonResponse("Authentication required")
          }
        }
      },
      "/agent/evals/runs": {
        get: {
          summary: "List recent managed query eval runs for admins",
          parameters: [queryParameter("limit", false)],
          responses: {
            "200": jsonResponse("Managed query eval run records"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/agent/evals/summary": {
        get: {
          summary: "Summarize recent managed query eval run trends for admins",
          parameters: [
            queryParameter("since", false),
            queryParameter("until", false),
            queryParameter("limit", false)
          ],
          responses: {
            "200": jsonResponse("Managed query eval analytics summary"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/agent/evals/run": {
        post: {
          summary: "Run deterministic managed query eval cases with optional pass-rate thresholds",
          responses: {
            "200": jsonResponse("Managed query eval report"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/agent/actions": {
        get: {
          summary: "List tenant agent action requests for admins",
          parameters: [queryParameter("limit", false)],
          responses: {
            "200": jsonResponse("Agent action request records"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/agent/actions/execute": {
        post: {
          summary: "Submit an agent action request through tenant execution policy",
          responses: {
            "200": jsonResponse("Existing idempotent agent action request record"),
            "201": jsonResponse("Agent action request record"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "429": jsonResponse("Action request rate limit exceeded")
          }
        }
      },
      "/agent/actions/{actionRequestId}/decision": {
        post: {
          summary: "Approve or deny an agent action request awaiting approval",
          parameters: [pathParameter("actionRequestId")],
          responses: {
            "200": jsonResponse("Agent action request record"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Action request not found"),
            "409": jsonResponse("Action request is not awaiting approval or approval expired")
          }
        }
      },
      "/admin/action-execution-policy": {
        get: {
          summary: "Get tenant action execution policy for admins",
          responses: {
            "200": jsonResponse("Action execution policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update tenant action execution policy for admins",
          responses: {
            "200": jsonResponse("Action execution policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/retrieval-ranking-policy": {
        get: {
          summary: "Get tenant retrieval ranking policy for admins",
          responses: {
            "200": jsonResponse("Retrieval ranking policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update tenant retrieval ranking policy for admins",
          responses: {
            "200": jsonResponse("Retrieval ranking policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/secret-reference-policy": {
        get: {
          summary: "Get env-var secret reference policy for provider and auth configs",
          responses: {
            "200": jsonResponse("Secret reference policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update env-var secret reference policy",
          responses: {
            "200": jsonResponse("Secret reference policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/pii-redaction-policy": {
        get: {
          summary: "Get tenant PII redaction policy for telemetry, feedback, eval-run queries, and cache bypass",
          responses: {
            "200": jsonResponse("PII redaction policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update tenant PII redaction policy",
          responses: {
            "200": jsonResponse("PII redaction policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/model-providers": {
        get: {
          summary: "List admin-managed model provider configurations",
          responses: {
            "200": jsonResponse("Model provider configurations"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/model-providers/health": {
        get: {
          summary: "List model provider readiness without exposing secret values",
          responses: {
            "200": jsonResponse("Model provider readiness"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/model-providers/{provider}": {
        put: {
          summary: "Create or update a model provider configuration without storing secrets",
          parameters: [pathParameter("provider")],
          responses: {
            "200": jsonResponse("Model provider configuration"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/auth-providers": {
        get: {
          summary: "List admin-managed external auth provider configurations",
          responses: {
            "200": jsonResponse("External auth provider configurations"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/auth-providers/{provider}": {
        put: {
          summary: "Create or update an external auth provider configuration without storing client secrets",
          parameters: [pathParameter("provider")],
          responses: {
            "200": jsonResponse("External auth provider configuration"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/telemetry-retention": {
        get: {
          summary: "Get telemetry retention policy for admins",
          responses: {
            "200": jsonResponse("Telemetry retention policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update telemetry retention policy for admins",
          responses: {
            "200": jsonResponse("Telemetry retention policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/telemetry-retention/purge": {
        post: {
          summary: "Dry-run or execute telemetry retention purge for admins",
          responses: {
            "200": jsonResponse("Telemetry retention purge result"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/managed-query-policy": {
        get: {
          summary: "Get tenant managed-query policy for admins",
          responses: {
            "200": jsonResponse("Managed-query policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update tenant managed-query policy for admins",
          responses: {
            "200": jsonResponse("Managed-query policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/managed-query-eval-schedule-policy": {
        get: {
          summary: "Get tenant managed-query eval schedule policy for admins",
          responses: {
            "200": jsonResponse("Managed-query eval schedule policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update tenant managed-query eval schedule policy for admins",
          responses: {
            "200": jsonResponse("Managed-query eval schedule policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/managed-query-cache": {
        get: {
          summary: "List safe managed-query cache metadata for admins",
          responses: {
            "200": jsonResponse("Managed-query cache metadata"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/managed-query-cache/policy": {
        get: {
          summary: "Get tenant managed-query cache policy for admins",
          responses: {
            "200": jsonResponse("Managed-query cache policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update tenant managed-query cache policy for admins",
          responses: {
            "200": jsonResponse("Managed-query cache policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/managed-query-cache/{cacheKey}": {
        delete: {
          summary: "Delete one managed-query cache entry for admins",
          parameters: [pathParameter("cacheKey")],
          responses: {
            "200": jsonResponse("Deleted managed-query cache metadata"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied"),
            "404": jsonResponse("Cache entry not found")
          }
        }
      },
      "/admin/managed-query-cache/purge": {
        post: {
          summary: "Dry-run or execute expired managed-query cache purge for admins",
          responses: {
            "200": jsonResponse("Managed-query cache purge result"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/admin/managed-query-retention/policy": {
        get: {
          summary: "Get tenant managed-query prompt/response retention policy for admins",
          responses: {
            "200": jsonResponse("Managed-query retention policy"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        },
        put: {
          summary: "Create or update tenant managed-query prompt/response retention policy for admins",
          responses: {
            "200": jsonResponse("Managed-query retention policy"),
            "400": jsonResponse("Validation error"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      },
      "/exports/ai-package": {
        get: {
          summary: "Generate permission-filtered AI export package",
          description: "Exports only published versions under current export grants and asset policy. limit is 1-10000 (default 10000). Follow nextCursor when complete=false. A content revision change during or between pages returns export_changed_retry; discard partial pages and restart. Grants are checked on each request.",
          security: [],
          parameters: [
            queryParameter("package", false),
            queryParameter("format", false),
            queryParameter("okfVersion", false),
            queryParameter("limit", false),
            queryParameter("cursor", false)
          ],
          responses: {
            "200": jsonResponse("AI export package, complete flag and nextCursor"),
            "400": jsonResponse("Invalid export parameters or cursor"),
            "409": jsonResponse("Content changed; restart the export")
          }
        }
      },
      "/audit/events": {
        get: {
          summary: "List audit events for admins",
          responses: {
            "200": jsonResponse("Audit events")
          }
        }
      },
      "/telemetry/retrieval-events": {
        get: {
          summary: "List retrieval telemetry events for admins",
          responses: {
            "200": jsonResponse("Retrieval telemetry events")
          }
        }
      },
      "/telemetry/summary": {
        get: {
          summary: "Get recent-window telemetry analytics summary for admins",
          parameters: [
            queryParameter("since", false),
            queryParameter("until", false),
            queryParameter("limit", false)
          ],
          responses: {
            "200": jsonResponse("Telemetry analytics summary"),
            "401": jsonResponse("Authentication required"),
            "403": jsonResponse("Access denied")
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        }
      }
    }
  };
}

function pathParameter(name: string) {
  return {
    name,
    in: "path",
    required: true,
    schema: {
      type: "string"
    }
  };
}

function queryParameter(name: string, required: boolean) {
  return {
    name,
    in: "query",
    required,
    schema: {
      type: "string"
    }
  };
}

function headerParameter(name: string, required: boolean) {
  return {
    name,
    in: "header",
    required,
    schema: {
      type: "string"
    }
  };
}

function jsonResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object"
        }
      }
    }
  };
}

function binaryResponse(description: string) {
  return {
    description,
    content: {
      "application/octet-stream": {
        schema: {
          type: "string",
          format: "binary"
        }
      }
    }
  };
}
