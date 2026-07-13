# Mutesolo fastMCP 实施方案 — 完整设计文档

> 版本: v1.0 | 日期: 2026-07-10 | 作者: 阿宝

---

## 目录

1. [项目结构](#1-项目结构)
2. [依赖分析](#2-依赖分析)
3. [MCP Tools 设计](#3-mcp-tools-设计)
4. [后端 API 适配风险](#4-后端-api-适配风险)
5. [Transport 双模式](#5-transport-双模式)
6. [Hermes Skill 对接](#6-hermes-skill-对接)
7. [部署方案](#7-部署方案)
8. [风险与坑点](#8-风险与坑点)
9. [工作量估计](#9-工作量估计)
10. [与其他任务的依赖关系](#10-与其他任务的依赖关系)

---

## 1. 项目结构

### 推荐方案：放在 Mutesolo 仓库内 `mcp-server/` 目录

```
/Users/soda/Documents/Mutesolo/
├── mcp-server/                    # 新增
│   ├── __init__.py
│   ├── server.py                  # fastMCP 主入口，定义 Tools
│   ├── backend_client.py          # 对 Go 后端的 httpx 封装层
│   ├── pyproject.toml             # Python 项目元数据 + 依赖声明
│   └── README.md                  # 开发/部署说明
├── cmd/mutesolo-web/main.go       # 已有，不动
├── internal/webapp/server.go      # 已有，不动
├── webapps/control-console/       # 已有，不动
├── docker-compose.yml             # 已有（含 MinIO）
└── ...
```

### 决策理由

| 选项 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **仓库内 `mcp-server/`**（推荐） | 与 Go 后端同仓库，版本一致；Git tag 同步；CI 可以一起跑 | Python 代码混在 Go 项目里 | ✅ 选这个 |
| 独立 repo | 语言分离干净；可独立发布 | 版本同步困难；需要跨 repo 协调 | ❌ 过度设计，当前只有一个 MCP server |

**注意**：MCP server 完全独立于 Go 后端，不需要共享代码或构建系统。它只通过 HTTP 调用已有的 REST API。

---

## 2. 依赖分析

### 核心依赖

| 包名 | 用途 | 版本要求 | Python 3.9 兼容？ |
|------|------|----------|-------------------|
| `fastmcp` | MCP server 框架 | `>=3.10`（最新 3.4.4） | **❌ 不兼容** |
| `mcp` | MCP 官方 Python SDK（备选） | `>=3.10`（最新 1.28.1） | **❌ 不兼容** |
| `httpx` | HTTP 客户端调用 Go 后端 | `>=3.8` | ✅ 兼容 |

### ⚠️ 关键发现：Python 3.9.6 不支持 fastMCP/mcp

经过 PyPI 元数据核实：

- **fastmcp 3.4.4**（最新）：`Requires: Python >=3.10`；分类器仅列出 `3.10, 3.11, 3.12, 3.13`
- **mcp 1.28.1**（官方 SDK）：`Requires: Python >=3.10`；分类器列出 `3.10, 3.11, 3.12, 3.13, 3.14`
- **httpx 0.28.1**：`Requires: Python >=3.8`；✅ macOS 3.9.6 可用

**结论**：macOS 自带 `/usr/bin/python3`（3.9.6）无法直接使用 fastMCP。必须安装 Python 3.10+。

### 解决方案：Homebrew 安装 Python 3.12

```bash
# 安装 Python 3.12（不影响系统 Python）
brew install python@3.12

# 创建 venv
/opt/homebrew/bin/python3.12 -m venv mcp-server/.venv

# 激活 + 安装依赖
source mcp-server/.venv/bin/activate
pip install fastmcp httpx
```

### pyproject.toml 依赖声明

```toml
[project]
name = "mutesolo-mcp"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "fastmcp>=3.0",
    "httpx>=0.27",
]

[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio"]
```

完整依赖树（预估，由 pip 自动解析）：
```
fastmcp → mcp, pydantic, uvicorn, starlette, httpx, cyclopts, ...
httpx → httpcore, h11, certifi, idna, anyio, sniffio
```

**总计额外安装**：约 30-40 个 Python 包（主要由 fastMCP 的 web server 能力带来）。

---

## 3. MCP Tools 设计

### 3.1 架构概览

```
Discord 用户 → Hermes Gateway → Hermes Agent
                                  ↓ (MCP tool call)
                            fastMCP Server (Python, 本地/远程)
                                  ↓ (HTTP REST)
                            Go 后端 (127.0.0.1:8787)
                                  ↓
                            SQLite / JSON Store
```

### 3.2 Go 后端 API 实际行为（从源码确认）

#### GET /api/projects
- **返回格式**：**直接返回 `[]Project` JSON 数组**（不是 `{projects: [...]}`）
- 每个 Project 包含 `id`, `name`, `description`, `branches[]`, `requirements[]`
- 无分页，全量返回

#### PUT /api/projects/{id}/requirements/{rid}
- **title 字段必填**：handler 层 `strings.TrimSpace(input.Title) == ""` → 400
- body 必须是完整的 `Requirement` JSON 结构体
- 实际 `UpdateRequirementDetails` 内部对空 title 会跳过更新（line 200），但 handler 拦在前面

#### POST /api/projects/{id}/board
- **推荐用于状态变更**：不需要 title
- body: `{requirement_ids: string[], status: string, branch_id?: string, agent_id?: string, commit_id?: string}`
- 批量更新多个 requirement 的 status

### 3.3 Tool 定义

#### Tool 1: `list_projects`

```python
@mcp.tool()
async def list_projects() -> str:
    """列出所有项目（名称 + ID），供后续操作引用"""
```

**输入参数**：无

**处理逻辑**：
1. `GET /api/projects` → 获取 `[]Project`
2. 返回简化列表：`[{id, name, requirement_count}]`

**输出格式**：
```json
{
  "projects": [
    {"id": "proj-1", "name": "Mutesolo", "requirement_count": 12},
    {"id": "proj-2", "name": "Hermes Plugin", "requirement_count": 5}
  ],
  "total": 2
}
```

---

#### Tool 2: `get_board`

```python
@mcp.tool()
async def get_board(project_id: str) -> str:
    """获取 Kanban 看板，按 status 分组展示所有 task"""
```

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | string | ✅ | 项目 ID |

**处理逻辑**：
1. `GET /api/projects` → 过滤目标 project
2. 按 `status` 分 4 列：`draft → BACKLOG`, `sent → TO DO`, `in_progress → IN PROGRESS`, `closed → DONE`
3. 每列返回 task 摘要（id, title, priority, assigned_member）

**输出格式**：
```json
{
  "project": "Mutesolo",
  "columns": [
    {"status": "draft", "label": "BACKLOG", "tasks": [{"id": "req-1", "title": "fix bug", "priority": "high", "assigned_member": "阿宝"}]},
    {"status": "sent", "label": "TO DO", "tasks": []},
    {"status": "in_progress", "label": "IN PROGRESS", "tasks": []},
    {"status": "closed", "label": "DONE", "tasks": []}
  ]
}
```

---

#### Tool 3: `move_task` ⭐ 核心 Tool

```python
@mcp.tool()
async def move_task(project_id: str, task_id: str, new_status: str) -> str:
    """将指定 task 移动到目标列。status 可选: draft, sent, in_progress, closed"""
```

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | string | ✅ | 项目 ID |
| `task_id` | string | ✅ | 任务 ID |
| `new_status` | string | ✅ | 目标状态，允许值见下方 |

**new_status 合法值**：

| 值 | 含义 |
|----|------|
| `draft` | 移到 BACKLOG |
| `sent` | 移到 TO DO |
| `in_progress` | 移到 IN PROGRESS |
| `closed` | 移到 DONE |

**处理逻辑**：
1. 校验 `new_status` 是否为合法值 → 非法返回错误
2. **调用 `POST /api/projects/{project_id}/board`**（推荐，避开 title 必填限制）
3. body: `{"requirement_ids": [task_id], "status": new_status}`

**替代方案（备选）**：调用 `PUT /api/projects/{pid}/requirements/{rid}`
- 需要先 GET project 获取当前 requirement 的完整 JSON
- 修改 `status` 字段后 PUT 回去（保留原 title）
- 缺点：多一次 HTTP 调用 + title 必填校验

**输出格式（成功）**：
```json
{
  "success": true,
  "task_id": "req-1",
  "old_status": "draft",
  "new_status": "in_progress",
  "title": "fix bug"
}
```

**输出格式（失败）**：
```json
{
  "success": false,
  "error": "Invalid status 'invalid_status'. Must be one of: draft, sent, in_progress, closed"
}
```

---

#### Tool 4: `get_task_detail`

```python
@mcp.tool()
async def get_task_detail(project_id: str, task_id: str) -> str:
    """查看单个 task 的详细信息"""
```

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | string | ✅ | 项目 ID |
| `task_id` | string | ✅ | 任务 ID |

**处理逻辑**：
1. `GET /api/projects` → 过滤 project + requirement
2. 返回完整 requirement JSON

**输出格式**：
```json
{
  "id": "req-1",
  "title": "fix bug",
  "description": "修复登录页面的样式问题",
  "status": "draft",
  "priority": "high",
  "assigned_member": "阿宝",
  "branch_id": "main",
  "agent_id": null,
  "created_at": "2026-07-01T10:00:00Z",
  "updated_at": "2026-07-05T14:30:00Z"
}
```

---

#### Tool 5: `list_tasks`

```python
@mcp.tool()
async def list_tasks(project_id: str, status: str = "") -> str:
    """按状态筛选 task。status 为空时返回所有 task"""
```

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | string | ✅ | 项目 ID |
| `status` | string | ❌ | 筛选状态，为空返回所有 |

**处理逻辑**：
1. `GET /api/projects` → 过滤 project
2. 如果 `status` 非空，过滤 `requirements[status == input.status]`
3. 返回简化列表

**输出格式**：
```json
{
  "project": "Mutesolo",
  "status_filter": "in_progress",
  "count": 3,
  "tasks": [
    {"id": "req-1", "title": "fix bug", "priority": "high", "assigned_member": "阿宝"},
    {"id": "req-2", "title": "add feature", "priority": "medium", "assigned_member": null}
  ]
}
```

---

### 3.4 错误处理策略

| 错误场景 | 处理方式 | 返回内容 |
|----------|----------|----------|
| Go 后端不可达 | httpx.ConnectError 超时后捕获 | `{"success": false, "error": "Backend unreachable: 127.0.0.1:8787"}` |
| project_id 不存在 | 过滤结果为空 | `{"success": false, "error": "Project not found: xxx"}` |
| task_id 不存在 | 过滤结果为空 | `{"success": false, "error": "Task not found: xxx"}` |
| new_status 非法值 | 参数校验 | `{"success": false, "error": "Invalid status: xxx. Must be one of: draft, sent, in_progress, closed"}` |
| PUT title 缺失 | 后端返回 400 | `{"success": false, "error": "Bad Request: requirement title is required"}` |
| fastMCP 框架内部异常 | try/except 兜底 | `{"success": false, "error": "Internal error: <message>"}` |

### 3.5 backend_client.py 设计

```python
# 伪代码结构，不代表最终实现
import httpx
from typing import Any

BASE_URL = "http://127.0.0.1:8787"
TIMEOUT = 10.0  # 秒

async def _get(path: str) -> Any:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as client:
        resp = await client.get(path)
        resp.raise_for_status()
        return resp.json()

async def _post(path: str, body: dict) -> Any:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as client:
        resp = await client.post(path, json=body)
        resp.raise_for_status()
        return resp.json()

async def _put(path: str, body: dict) -> Any:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as client:
        resp = await client.put(path, json=body)
        resp.raise_for_status()
        return resp.json()
```

---

## 4. 后端 API 适配风险

### 4.1 不需要改 Go 后端

**结论**：现有 API 已完全满足需求，Go 后端零改动。

### 4.2 PUT title 必填的处理策略

`PUT /api/projects/{id}/requirements/{rid}` 的 handler 层校验 `title` 非空，这是唯一需要注意的点。

**`move_task` 使用 `POST /api/projects/{pid}/board` 端点**（推荐）：

```json
POST /api/projects/proj-1/board
{"requirement_ids": ["req-1"], "status": "in_progress"}
```

这个端点不需要 title，专门为批量状态更新设计（前端 Board.tsx 拖拽用的就是这个）。

**如果未来需要更新其他字段（如 priority、assigned_member）**：
- 可用 `PUT` 端点，但需要先 GET 获取当前 requirement 的完整 JSON
- 在 client 端 merge 修改后 PUT 回去

### 4.3 API 返回格式确认

| API | 实际返回格式 | 文档推导格式 | 一致？ |
|-----|-------------|-------------|--------|
| `GET /api/projects` | `[]Project`（数组） | `{projects: [...]}` | **不一致！** task 描述中假设外层有 `projects` 键，实际是裸数组 |
| `GET /api/projects/{id}` | 不存在单独的端点，通过过滤 projects 数组实现 | — | — |
| `PUT /api/projects/{id}/requirements/{rid}` | 返回 `Requirement` 对象 | — | ✅ |
| `POST /api/projects/{id}/board` | 返回 `[]Requirement`（更新的数组） | — | ✅ |

**设计影响**：`list_projects` 调用 `GET /api/projects` 后收到的是数组，不需要解包 `data["projects"]`。

---

## 5. Transport 双模式

### 5.1 fastMCP 原生支持

fastMCP v3.x 原生支持三种 transport：

| Transport | 协议 | 适用场景 | fastMCP 如何运行 |
|-----------|------|----------|-----------------|
| **stdio** | JSON-RPC over stdin/stdout | 本地，Hermes 在同一台机器 | `python server.py`（默认） |
| **SSE** | Server-Sent Events over HTTP | 远程访问，可放 Docker | `fastmcp run server.py --transport sse --port 8000` |
| **Streamable HTTP** | HTTP POST + optional SSE | 生产推荐 | `fastmcp run server.py --transport streamable-http --port 8000` |

### 5.2 本地 stdio 模式（开发/单机部署）

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  mutesolo:
    command: "/opt/homebrew/bin/python3.12"
    args: ["-m", "mcp_server.server"]
    env:
      MUTESOLO_BACKEND_URL: "http://127.0.0.1:8787"
    timeout: 30
```

> **注意**：`command` 需指向 Python 3.12 可执行文件（不是系统 3.9），如果用 venv 则是 `.venv/bin/python`。

Hermes 会在启动时：
1. 启动子进程 `/opt/homebrew/bin/python3.12 -m mcp_server.server`
2. 通过 stdin/stdout 进行 JSON-RPC 通信
3. 自动发现 Tools：`mcp_mutesolo_list_projects`, `mcp_mutesolo_get_board`, 等

### 5.3 远程 SSE/HTTP 模式（未来 Docker 部署）

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  mutesolo:
    url: "http://mcp.mutesolo.local:8000/mcp"
    headers:
      Authorization: "Bearer sk-xxx"  # 可选
    timeout: 30
    connect_timeout: 10
```

启动命令：
```bash
# SSE transport
fastmcp run mcp_server.server:app --transport sse --host 0.0.0.0 --port 8000

# Streamable HTTP（推荐生产环境）
fastmcp run mcp_server.server:app --transport streamable-http --host 0.0.0.0 --port 8000
```

### 5.4 切换方式

在 `server.py` 中不需要写死 transport。fastMCP v3 的 `mcp.run()` 默认用 stdio，通过 CLI `fastmcp run` 可以覆盖：

```python
# server.py
from fastmcp import FastMCP

mcp = FastMCP("Mutesolo Kanban")

@mcp.tool()
async def list_projects() -> str:
    ...

if __name__ == "__main__":
    mcp.run()  # 默认 stdio
```

```bash
# 本地 stdio
python server.py

# SSE 远程
fastmcp run server.py --transport sse --port 8000
```

---

## 6. Hermes Skill 对接

### 6.1 对接方式：Hermes 原生 MCP 客户端（推荐）

根据 Hermes 文档（`native-mcp.md`），Hermes 内置 MCP 客户端：

1. 在 `~/.hermes/config.yaml` 配置 `mcp_servers` 后重启
2. Hermes 自动连接 MCP server、发现 Tools
3. Tools 以 `mcp_{server_name}_{tool_name}` 命名注册
4. 自动注入所有平台（CLI、Discord、Telegram 等）

**不需要写额外的 Hermes skill 来调用 MCP tools**。用户只需：
1. 配置好 `mcp_servers.mutesolo`
2. 重启 Hermes（或 `/reload-mcp`）
3. Discord 里直接对话即可调用 Tools

### 6.2 Tool 命名映射

| MCP Server | Tool | Hermes Tool Name |
|------------|------|-----------------|
| mutesolo | list_projects | `mcp_mutesolo_list_projects` |
| mutesolo | get_board | `mcp_mutesolo_get_board` |
| mutesolo | move_task | `mcp_mutesolo_move_task` |
| mutesolo | get_task_detail | `mcp_mutesolo_get_task_detail` |
| mutesolo | list_tasks | `mcp_mutesolo_list_tasks` |

### 6.3 可选：编写 Skill 增强用户体验

如果要做自然语言层的封装（如将"把 fix bug 移到 IN PROGRESS"自动翻译成 `move_task` 调用），可以编写一个 Hermes skill：

```markdown
---
name: mutesolo-kanban
description: 在 Discord 中通过对话操作 Mutesolo Kanban 看板
---

# Mutesolo Kanban Skill

当用户在 Discord 中提到任务移动、看板查看等操作时，使用 MCP tools：

- 查看看板：`mcp_mutesolo_get_board`
- 移动任务：`mcp_mutesolo_move_task`
- 查看任务详情：`mcp_mutesolo_get_task_detail`

status 映射：
- "backlog" / "待办池" → draft
- "todo" / "待办" → sent
- "in progress" / "进行中" → in_progress
- "done" / "已完成" → closed
```

但对于 MVP，**不需要额外 skill**——MCP tools 直接可用。

### 6.4 配置步骤（一次性）

```bash
# 1. 安装 Python 3.12（如果还没装）
brew install python@3.12

# 2. 在 Mutesolo 目录创建 venv + 安装依赖
cd /Users/soda/Documents/Mutesolo/mcp-server
/opt/homebrew/bin/python3.12 -m venv .venv
source .venv/bin/activate
pip install fastmcp httpx

# 3. 在 Hermes config 中添加 MCP server
hermes config edit
# 添加:
# mcp_servers:
#   mutesolo:
#     command: "/Users/soda/Documents/Mutesolo/mcp-server/.venv/bin/python"
#     args: ["server.py"]
#     env:
#       MUTESOLO_BACKEND_URL: "http://127.0.0.1:8787"
#     timeout: 30

# 4. 重启 Hermes gateway
hermes gateway restart
```

---

## 7. 部署方案

### 7.1 本地开发

```bash
# Terminal 1: Go 后端（已有）
cd /Users/soda/Documents/Mutesolo
go run ./cmd/mutesolo-web  # 监听 127.0.0.1:8787

# Terminal 2: MCP server
cd /Users/soda/Documents/Mutesolo/mcp-server
source .venv/bin/activate
python server.py  # stdio mode, 由 Hermes 启动

# Terminal 3: Hermes（自动启动 MCP server 子进程）
hermes gateway run
```

### 7.2 生产环境

#### 方案 A：systemd + venv（macOS launchd）

```bash
# macOS launchd plist: ~/Library/LaunchAgents/com.mutesolo.mcp.plist
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mutesolo.mcp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/soda/Documents/Mutesolo/mcp-server/.venv/bin/python</string>
        <string>server.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/soda/Documents/Mutesolo/mcp-server</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MUTESOLO_BACKEND_URL</key>
        <string>http://127.0.0.1:8787</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

**注意**：stdio transport 下 MCP server 的生命周期由 Hermes 管理（Hermes 启动子进程）。launchd 方式适用于 SSE/HTTP transport。

#### 方案 B：Docker Compose（推荐生产环境）

```yaml
# 在现有 docker-compose.yml 中添加
services:
  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - MUTESOLO_BACKEND_URL=http://host.docker.internal:8787
    command: fastmcp run server.py --transport streamable-http --host 0.0.0.0 --port 8000
    restart: unless-stopped
```

```dockerfile
# mcp-server/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY . .
CMD ["fastmcp", "run", "server.py", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8000"]
```

Docker 模式下 Hermes 配置：
```yaml
mcp_servers:
  mutesolo:
    url: "http://localhost:8000/mcp"
    timeout: 30
```

### 7.3 开发/生产切换对照

| 环境 | Transport | Python 来源 | Go 后端地址 |
|------|-----------|------------|-------------|
| 本地开发 | stdio | venv（Homebrew Python 3.12） | `http://127.0.0.1:8787` |
| 本地 Docker | SSE/HTTP | Docker 容器内 Python 3.12 | `http://host.docker.internal:8787` |
| 远程 Docker | SSE/HTTP | Docker 容器内 Python 3.12 | 需 VPN/内网可达 |

---

## 8. 风险与坑点

### 8.1 Python 3.9 不兼容 ⚠️ **最大风险**

- **问题**：macOS 自带 `/usr/bin/python3` 是 3.9.6，fastMCP 和 mcp 都需要 `>=3.10`
- **影响**：无法用系统 Python 直接 `pip install fastmcp`
- **解决**：
  1. `brew install python@3.12` → `/opt/homebrew/bin/python3.12`
  2. 用 venv 隔离：`/opt/homebrew/bin/python3.12 -m venv .venv`
  3. Docker 环境直接用 `python:3.12-slim` 基础镜像
- **注意**：不要尝试 `pip3 install fastmcp`（会失败），必须先用 brew 装新版 Python

### 8.2 fastMCP v2 → v3 断崖升级

- 当前 PyPI 最新是 **3.4.4**（v3 系列），API 与 v2/v1 完全不同
- 代码风格：装饰器 `@mcp.tool()` + async 函数
- 如果看到旧教程的 `FastMCP("name")` → `mcp.tool()` 模式，那是 v1/v2，不适用于 v3
- v3 文档：https://gofastmcp.com

### 8.3 PUT title 必填

- `PUT /api/projects/{id}/requirements/{rid}` 的 handler 校验 title 非空
- MCP 调用时如果忘记传 title → 400 错误
- **解决**：move_task 用 `POST /api/projects/{pid}/board` 端点（不要求 title）

### 8.4 API 全量返回无分页

- `GET /api/projects` 返回所有 project + 所有 requirement，无分页
- 项目量大时（100+ requirement）响应体积可能较大
- **影响**：每次 get_board / list_tasks 都要传输全量数据
- **缓解**：当前规模不大（单个项目几十个 task），暂不需要分页

### 8.5 MCP server 对 Go 后端的硬依赖

- MCP server 启动时不需要 Go 后端在线（延迟连接）
- 但每次 Tool 调用时 Go 后端必须可达
- Go 后端不可达时 MCP tool 返回错误，不 crash

### 8.6 Hermes 环境变量隔离

- Hermes MCP 客户端**默认不传递宿主环境变量**给 stdio 子进程
- 只传递：`PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL`, `TMPDIR`, `XDG_*`
- 需要通过 `env` 配置显式传递：`MUTESOLO_BACKEND_URL`

### 8.7 macOS 权限

- 本地开发无权限问题
- Docker Desktop 下访问宿主机：`host.docker.internal` 代替 `127.0.0.1`

---

## 9. 工作量估计

### 文件清单

| 文件 | 行数（估算） | 说明 |
|------|-------------|------|
| `mcp-server/server.py` | ~150 行 | 5 个 Tool 定义 + FastMCP 实例 + 参数校验 |
| `mcp-server/backend_client.py` | ~80 行 | httpx 封装（GET/POST/PUT） |
| `mcp-server/pyproject.toml` | ~15 行 | 项目元数据 |
| `mcp-server/README.md` | ~50 行 | 开发/部署说明 |
| `mcp-server/__init__.py` | ~0 行 | 空文件 |
| `mcp-server/Dockerfile` | ~15 行 | Docker 构建（可选） |
| **总计** | **~310 行** | **5 个文件** |

### 时间估算

| 阶段 | 内容 | 时间 |
|------|------|------|
| 环境准备 | brew install python@3.12, venv, pip install | 15 min |
| 编写 backend_client.py | httpx 简单封装 + 错误处理 | 30 min |
| 编写 server.py | 5 个 Tool 定义 + 参数校验 | 1.5 h |
| 本地联调 | Hermes config + stdio 测试 | 1 h |
| Docker 化（可选） | Dockerfile + compose | 30 min |
| 文档 + Skill | README + Hermes skill（可选） | 30 min |
| 异常场景测试 | 后端不可达、非法参数等 | 30 min |
| **总计** | | **~4-5 小时** |

---

## 10. 与其他任务的依赖关系

### 10.1 完全独立，可先行

fastMCP 任务依赖分析：

| 依赖项 | 状态 | 说明 |
|--------|------|------|
| Go 后端 API | ✅ 已存在 | 不需要改动 |
| Kanban 数据模型 | ✅ 已存在 | `Requirement.Status` 字段稳定 |
| Docker Compose | ✅ 已存在 | 生产部署用 |
| Hermes MCP 支持 | ✅ 已内置 | `mcp_servers` 配置即可 |
| Discord 接入 | ✅ 已接入 | Hermes gateway 已配置 |

**结论**：fastMCP 任务是四个大任务中**最独立的**，不依赖其他三个任务。可以先完成、先上线。

### 10.2 对后续任务的价值

- 一旦 fastMCP 上线，Discord 用户可以直接操作 Kanban（当前只能通过 Web 控制台）
- 为后续的自动化工作流（如"AI agent 完成后自动移动 task 到 DONE"）提供基础设施

---

## 附录 A：现有 API 速查表

| 端点 | 方法 | 用途 | MCP Tool 对应 |
|------|------|------|--------------|
| `/api/projects` | GET | 获取所有 project（数组） | list_projects, get_board, get_task_detail, list_tasks |
| `/api/projects` | POST | 创建 project | 暂不暴露 |
| `/api/projects/{id}/requirements/{rid}` | PUT | 更新 requirement（title 必填） | move_task（备选） |
| `/api/projects/{id}/requirements/{rid}` | DELETE | 删除 requirement | 暂不暴露 |
| `/api/projects/{id}/board` | POST | 批量更新 status（推荐） | move_task（首选） |

## 附录 B：Status 状态机

```
draft ──→ sent ──→ in_progress ──→ closed
  ↑                                    │
  └──────────── 任意状态 ──────────────┘
```

前端 Board.tsx 列定义：
```typescript
const columns = [
  { id: 'draft',       title: 'BACKLOG',      dotColor: '#ff8b66' },
  { id: 'sent',        title: 'TO DO',         dotColor: '#8b95a5' },
  { id: 'in_progress', title: 'IN PROGRESS',   dotColor: '#5b8def' },
  { id: 'closed',      title: 'DONE',          dotColor: '#4dc89a' },
];
```

## 附录 C：fastMCP v3 最小 server.py 框架

```python
from fastmcp import FastMCP
import httpx
import json
import os

mcp = FastMCP("Mutesolo Kanban")

BASE_URL = os.getenv("MUTESOLO_BACKEND_URL", "http://127.0.0.1:8787")
VALID_STATUSES = {"draft", "sent", "in_progress", "closed"}

STATUS_LABELS = {
    "draft": "BACKLOG",
    "sent": "TO DO",
    "in_progress": "IN PROGRESS",
    "closed": "DONE",
}

# ... tool 函数 ...

if __name__ == "__main__":
    mcp.run()
```
