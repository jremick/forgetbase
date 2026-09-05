# Security review — 5 September 2026

Reviewed GitHub main at `cf6e368adc9897c99c537c8ff3debd9ca12612c5` and fixed six confirmed security gaps for `v0.1.0-beta.5`. This document records the source review and local verification before publication. The release assets record subsequent CI, deployment and release verification.

## Scope and trust boundaries

The review covered the API, authentication and session lifecycle, tenant/asset/surface permissions, retrieval and exports, SDK/CLI/MCP callers, attachment inspection and storage, worker notifications, browser credential storage and Markdown rendering, locked dependencies, secret handling, and Compose/proxy/CI configuration. It included a route inventory of 92 API registrations, source review, targeted exploit fixtures, the existing PostgreSQL tests, and disposable proxy containers.

Protected data includes passwords, API/provider keys, OIDC client secrets, login/refresh tokens, private governed content, attachments, and query text. Relevant attackers are unauthenticated callers, authenticated users without grants, a malicious browser origin, an untrusted upload author, or a remote service that responds with malicious metadata or redirects. Deployment administrators still control trusted provider endpoints and environment secrets; this review does not establish a hosted multi-tenant security boundary.

## Confirmed findings and fixes

Severity describes the demonstrated impact and prerequisites. These are application findings, not new CVE assignments.

| ID | Severity | Finding and exposure | Fix and evidence |
| --- | --- | --- | --- |
| SEC-01 | Medium | Credential-bearing outbound requests followed redirects. A configured endpoint returning 307/308 could forward an SDK login password, OIDC client secret, private model/embedding input, or signed worker notification to another recipient. Anthropic's custom API-key header also travels with redirected requests. | SDK, model, embedding, OIDC and worker requests reject redirects. Real loopback HTTP fixtures confirm the second recipient receives zero requests. The worker test runs through the PostgreSQL maintenance path. |
| SEC-02 | Medium | OIDC discovery trusted the returned issuer and endpoint URLs without comparing the issuer to configuration or enforcing safe transport. Signed ID tokens without `exp` or `iat` were accepted. Exploitation requires a bad provider configuration, altered discovery data, or issuance of malformed signed tokens. | Discovery requires an exact configured issuer, HTTPS endpoints without embedded credentials/fragments, and bounded discovery/token reads. HTTP is restricted to loopback development issuers. JWT validation requires subject, nonce, issued-at and expiry claims, and anchors issuer validation to configuration. Real RSA-signed token tests cover valid login, missing claims, expiry, wrong audience, issuer and nonce. |
| SEC-03 | Medium | API request logs stored raw search query strings. Unhandled repository/provider exception messages appeared in both API responses and logs. Nginx's inherited access log also recorded queries and referrers. | API logs use safe request/error serializers; unexpected errors return stable codes without exception text. Embedding failures discard remote error bodies. Each proxy server explicitly overrides inherited logs with a format excluding queries, headers and referrers. All three proxy configurations passed real container logging checks. |
| SEC-04 | Low | A disallowed browser origin could invoke session refresh because the CORS check rejected preflight only. A same-site untrusted origin could cause credential rotation even though it could not read the response. | Disallowed origins are rejected on unsafe methods before session mutation. Approved origins and originless API clients retain their paths. Same-origin Compose defaults now include its local browser origins. Tests prove that rejected refresh attempts do not consume the token and a subsequent approved refresh succeeds. |
| SEC-05 | Medium | Office attachment inspection searched raw ZIP bytes for filenames and `vbaProject.bin`. It accepted a counterfeit ZIP and missed macro declarations in compressed metadata or renamed VBA parts. Reader exposure requires an authorized uploader and opening the downloaded file; malware scanning remains an additional control. | Bounded ZIP directory inspection validates names, local/directory agreement, supported compression and metadata CRCs. It reads bounded content-type/relationship XML and rejects macro markers, including XML character references and UTF-16 metadata. An independent Python ZIP fixture is accepted before the fix and rejected afterward; a valid non-macro document remains accepted. |
| SEC-06 | Medium | The globally registered binary parser accepted attachment-sized bodies on unrelated or unknown routes without the upload concurrency gate. This increased pre-authentication memory exposure. | Only the registered attachment-upload route accepts `application/octet-stream`. Other routes reject it during `onRequest`, before parsing or authentication. Regression tests cover both a public auth route and an unknown route. |

