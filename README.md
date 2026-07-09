# ForgetBase

ForgetBase is a self-hosted knowledge base for people and AI tools.

Teams can write and organize knowledge once. People get a clean reading UI. AI tools can search the same knowledge, cite sources, and use only the content they are allowed to see.

## Current Status

This private repository is being prepared for public beta through controlled live user testing. The current release target is documented in [Public Beta Goal](docs/PUBLIC_BETA_GOAL.md), and the pre-release testing boundary is documented in [Private Live UAT](docs/PRIVATE_LIVE_UAT.md).

Expected public beta limits:

- API routes, CLI flags, MCP tool names, and package boundaries may change.
- The reader UI is the default product experience; the admin console is for managing content, access, exports, and system settings.
- Supported trial paths and volatile surfaces are documented in [Public Beta Compatibility](docs/PUBLIC_BETA_COMPATIBILITY.md).
- Full quality-based orchestration, external side-effecting action adapters, connector credential governance, SCIM, hosted service features, and advanced analytics are future work.
- Current packages are private workspace packages; no npm publishing workflow is defined yet.
- Repository visibility, tags, and releases remain unchanged until explicit owner approval after the private-live evidence gates pass.

## Quick Start

Prerequisites: Node.js 22, Docker, and Docker Compose.

```bash
npx -y pnpm@11.7.0 install
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 build
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
docker compose -f compose.yaml -f compose.same-origin.yaml up --build -d postgres api worker web proxy
for attempt in $(seq 1 30); do
  curl --silent --show-error --fail http://127.0.0.1:3000/health && break
  if [ "$attempt" = "30" ]; then exit 1; fi
  sleep 1
done
```

Create a local admin key, import the demo corpus, and try a public search:

```bash
bootstrap_json="$(mktemp)"
curl --silent --show-error --fail \
  -H "content-type: application/json" \
  --data '{"tenantId":"tenant_demo","email":"admin@example.test","displayName":"Admin","password":"local-dev-password","keyName":"local-beta-admin"}' \
  http://127.0.0.1:3000/auth/bootstrap > "$bootstrap_json"
export FORGETBASE_API_KEY="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).secret)' "$bootstrap_json")"
rm "$bootstrap_json"

npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- corpus import --api-url http://127.0.0.1:3000 --file corpus/demo/assets.json
curl --silent --show-error --fail "http://127.0.0.1:3000/search?query=personal%20data&limit=3"
```

Open the split-origin web UI at `http://127.0.0.1:5175/` or the same-origin proxy at `http://127.0.0.1:8080/`.

## Product Thesis

Most teams need one place where people can read trusted knowledge and AI tools can use the same knowledge safely.

ForgetBase focuses on four jobs:

- people browse and read approved pages
- AI tools search approved content with citations
- admins review, publish, and manage access
- exports include only content the requester is allowed to use

## Initial Direction

The open-source core should prove:

- instruction and document schema
- local users, service accounts, and API keys
- permission-aware retrieval
- REST/OpenAPI
- CLI
- MCP server
- reader UI and admin console
- synthetic/demo corpus
- validation for metadata, links, stale content, and restricted export leakage
- basic telemetry and personal-data cleanup hooks

The full managed agent orchestration layer is core to the architecture but not the first MVP milestone.

## Repository Status

ForgetBase is past the initial scaffold and is being prepared for public beta.

Included now:

- reader UI for published pages
- admin console for content, reviews, access, exports, settings, and system health
- local users, groups, service accounts, API keys, password login, and OIDC setup
- permission-aware search, citations, question answering, and exports
- REST/OpenAPI, CLI, MCP server, worker, and Docker Compose setup
- synthetic demo corpus and validation checks
- restricted-content leakage checks and backup/restore verification helpers
- GitHub Actions CI with typecheck, build, public beta UI checks, browser screenshot UAT, API contract checks, claims lint, and Postgres-backed tests

Still future work:

- hosted service packaging
- npm package publishing
- SCIM, MFA enforcement, and remembered-device policy
- richer analytics dashboards
- advanced approval workflows
- connector credential management
- external side-effecting action adapters
- compliance certification process

## Docs

- [Legacy Alpha Release Checklist](docs/ALPHA_RELEASE_CHECKLIST.md)
- [Public Beta Goal](docs/PUBLIC_BETA_GOAL.md)
- [Public Beta Compatibility](docs/PUBLIC_BETA_COMPATIBILITY.md)
- [Private Live UAT](docs/PRIVATE_LIVE_UAT.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Security Policy](SECURITY.md)
- [Product Goal](docs/PRODUCT_GOAL.md)
- [End-To-End Goal](docs/END_TO_END_GOAL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Technical Specification](docs/TECHNICAL_SPEC.md)
- [Decisions](docs/DECISIONS.md)
- [MVP Scope](docs/MVP_SCOPE.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Development](docs/DEVELOPMENT.md)
- [OKF Exports](docs/OKF_EXPORTS.md)
- [Synthetic Corpus Plan](docs/SYNTHETIC_CORPUS_PLAN.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Roadmap](docs/ROADMAP.md)
- [Remaining Functional Gaps](docs/REMAINING_FUNCTIONAL_GAPS.md)
- [Backup And Restore Runbook](docs/runbooks/BACKUP_RESTORE.md)
- [Docker Compose Deploy Runbook](docs/runbooks/DEPLOY_DOCKER_COMPOSE.md)
- [Public Beta Release Runbook](docs/runbooks/PUBLIC_BETA_RELEASE.md)
- [Railway Private Alpha Template](docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md)
- [Rollback Runbook](docs/runbooks/ROLLBACK.md)
- [API Key Rotation Runbook](docs/runbooks/API_KEY_ROTATION.md)
- [Restricted Leakage Investigation Runbook](docs/runbooks/RESTRICTED_LEAKAGE_INVESTIGATION.md)

## License

[Apache License 2.0](LICENSE).

The open-core boundary is still being refined, but the default position is that the self-hostable core should remain genuinely useful without a hosted service.

## Community And Support

- Use GitHub issues for reproducible bugs and concrete feature requests after the repo is public.
- Use the security policy for vulnerability reports.
- See [Public Beta Compatibility](docs/PUBLIC_BETA_COMPATIBILITY.md) for supported trial paths and beta limits.
- Public beta support is best effort; compatibility guarantees start later.
