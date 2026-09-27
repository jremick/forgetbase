# Beta.4 security hardening

This iteration addresses four patterns found by the first CodeQL analysis:

- Bound API requests before body parsing and database-backed authentication,
  including unknown routes. Use `@fastify/rate-limit` 11.2.0, which includes the
  [IPv6 normalization fix](https://github.com/fastify/fastify-rate-limit/security/advisories/GHSA-grpc-p53c-r64v).
- Keep browser bearer keys in tab memory shared by reader and admin. Clear legacy
  localStorage keys. Same-origin login continues to use HttpOnly cookies.
- Escape original backslashes before Markdown link-label brackets in OKF exports.
- Remove embedding endpoint trailing slashes with a linear scan.

Tests cover pre-authentication and pre-body rejection, unknown routes, forwarded
header spoofing, IPv6 rotation, window expiry, configuration bounds, separate
readiness limits, browser credential lifetime, crafted export labels and long
URL prefixes. Browser UAT checks navigation, persistent-storage removal and
reload behavior. Provider URL tests use an in-process fetch fixture.

The initial scan reported 89 instances of the API limiter gap, two browser
persistence instances, two Markdown escaping instances and one URL regex.
Release evidence must include a completed scan of the final source and the
current alert readback; a passing settings check alone is insufficient.

## Reviewed false positives

These four initial findings do not call for algorithm changes:

| Alert | Source and assessment |
| --- | --- |
| [96](https://github.com/jremick/forgetbase/security/code-scanning/96) | `packages/db/src/auth.ts`: `hashApiKeySecret` fingerprints a token generated with 32 random bytes. Passwords use a separate salted scrypt function and timing-safe verification. |
| [95](https://github.com/jremick/forgetbase/security/code-scanning/95) | `apps/worker/src/index.ts`: the SHA-256 operation is an HMAC of a webhook body with a signing secret, not password storage. |
| [94](https://github.com/jremick/forgetbase/security/code-scanning/94) | `apps/api/src/server.ts`: `sha256` constructs managed-query cache identity and optional prompt/response metadata fingerprints. It does not derive a password verifier. |
| [93](https://github.com/jremick/forgetbase/security/code-scanning/93) | `scripts/check-public-beta-release-proof.ts`: substring matching rejects placeholder evidence. It is deliberately conservative and does not authorize a URL host. |

These assessments apply to the reviewed call paths. They do not exempt future
uses of these helpers from security review.
