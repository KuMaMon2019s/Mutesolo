# Mutesolo v0.4.2

> **Orchestrate AI agents like a human team** — manage requirements, generate targeted prompts, and track progress through a unified Web console.

## What Problem Does This Solve?

Managing multiple AI agents (different models, different capabilities) introduces a coordination challenge: **who commands what, how to divide work, and how to track progress.**

Mutesolo provides a control console to:

- **Organize projects and requirements** with an interactive Kanban board
- **Generate structured prompts** from your requirements using multimodal LLMs
- **Dispatch tasks to AI agents** via Discord with commit-verified results
- **Track progress** — see what each agent is working on in real time
- **Manage branches** — isolate workstreams and cascade-delete when done

### Typical Flow

```
You (Project Lead)
  ├── Create a requirement in the Web console
  ├── Write specs + attach images in the BlockNote editor
  ├── Click "Generate Prompt" → Ark LLM creates a structured agent prompt
  ├── Dispatch to a Frontend Agent via Discord
  ├── Agent commits code → returns commit SHA
  ├── QA Agent picks up → verifies → marks done
  └── You see every status change on the live board
```

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| 🔐 **Login & Profile** | Username/password auth with bcrypt + JWT (30-day expiry), "Remember me" persistence |
| 🗂️ **Project Management** | Projects, requirements, Kanban board, branch management with batch operations |
| 📝 **Rich Editor** | BlockNote editor with image uploads, attachments, and Tencent Docs integration |
| 🤖 **AI Prompt Generation** | Generate structured implementation prompts from editor content + images using Ark multimodal LLM |
| 📦 **GitHub Integration** | Browse repositories, view release changelogs, filter by public/private |
| 🔀 **Branch Management** | Isolate workstreams, bulk-select + cascade-delete branches and their requirements |
| 🎛️ **Connections Page** | Configure Ark LLM, GitHub token, Discord bot, ClawHub API key |
| 📊 **Kanban Board** | Drag-and-drop, auto-poll (5s), Discord/MCP-driven status updates |
| 🖼️ **Image Management** | MinIO-backed project covers, image attachments with auto base64 conversion for LLM |
| 💾 **Local-First Storage** | SQLite + MinIO — all data stays on your machine |

## 🚀 Quick Start

```bash
# Start the Web console
./mutesolo-web -backend sqlite
# Visit http://127.0.0.1:8787

# Optional: start object storage for images & file uploads
docker compose up -d minio minio-init

# Optional: start MCP server for Discord Kanban control
docker compose up -d mcp-server
```

### First-Time Setup
1. Visit `http://127.0.0.1:8787` → you'll see the login page
2. Create an account (or sign in if returning)
3. Go to **Connections** → configure your Ark API Key, GitHub token, etc.
4. Create a **Project** → enter its **Board** → start adding requirements

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Discord                          │
│   Task dispatch → Agent picks up → returns SHA       │
└───────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│              Web Control Console                      │
│  Projects → Board → TaskDetail → Generate Prompt     │
│  GitHub Repos → Connections → Profile                │
└───────────────────────┬──────────────────────────────┘
                        │
         ┌──────────────┼───────────────┐
         ▼              ▼               ▼
    ┌─────────┐   ┌─────────┐   ┌──────────────┐
    │ SQLite  │   │  MinIO  │   │   Ark LLM    │
    │ (state) │   │ (files) │   │ (multimodal) │
    └─────────┘   └─────────┘   └──────────────┘
         │                              │
    ┌─────────┐              ┌──────────────────┐
    │ fastMCP │              │  GitHub API      │
    │ Docker  │              │  (repos + auth)  │
    └─────────┘              └──────────────────┘
