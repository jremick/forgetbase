## Summary

-

## Scope

- [ ] Reader UI
- [ ] Admin console
- [ ] API / CLI / MCP
- [ ] Security / permissions
- [ ] Deployment / release proof
- [ ] Docs only

## Verification

Run the checks that match the change. Do not mark a check as passing unless it was run on this branch.

- [ ] `npx -y pnpm@11.7.0 typecheck`
- [ ] `npx -y pnpm@11.7.0 test`
- [ ] `npx -y pnpm@11.7.0 claims:lint`
- [ ] `npx -y pnpm@11.7.0 public-beta:check`
- [ ] `npx -y pnpm@11.7.0 test:uat`
- [ ] `npx -y pnpm@11.7.0 contracts:check`
- [ ] `npx -y pnpm@11.7.0 security:check-deployment-defaults`
- [ ] Other:

## Release Proof Impact

- [ ] No public beta release proof impact.
- [ ] Updates proof gates, screenshots, public copy, or release claims.
- [ ] Requires stack-backed release verification before public beta.

## Safety

- [ ] No secrets, private corpus content, database dumps, raw tokens, generated local TLS certs, or local logs are included.
- [ ] Security-sensitive changes have tests or documented manual verification.
