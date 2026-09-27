# Container security review — 5 September 2026

The beta.5 release review added OS-package scanning with Trivy 0.72.0 and a fresh vulnerability database. The scanner inspected Linux amd64 images. These results supplement the application review and pnpm audit; they do not attest every Railway-built layer or runtime architecture.

## Changes

- Node 22.23.2 build and runtime stages upgrade the existing `libcrypto3` and `libssl3` packages to at least Alpine `3.5.8-r0`. The patched base layer reports zero OS-package findings, down from 20. The distribution repository and image digest stay pinned; the minimum package versions permit later security patches. Source archives remain reproducible, while resolved container packages and image bytes can change.
- Nginx stays on 1.30.4 and uses the official `alpine-slim` image, pinned by digest. It omits unused optional-module libraries, including the flagged `libuuid` dependency. The image reports zero OS-package findings, down from eight. Nginx, `envsubst`, and the existing non-root account were verified. The larger image's advertised fixed `libuuid` version was unavailable in its amd64 repository during verification.
- Compose uses the refreshed official PostgreSQL 17/pgvector digest. It reports 409 findings, down from 416. This is a patch within the same database major version. No application schema changes are added.

## Remaining upstream advisories

| Image | Critical | High | Medium | Low | Unknown | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Updated PostgreSQL 17/pgvector | 15 | 71 | 160 | 153 | 10 | 409 |
| Pinned ClamAV 1.5.4 Debian 13 slim | 4 | 56 | 72 | 95 | 13 | 240 |

These are scanner package/advisory records, including repeated source-package findings. They are not 649 demonstrated application exploits. No stable-distribution fix is listed for the high or critical records in these two images. Six lower-severity PostgreSQL-image records still have a listed fix; the refreshed upstream image has not incorporated those packages. No advisory suppressions were added.

The Debian tracker gives narrower assessments for several critical-labelled records:

- [CVE-2026-8376](https://security-tracker.debian.org/tracker/CVE-2026-8376) requires attacker-controlled Perl regular expressions on a 32-bit build; the scan target is amd64.
- [CVE-2026-13221](https://security-tracker.debian.org/tracker/CVE-2026-13221) concerns very large Perl alternations. ForgetBase does not route user input to Perl regex compilation.
- [CVE-2026-42496](https://security-tracker.debian.org/tracker/CVE-2026-42496) concerns Perl Archive::Tar extraction. ForgetBase does not use that extractor for uploaded files or recovery archives.
- [CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653) is a libxml2 denial-of-service issue that Debian classifies as minor/deferred for these stable distributions. XML processing in dependency services remains a residual risk.

This review does not establish that every remaining advisory is unreachable. The database and scanner remain on private networks, scanning stays required, and attachment input, expansion and execution time remain bounded. Do not interpret a zero pnpm audit or passing release proof as a zero-vulnerability container claim. The release assets retain scan summaries and raw OS scan reports. Reassess these records when upstream images or stable security packages change.