```

## 💡 Core Design Principles

- **Console generates, Agent executes** — The Web console produces structured prompts; agents pick them up and report results
- **Human-in-the-loop** — You can intervene, modify, or cancel any task at any time
- **Git traceability** — Every agent output is committed with a SHA for audit
- **Local storage** — SQLite for state, MinIO for assets — nothing leaves your machine
- **Simple over complex** — Password auth instead of OAuth, single-user by design

## 📁 Project Structure

```
cmd/mutesolo-web/                # Web server entry point
internal/webapp/                 # Go backend (API, auth, storage, prompts, LLM)
    auth.go                      # JWT, bcrypt, login/logout/register
    server.go                    # HTTP handlers + middleware
    sqlite_store.go              # SQLite CRUD + migrations
    json_store.go                # JSON store fallback
    github.go                    # GitHub API integration (repos, releases)
    llm.go                       # Ark LLM multimodal integration
    prompt.go                    # Prompt builder and agent dispatch
    models.go                    # Shared data models
    schema.sql                   # SQLite DDL
webapps/control-console/         # React + Vite + TypeScript frontend
    src/pages/
        Login.tsx                # GitHub/OAuth → password login (Float UI)
        Projects.tsx             # Project cards with MinIO covers
        Board.tsx                # Kanban + Branch view with batch selection
        TaskDetail.tsx           # Requirement editor + AI prompt generation
        GitHubRepos.tsx           # Repository browser (waterfall layout)
        Connections.tsx          # Ark, GitHub, Discord, ClawHub config
        Profile.tsx              # Account settings + password change
    src/api/                     # Frontend API layer
    src/components/              # NavRail, toast, variants
webapps/requirement-editor/      # BlockNote rich-text editor
mcp-server/                      # fastMCP server for Discord Kanban control
    server.py                    # 5 MCP tools (list_projects, get_board, etc.)
docker-compose.yml               # MinIO + MCP server
schema.sql                       # SQLite schema (users, projects, requirements, ...)
```

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Go (net/http) |
| **Auth** | bcrypt + JWT (HS256, random secret per boot) |
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS |
| **State Storage** | SQLite (primary) + JSON file (fallback) |
| **File Storage** | MinIO (object storage) |
| **Editor** | BlockNote (rich text) |
| **LLM** | Volcano Ark API (ark-code-latest, multimodal) |
| **Agent Protocol** | fastMCP + Discord |
| **GitHub** | REST API v3 (repos, releases) |

## 🔌 Integrations

### Ark LLM (Volcano Ark)
- **Model**: `ark-code-latest` (multimodal, high thinking mode)
- **Base URL**: `https://ark.cn-beijing.volces.com/api/plan/v3`
- **Config**: API Key in Connections → used by Generate Prompt & image analysis
- **Image handling**: Local/relative URLs auto-converted to base64 data: URLs

### GitHub
- **Token**: Fine-grained or classic token with `repo` scope
- **Features**: Browse repos, view releases, filter by visibility
- **Cache**: Repo list 5 min, releases 30 min

### fastMCP (Discord Kanban)
- **Docker**: Port 8001, streamable-http transport
- **Tools**: `list_projects`, `get_board`, `task`, `get_task_detail`, `list_tasks`
- **Server name**: `mutesolo` (to avoid conflicts with built-in Kanban toolsets)

### MinIO
- **Ports**: 9000 (API), 9001 (Console)
- **Bucket**: `mutesolo-assets` — project covers, uploaded images
- **Access**: Presigned URLs with 10-minute TTL

## 🔐 Security

- **Password hashing**: bcrypt with auto salt
- **Session**: JWT signed with random per-boot secret, 30-day expiry
- **Cookie**: httpOnly, SameSite Lax
- **Remember me**: LocalStorage-based credential persistence (cleared on logout)
- **API Key isolation**: Mutesolo's GitHub token is separate from Hermes `.env`

## 📊 Release History

| Version | Highlights |
|---------|-----------|
| v0.4.2 | Auth system, Ark LLM multimodal, Branch batch management, critical bug fixes |
| v0.3.1 | Code review hotfix — SQLite FK constraints, cache token key, 7 total |
| v0.3.0 | GitHub Repos integration — waterfall cards, releases, private repos |
| v0.2.0 | fastMCP Discord Kanban — 5 MCP tools, Board auto-refresh |
| v0.1.1-beta | Legacy UI cleanup, control-console rewrite |
| v0.1.0 | Initial release — projects, board, prompt generation |

---

**Mutesolo** — turn your AI agents from solo performers into a coordinated orchestra.
