# Mutesolo MCP Server

An MCP (Model Context Protocol) service built with [fastMCP](https://github.com/PrefectHQ/fastmcp), exposing Mutesolo Kanban capabilities to AI Agents (such as Hermes Agent).

## 5 Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects (name + ID + requirement count) |
| `get_board` | Get the Kanban board, displayed in 4 columns by status |
| `move` | ⭐ Move a task to the target column (draft/sent/in_progress/closed) |
| `get_task_detail` | View complete information for a single task |
| `list_tasks` | Filter tasks by status; returns all if status is empty |

- `mcp_mutesolo_move`
- `mcp_mutesolo_get_task_detail`

```
Hermes Agent → fastMCP Server (Python, Docker)
                  ↓ HTTP REST
               Go Backend (Mutesolo API, 127.0.0.1:8787)
                  ↓
               SQLite / JSON Store
```

The MCP server does not directly operate on the database; it only reads and writes through the existing REST API.

## Local Development

### Prerequisites

- Python 3.10+
- Mutesolo backend running (`go run ./cmd/mutesolo-web`)

### Installation & Running

```bash
cd mcp-server
pip install fastmcp httpx

# Local stdio mode (for development/debugging)
MUTESOLO_BACKEND_URL=http://127.0.0.1:8787 python server.py

# Local HTTP mode (for testing remote connections)
fastmcp run server.py --transport streamable-http --port 8000
```

## Docker Deployment

```bash
# Build and start
docker compose build mcp-server
docker compose up -d mcp-server

# View logs
docker compose logs -f mcp-server

# Health check
curl http://localhost:8000/health
```

## Hermes Agent Configuration

Add the MCP service to your Hermes config:

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  mutesolo:
    url: "http://localhost:8001/mcp"
    timeout: 30
```

After restarting the Hermes Agent, the following tools will be available:
- `mcp_mutesolo_list_projects`
- `mcp_mutesolo_get_board`
- `mcp_mutesolo_move_task`
- `mcp_mutesolo_get_task_detail`
- `mcp_mutesolo_list_tasks`

## Environment Variables

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `MUTESOLO_BACKEND_URL` | `http://host.docker.internal:8787` | Go backend address |

## Tech Stack

- **fastMCP** v3.x — MCP Server framework
- **httpx** — Async HTTP client
- **Python** 3.12 — Docker image
- **Docker** — Containerized deployment
