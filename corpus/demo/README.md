# Demo Corpus

This folder holds the synthetic open-source corpus used to test registry, retrieval, permissions, exports, and evals.

- `assets.json` contains governed demo assets.
- `evals.json` contains deterministic managed-query eval cases for groundedness, citation count, expected stable-ID coverage, and optional scheduled quality-gate replay.

Rules:

- Do not copy private source material.
- Use fictional organization names.
- Include both human documents and agent instruction objects.
- Keep public demo imports at `public-demo` sensitivity.
- Put restricted examples in dedicated test fixtures or leakage-test datasets, not the default OSS demo import.