OIDC issuer matching and TLS restrictions follow [OpenID Connect Discovery validation](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationValidation). Required ID-token fields follow [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html#IDToken). The redirect tests exercise the body-forwarding behavior defined by the [Fetch redirect algorithm](https://fetch.spec.whatwg.org/#http-redirect-fetch).

ZIP inspection uses the [PKWARE ZIP directory format](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) and Node's [bounded raw inflation](https://nodejs.org/api/zlib.html#zlibinflaterawsyncbuffer-options). It does not extract archive paths or decompress document/media bodies. No new dependencies were added.

## Verification

- Baseline: **457 tests passed**, including PostgreSQL tests, on the reviewed main commit.
- Final: **492 tests passed** with no skips, against a disposable PostgreSQL 17/pgvector instance. This includes 26 cross-component security tests and 9 new Office archive tests.
- Workspace typecheck and production build passed. The existing web bundle-budget gate passed.
- OpenAPI inventory passed: 90 documented routes plus 2 explicit meta-route exceptions.
- Deployment-default gate passed all 36 checks, including resolved public and TLS Compose settings. This is configuration verification, not a deployed-state attestation.
- Real same-origin, TLS and Railway-template Nginx containers returned the expected responses while retaining safe access logs and excluding synthetic query, authorization, cookie and referrer markers.
- Fresh main dependency audit: **0 known vulnerabilities** across 471 dependency records. Main already used Fastify 5.12.1 and `qs` 6.16.0; the four advisories initially found on the saved feature branch do not apply to this review base.
- Current source secret scan: **0 findings**. Local Git history scanning examined 73 commits and found two synthetic test literals on the separate local-runtime branch; neither is a live credential. No scan suppressions or history rewrites were added.
- At the source-review checkpoint, GitHub readback found no open Dependabot, CodeQL or secret-scanning alerts. The latest completed CodeQL analysis covered the reviewed main commit; patch analysis was still pending.
- `git diff --check` passed.

Durable regression coverage is in [security-boundaries.test.ts](../scripts/security-boundaries.test.ts) and [openxml-inspection.test.ts](../apps/api/src/openxml-inspection.test.ts). Local raw evidence is retained under the ignored `work/security-review/` directory.

## Compatibility and remaining limits

- Provider/API URLs must point directly to their final endpoint; automatic redirects are rejected. OIDC deployments must configure the exact issuer and use HTTPS outside loopback development.
- Office uploads support ordinary single-disk ZIP files with stored/deflated entries. Encrypted, ZIP64, ambiguous or unsupported archives are rejected. Limits are 10,000 entries, 100 MiB of declared expanded content, and 1 MiB of inspected XML metadata. This is a conservative macro filter, not a complete Office document validator or a replacement for ClamD.
- Unexpected API errors expose stable codes rather than upstream diagnostics. Proxy error logs retain critical failures; request status and byte counts remain available in access logs. Operators should keep custom log collectors from reintroducing raw query or credential capture.
- This was a source and isolated-runtime review. Production configuration, infrastructure/network penetration tests, live identity-provider compatibility, actual ClamAV signature freshness, and container OS CVE scanning were not performed. No local container vulnerability scanner was available.
- Existing authorization, published-version isolation, CSRF, session revocation, storage traversal, attachment quotas/scanner-failure handling, and SDK/CLI/MCP contract tests passed. Passing these checks does not prove the absence of all vulnerabilities.

Release verification must include GitHub CodeQL for the patched source and the documented authenticated UAT and recovery gates. Report container scanning coverage explicitly in the release evidence.
