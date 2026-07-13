# Mutesolo

> **Orchestrate AI agents like a human team** — manage requirements, generate structured prompts, dispatch tasks, and track progress through a unified Web console.

## What It Does

Mutesolo is a control center for multi-agent AI collaboration. Instead of running agents directly, it gives you a place to:

- **Organize work** — projects, requirements, Kanban boards, branches
- **Generate prompts** — turn your specs + images into structured agent instructions using multimodal LLMs
- **Dispatch tasks** — send prompts to AI agents via Discord, with commit-verified results
- **Track progress** — real-time board updates, auto-refresh, status history

### The Flow

```
Create a requirement → Write specs + attach images
    → Generate a structured prompt (LLM)
        → Dispatch to an AI agent via Discord
            → Agent commits code → returns SHA
                → Board auto-updates → next agent picks up
```

## Core Features

| Area | What You Can Do |
|------|----------------|
| **Project Management** | Create projects, add requirements, manage branches, organize with Kanban |
| **Rich Editing** | Write specs in a BlockNote editor with image uploads, attachments, and external docs |
| **Prompt Generation** | Let a multimodal LLM analyze your text + images and produce a structured agent prompt |
| **GitHub Integration** | Browse your repositories, view releases, connect your workflow |
| **Discord Dispatch** | Send prompts to agents via Discord, receive commit SHAs as confirmation |
| **Branch Isolation** | Work on features in separate branches, merge back when done |
| **Local Ownership** | Everything runs on your machine — SQLite for state, object storage for files |

## Philosophy

- **Humans decide, agents execute** — Mutesolo generates prompts; agents pick them up and report results. You always stay in control.
- **Simple over complex** — Password-based auth, single-user first, no cloud dependencies.
- **Traceable outputs** — Every agent task is tied to a Git commit. Nothing gets lost.
- **Local-first** — Your data, your machine, your rules.

## Tech Stack

- **Backend**: Go
- **Frontend**: React + TypeScript + Tailwind CSS
- **Editor**: BlockNote (rich text)
- **Storage**: SQLite (state) + object storage (files)
- **LLM**: Multimodal chat completion API
- **Agent Interface**: Discord + MCP

## Getting Started

```bash
# Start the server
./mutesolo-web -backend sqlite

# Visit http://127.0.0.1:8787
```

Optional services:
```bash
docker compose up -d minio minio-init   # File storage for images
docker compose up -d mcp-server         # Discord Kanban control
```

## What It Doesn't Do

- **Does not execute code** — agents do that, Mutesolo coordinates
- **Does not replace your editor** — the built-in editor is for writing specs, not building apps
- **Does not require the cloud** — everything runs locally unless you choose otherwise
