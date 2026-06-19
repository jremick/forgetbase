# Secure Default Option C Report

Status: implemented contextual deployment-default check
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Summary

Implemented secure-default Option C as a deterministic deployment-posture check instead of a broad auth rewrite.

Local OSS bootstrap remains workable. Public deployment review now has an explicit package script:

```bash
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

The script passes local defaults while checking public template guardrails. When `FORGETBASE_PUBLIC_DEPLOYMENT=true`, it requires explicit public settings for authentication, secure browser cookies, public entrypoint shape, HTTPS CORS origins, and safe direct service binds where relevant.

## Files Inspected

- `work/beta-execution/integration-checkpoint-1.md`
- `work/beta-execution/integration-checkpoint-3.md`
- `work/beta-execution/trust-gates-design.md`
- `work/beta-execution/runtime-smoke-leakage-report.md`
- `docs/SECURITY_MODEL.md`
- `docs/DEVELOPMENT.md`
- `docs/runbooks/DEPLOY_DOCKER_COMPOSE.md`
- `docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md`
- `compose.yaml`
- `compose.same-origin.yaml`
- `compose.tls.yaml`
- `infra/docker/nginx.same-origin.conf`
- `infra/docker/nginx.tls.conf`
- `infra/docker/nginx.railway-proxy.conf.template`
- `apps/api/src/server.ts`
- `package.json`

## Files Changed

- `scripts/check-deployment-security.ts`
  - Adds the deterministic deployment-default check.
  - Verifies the public proxy/template posture without reading secrets or mutating runtime state.
  - Keeps the default local context compatible with first-run OSS bootstrap.
- `package.json`
  - Adds `security:check-deployment-defaults`.
- `docs/DEVELOPMENT.md`
  - Adds the local check to development verification.
- `docs/SECURITY_MODEL.md`
  - Documents the contextual secure-default review posture.
- `docs/runbooks/DEPLOY_DOCKER_COMPOSE.md`
  - Adds the check to post-health deployment checks.
- `docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md`
  - Preserves the public Railway requirements used by the check.
- `work/beta-execution/secure-default-option-c-report.md`
  - Adds this report.

## Decision

Do not flip global auth defaults in this lane.

Reason: the accepted Option C posture keeps local direct API/Compose bootstrap workable while making public deployment posture explicit. A global default-auth change would require a setup-token or installer path and would risk breaking first-run OSS usability. A deterministic public-context check is the smallest beta-safe improvement.

## Verification

Default local-context check:

```bash
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

Result: passed with 14 checks, including local Compose bind clarity, same-origin proxy presence, TLS secure-cookie overlay, Railway bootstrap blocking, Railway auth/secure-cookie docs, and global require-auth bootstrap behavior.

Public Railway-style happy path:

```bash
FORGETBASE_PUBLIC_DEPLOYMENT=true \
FORGETBASE_REQUIRE_AUTHENTICATION=true \
FORGETBASE_SESSION_COOKIE_SECURE=true \
FORGETBASE_PUBLIC_ENTRYPOINT=railway-proxy \
FORGETBASE_CORS_ALLOWED_ORIGINS=https://cms.example.com \
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

Result: passed with 18 checks, including public auth, secure-cookie, entrypoint, HTTPS CORS-origin, and proxy-only expectations.

Manager will still rerun `openapi:check`, `claims:lint`, and `smoke:compose` during checkpoint integration.

## Remaining Gaps

- Public exposure still requires operator review of real domains, TLS, auth env settings, and proxy-only topology.
- A future setup-token or installer flow could support stronger runtime defaults without weakening first-run usability.
- CI does not run the public-context check because public deployment settings are environment-specific.
