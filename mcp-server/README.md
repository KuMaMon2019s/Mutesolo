# Mutesolo MCP Server

基于 [fastMCP](https://github.com/PrefectHQ/fastmcp) 构建的 MCP (Model Context Protocol) 服务，
将 Mutesolo 看板能力暴露给 AI Agent（如 Hermes Agent）。

## 5 个 Tool

| Tool | 说明 |
|------|------|
| `list_projects` | 列出所有项目（名称 + ID + 需求数量） |
| `get_board` | 获取 Kanban 看板，按 status 分 4 列展示 |
| `move` | ⭐ 移动任务到目标列（draft/sent/in_progress/closed） |
| `get_task_detail` | 查看单个任务的完整信息 |
| `list_tasks` | 按状态筛选任务，status 为空返回全部 |
|- `mcp_mutesolo_move`
- `mcp_mutesolo_get_task_detail`

```
Hermes Agent → fastMCP Server (Python, Docker)
                  ↓ HTTP REST
               Go 后端 (Mutesolo API, 127.0.0.1:8787)
                  ↓
               SQLite / JSON Store
```

MCP server 不直接操作数据库，只通过现有 REST API 读写。

## 本地开发

### 前置条件

- Python 3.10+
- Mutesolo 后端正在运行（`go run ./cmd/mutesolo-web`）

### 安装运行

```bash
cd mcp-server
pip install fastmcp httpx

# 本地 stdio 模式（开发调试）
MUTESOLO_BACKEND_URL=http://127.0.0.1:8787 python server.py

# 本地 HTTP 模式（测试远程连接）
fastmcp run server.py --transport streamable-http --port 8000
```

## Docker 部署

```bash
# 构建并启动
docker compose build mcp-server
docker compose up -d mcp-server

# 查看日志
docker compose logs -f mcp-server

# 健康检查
curl http://localhost:8000/health
```

## Hermes Agent 配置

在你的 Hermes config 中添加 MCP 服务：

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  mutesolo:
    url: "http://localhost:8001/mcp"
    timeout: 30
```

重启 Hermes Agent 后，会看到以下工具可用：
- `mcp_mutesolo_list_projects`
- `mcp_mutesolo_get_board`
- `mcp_mutesolo_move_task`
- `mcp_mutesolo_get_task_detail`
- `mcp_mutesolo_list_tasks`

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MUTESOLO_BACKEND_URL` | `http://host.docker.internal:8787` | Go 后端地址 |

## 技术栈

- **fastMCP** v3.x — MCP Server 框架
- **httpx** — 异步 HTTP 客户端
- **Python** 3.12 — Docker 镜像
- **Docker** — 容器化部署
