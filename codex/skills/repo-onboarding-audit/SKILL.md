---
name: repo-onboarding-audit
description: "Use for read-only mapping of an unfamiliar repo or subsystem when stack, entry points, tests, tooling, conventions, or the first data flow are not yet known. Do not use when current context already identifies the relevant implementation path or when the user asked to implement immediately."
---

# Repo Onboarding Audit

Use this skill before implementation or review in an unfamiliar repo. Build a compact map of the real project from files on disk, then use that map to choose the next action.

## Ground Rules

- Stay read-only unless the user explicitly asked for implementation.
- Read `AGENTS.md`, README files, and nearby project rules first. Read `CLAUDE.md` only when the user explicitly asks to compare or import another agent's conventions; do not treat it as Codex governing instructions.
- Prefer `rg` / `rg --files` and parallel reads for discovery.
- Ignore bulky generated folders during reconnaissance: `.git`, `node_modules`, `vendor`, `dist`, `build`, `.next`, `coverage`, `__pycache__`, virtualenvs, and IDE caches.
- Do not infer a framework from one filename; confirm with manifests, config, and entry points.

## Reconnaissance

Collect these signals before deep-reading implementation files:

1. Package manifests: `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `pom.xml`, `build.gradle`, `go.mod`, `Cargo.toml`, `composer.json`, `Gemfile`.
2. Framework fingerprints: Next/Vite/Nuxt/Angular configs, Spring Boot/Quarkus dependencies, Django/FastAPI/Flask entry points, Rails/Laravel configs, Docker and deployment files.
3. Entry points: `main`, `index`, `app`, `server`, `cmd/`, routes, controllers, workers, scheduled jobs, CLI entry files.
4. Top-level tree: two levels deep, excluding generated folders.
5. Tooling: formatter, lint, typecheck, build scripts, task runners, Makefile, CI workflows, Docker compose, `.env.example`.
6. Tests: test directories, naming patterns, runner config, fixtures, e2e setup, coverage tooling.
7. Git conventions: recent commit messages and branch status when inside a git repo.

## Architecture Mapping

After reconnaissance, trace one representative data flow:

```text
entry point -> validation / parser -> business logic -> persistence or external API -> response / UI / side effect
```

Identify:

- tech stack and versions visible from manifests
- frontend/backend split or monolith shape
- API style and route ownership
- persistence layer and source of truth
- where errors are handled
- where validation happens
- where tests attach to the flow

## Convention Detection

Before recommending changes, identify existing local patterns:

- file naming and directory ownership
- dependency injection or direct import style
- error handling style
- test style and naming
- state/cache/invalidation patterns
- commit message language and format
- build/test commands already used by scripts or CI

Project conventions beat generic best practice unless they cause a concrete bug, security issue, or maintainability risk tied to the user request.

## Output Shape

Keep the result short and actionable:

```markdown
**Repo Map**
- Stack:
- Entry points:
- Key directories:
- Test surface:
- Build / validation commands:

**Observed Conventions**
- Code style:
- Data flow:
- Error handling:
- Git / CI:

**Risks / Unknowns**
- ...

**Recommended Next Step**
- ...
```
