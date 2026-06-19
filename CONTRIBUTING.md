# Contributing

ForgetBase is a public-alpha candidate. Contributions are welcome after the repository is public, but the project is still changing quickly.

## Good Alpha Contributions

- reproducible bug reports
- documentation fixes
- demo corpus improvements that do not include private source content
- small test coverage improvements
- narrowly scoped fixes to API, CLI, MCP, web, worker, or validation behavior

## Before Opening A Pull Request

Run the core checks:

```bash
npx -y pnpm@11.7.0 install
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
```

When Docker is available, also run:

```bash
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
```

## Public Content Rules

Do not contribute:

- private source exports or proprietary knowledge-base content
- customer, employee, or company confidential data
- real credentials, API keys, auth dumps, raw telemetry, or local logs
- generated local TLS certificates, database dumps, build output, or `.env` files

Use the synthetic demo corpus for examples.

## License

By contributing, you agree that your contribution is licensed under the Apache License 2.0.
