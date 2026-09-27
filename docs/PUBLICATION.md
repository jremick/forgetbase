# Publication checklist

The public candidate is `v0.1.0-beta.5`. It builds on the verified beta.4 public
release and supports self-hosted trials with synthetic data. The final release
assets record the candidate commit, CI, runtime identity and completed gates.

## Before changing visibility

- Review every remote branch and tag, reachable history, pull-request discussion,
  release asset, retained Actions log and unexpired artifact for private content.
- Scan Git history and release text for secrets. Inspect screenshots as well as
  their extracted text. Classify test credentials against their isolated test
  environment rather than treating every secret-like string as a live credential.
- Keep production backups, credentials and private operator records outside Git
  and release artifacts. CI recovery fixtures must contain only synthetic data.
- Review license metadata and third-party notices. All workspace packages and
  the repository use Apache-2.0; private package flags prevent accidental npm
  publication and do not change the source license.
- Run the documented quick start in a clean checkout and isolated Compose project.
- Require successful CI and full-stack verification for the intended source.
- Review the source archive and public verification bundle before publication.

Historical development notes may contain obsolete commands and local paths. They
are historical records, not installation instructions. A detected credential,
private source export or confidential record blocks publication. Removing a file
from the current tree does not remove its history; any necessary history rewrite
must have a reviewed preservation and recovery plan.

## Promotion

Repository publication requires owner authorization. GitHub Free may expose the
security settings only after a private repository becomes public. Prepare the
settings first, then apply them immediately after changing visibility:

- Protect `main`, including administrators.
- Require pull requests, resolved conversations and an up-to-date passing
  `Verify` check. The solo-maintainer policy requires zero outside approvals.
- Disable force pushes and deletion of `main`.
- Enable secret scanning, push protection and private vulnerability reporting.
- Configure CodeQL for JavaScript/TypeScript and GitHub Actions; inspect its
  completed analysis and triage findings before declaring publication complete.
- Keep Issues enabled and unused Wiki, Projects and Discussions disabled.

Run `pnpm github:public-beta:check` from the clean release commit. The checker
requires that commit to match remote `main` and rejects missing protection,
disabled security features and stale CI. The procedure uses classic branch
protection; an alternative policy requires equivalent verification.

Follow [Public beta release](runbooks/PUBLIC_BETA_RELEASE.md) for the full proof
manifest and [Reproducible Railway release](runbooks/REPRODUCIBLE_RAILWAY_RELEASE.md)
for the existing deployment. Preserve previous tags and releases.

## Public readback

Verify anonymous repository and release access, source-archive checksums, the
security-reporting link and final GitHub settings. Confirm that the hosted API,
web and worker identify the released source and retain authenticated access.
Publishing source does not grant public access to the maintainer's installation.

Use [Support](../SUPPORT.md) for bug reports and [Security](../SECURITY.md) for
private vulnerability reports. Public beta carries no production support,
stable-API, external-model-quality or enterprise-identity guarantee.
