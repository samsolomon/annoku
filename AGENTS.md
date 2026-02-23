# AGENTS.md
Guidance for coding agents in this repository.
Generated from workspace scan on 2026-02-23.

## Repository status at scan time
- Repo root was empty (no source/config files detected).
- No existing `AGENTS.md` found.
- No Cursor rules found in `.cursor/rules/`.
- No `.cursorrules` found.
- No Copilot file found at `.github/copilot-instructions.md`.
- Commands/style below are bootstrap defaults until project files exist.

## Agent priorities
1. Correctness first, then speed.
2. Follow existing conventions as soon as they appear.
3. Keep changes minimal and task-scoped.
4. Update this document when tooling or rules change.

## Build, lint, and test commands
Run from repository root.

### 1) Detect toolchain before running commands
- `pnpm-lock.yaml` => pnpm
- `package-lock.json` => npm
- `yarn.lock` => yarn
- `bun.lockb` or `bun.lock` => bun
- `pyproject.toml`, `uv.lock`, `poetry.lock` => Python
- `Cargo.toml` => Rust
- `go.mod` => Go
- `pom.xml` or `build.gradle*` => Java/Kotlin
- Use one package manager unless repo explicitly mixes them.

### 2) Standard full-suite commands
Node (pnpm):
- Build: `pnpm build`
- Lint: `pnpm lint`
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Format check: `pnpm format:check` (if available)

Node (npm/yarn):
- Build: `npm run build` / `yarn build`
- Lint: `npm run lint` / `yarn lint`
- Test: `npm test` / `yarn test`
- Typecheck: `npm run typecheck` / `yarn typecheck`

Python:
- Lint: `ruff check .`
- Format check: `ruff format --check .`
- Typecheck: `mypy .` (if configured)
- Test: `pytest`
- Build: `python -m build` (if packaging enabled)

Rust:
- Build: `cargo build`
- Lint: `cargo clippy --all-targets --all-features -- -D warnings`
- Test: `cargo test`

Go:
- Build: `go build ./...`
- Lint: `golangci-lint run`
- Test: `go test ./...`

### 3) Single-test commands (important)
- Vitest file: `pnpm vitest path/to/file.test.ts`
- Vitest case: `pnpm vitest path/to/file.test.ts -t "case name"`
- Jest file: `pnpm jest path/to/file.test.ts`
- Jest case: `pnpm jest path/to/file.test.ts -t "case name"`
- Node test runner: `node --test path/to/file.test.js --test-name-pattern="name"`
- Pytest file: `pytest tests/test_module.py`
- Pytest case: `pytest tests/test_module.py::test_case_name`
- Rust single test: `cargo test test_name_substring`
- Go single test: `go test ./path/to/pkg -run TestName`
- If CI wraps tests with env vars/shards, mirror CI locally.

### 4) Recommended verification order
1. Format check
2. Lint
3. Typecheck
4. Targeted tests for changed code
5. Full suite when risk is medium/high
6. Build

## Code style guidelines
Use repo-local configuration once available; otherwise use defaults below.

### Imports
- Group imports: stdlib, third-party, internal.
- Keep ordering deterministic (tool-managed if possible).
- Remove unused imports.
- Prefer public entry points over deep/private paths.

### Formatting
- Use language formatter as source of truth.
- Do not manually fight formatter output.
- Keep lines readable; target <= 100 chars when not enforced.
- Avoid large format-only diffs unless requested.

### Types
- Prefer explicit types at API boundaries.
- Use inference for obvious local values.
- Avoid `any` and untyped escapes unless unavoidable.
- Validate/narrow untrusted input at boundaries.

### Naming conventions
- Choose descriptive, intention-revealing names.
- `PascalCase` for classes/types/components.
- `camelCase` for JS/TS variables/functions.
- `snake_case` for Python variables/functions.
- `UPPER_SNAKE_CASE` for constants.

### Error handling
- Never swallow errors silently.
- Attach context when propagating errors.
- Prefer typed/structured errors over plain strings.
- Keep user-facing messages safe and actionable.

### Logging and observability
- Use `debug`, `info`, `warn`, `error` appropriately.
- Keep log lines concise and useful.
- Never log secrets, tokens, or private keys.

### Testing expectations
- Add/update tests with behavior changes.
- Keep tests deterministic and isolated.
- Test behavior over private implementation details.

### Documentation and comments
- Explain "why" for non-obvious decisions.
- Keep comments synchronized with code.
- Add concise docs/docstrings for exported APIs.

### Security defaults
- Do not commit credentials or secrets.
- Prefer environment variables/secret stores for sensitive values.
- Validate and sanitize all external input.
- Use least-privilege defaults for integrations.

## Cursor and Copilot instructions
No Cursor/Copilot rules were detected during scan.
If files are added, merge their guidance here immediately:
- `.cursor/rules/*`
- `.cursorrules`
- `.github/copilot-instructions.md`
Precedence order:
1. User request
2. Cursor/Copilot repository rules
3. This `AGENTS.md`
4. General ecosystem conventions

## Maintenance checklist
- Update when build/lint/test commands change.
- Update when single-test strategy changes.
- Update when formatter/linter/typechecker changes.
- Update when naming/type/error-handling conventions change.
- Update when Cursor/Copilot rule files are created or edited.

Last updated: 2026-02-23
