# Contributing to Mutesolo

## Collaboration Model

This project is built with a multi-agent workflow:

```
Agent (Panda) = Orchestrator
  └── Plans, delegates, reviews, verifies, commits
      └── Qwen = Coder
          └── Writes code, runs builds, fixes bugs
```

**Mantra**: "Atris first, Qwen writes, Panda validates."

Before touching any code:
1. Check `atris/MAP.md` for the project navigation map
2. Load relevant skills via Hermes
3. Delegate implementation to a coding agent
4. Verify every change before committing

## Code Review Format

Every review response uses four sections:

```
Diagnosis  → Root cause analysis
Plan       → Fix approach and design rationale
Implementation → What files changed, what logic
Verification   → API responses, build status, HTTP codes
```

This lets the project lead distinguish between "design issue" and "implementation drift."

## Daily Principles

- **Don't guess APIs** — read skills/docs before coding
- **Verify after every build** — `go build` + `npm run build` + health check
- **Never commit without review** — Qwen reviews cross-layer consistency (frontend/backend/database)
- **Map after push** — regenerate `atris/MAP.md` after every push
- **Simple over complex** — SQLite over PostgreSQL, password over OAuth, local over cloud

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Go (net/http) |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Editor | BlockNote (rich text, iframe) |
| State | SQLite (primary) + JSON (fallback) |
| Files | MinIO |
| LLM | Volcano Ark API (multimodal) |
| Agent Bridge | fastMCP + Discord |

## Commit Convention

```
type: brief description

Detailed body with what changed and why.
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `atris`

## Before You Push

- [ ] `go build ./cmd/mutesolo-web` passes
- [ ] `npm run build` passes
- [ ] `go test ./internal/webapp/` passes
- [ ] Cross-layer consistency checked (frontend types ↔ backend models ↔ DB schema)
- [ ] No secrets, build artifacts, or system files committed
- [ ] `atris/MAP.md` regenerated if files changed
