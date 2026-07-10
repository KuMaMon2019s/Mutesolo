"""
Mutesolo MCP Server — 通过 fastMCP 将项目看板能力暴露给 AI Agent。

5 个 Tool:
  - list_projects:       列出所有项目
  - get_board:           获取 Kanban 看板
  - task:                将任务移动到目标列 ⭐ 核心操作
  - get_task_detail:     查看任务详情
  - list_tasks:          按状态筛选任务

Transport: streamable-http（Docker 部署），本地开发默认 stdio。
"""

from fastmcp import FastMCP
import httpx
import os

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

BASE_URL = os.getenv("MUTESOLO_BACKEND_URL", "http://host.docker.internal:8787")
TIMEOUT = 10.0  # 秒

VALID_STATUSES = {"draft", "sent", "in_progress", "closed"}

COLUMN_ORDER = ["draft", "sent", "in_progress", "closed"]  # Kanban 工作流顺序

STATUS_LABELS = {
    "draft": "BACKLOG",
    "sent": "TO DO",
    "in_progress": "IN PROGRESS",
    "closed": "DONE",
}

# ---------------------------------------------------------------------------
# FastMCP 实例
# ---------------------------------------------------------------------------

mcp = FastMCP("Mutesolo")


# ---------------------------------------------------------------------------
# HTTP 辅助函数
# ---------------------------------------------------------------------------

async def _get(path: str):
    """GET 请求，返回 JSON（list 或 dict）。"""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as client:
        resp = await client.get(path)
        resp.raise_for_status()
        return resp.json()


async def _get_projects() -> list:
    """GET /api/projects → 返回项目数组。"""
    projects = await _get("/api/projects")
    if not isinstance(projects, list):
        return []
    return projects


async def _post(path: str, body: dict) -> list | dict:
    """POST 请求，返回 JSON。"""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as client:
        resp = await client.post(path, json=body)
        resp.raise_for_status()
        return resp.json()


def _find_project(projects: list, project_id: str) -> dict | None:
    """在项目数组中查找指定 project_id。"""
    for p in projects:
        if p.get("id") == project_id:
            return p
    return None


def _find_requirement(project: dict, task_id: str) -> dict | None:
    """在项目的 requirements 数组中查找指定 task_id。"""
    for r in project.get("requirements", []):
        if r.get("id") == task_id:
            return r
    return None


def _error(msg: str) -> dict:
    """统一错误返回格式。"""
    return {"success": False, "error": msg}


def _ok(**kwargs) -> dict:
    """统一成功返回格式。"""
    return {"success": True, **kwargs}


# ---------------------------------------------------------------------------
# Tool 1: list_projects
# ---------------------------------------------------------------------------

@mcp.tool
async def list_projects() -> dict:
    """列出所有项目（名称 + ID + 需求数量），供后续操作引用。"""
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"后端不可达: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    result = [
        {
            "id": p.get("id"),
            "name": p.get("name"),
            "requirement_count": len(p.get("requirements", [])),
        }
        for p in projects
    ]
    return {"projects": result, "total": len(result)}


# ---------------------------------------------------------------------------
# Tool 2: get_board
# ---------------------------------------------------------------------------

@mcp.tool
async def get_board(project_id: str) -> dict:
    """获取 Kanban 看板，按 status 分 4 列展示所有任务。

    Args:
        project_id: 项目 ID（可从 list_projects 获取）
    """
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"后端不可达: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"项目未找到: {project_id}")

    columns = {}
    for status in COLUMN_ORDER:
        columns[status] = []

    for req in project.get("requirements", []):
        status = req.get("status", "draft")
        if status in columns:
            columns[status].append({
                "id": req.get("id"),
                "title": req.get("title"),
                "priority": req.get("priority"),
                "assigned_member": req.get("assigned_member"),
            })

    return {
        "project": project.get("name"),
        "project_id": project_id,
        "columns": [
            {
                "status": status,
                "label": STATUS_LABELS[status],
                "tasks": columns[status],
            }
            for status in COLUMN_ORDER
        ],
    }


# ---------------------------------------------------------------------------
# Tool 3: task ⭐ 核心
# ---------------------------------------------------------------------------

@mcp.tool
async def task(project_id: str, task_id: str, new_status: str) -> dict:
    """将任务移动到目标列 (draft/sent/in_progress/closed)。"""
    # 参数校验
    if new_status not in VALID_STATUSES:
        return _error(
            f"非法状态 '{new_status}'。"
            f"允许值: {', '.join(sorted(VALID_STATUSES))}"
        )

    # 获取旧状态（用于返回）
    old_status = "unknown"
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"后端不可达: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"项目未找到: {project_id}")

    req = _find_requirement(project, task_id)
    if not req:
        return _error(f"任务未找到: {task_id}")

    old_status = req.get("status", "unknown")

    # 调用 POST /api/projects/{id}/board 执行状态变更
    try:
        await _post(
            f"/api/projects/{project_id}/board",
            {"requirement_ids": [task_id], "status": new_status},
        )
    except httpx.ConnectError:
        return _error(f"后端不可达: {BASE_URL}")
    except httpx.HTTPStatusError as e:
        return _error(f"后端错误 ({e.response.status_code}): {e.response.text[:500]}")
    except Exception as e:
        return _error(str(e))

    return _ok(
        task_id=task_id,
        title=req.get("title"),
        old_status=old_status,
        new_status=new_status,
    )


# ---------------------------------------------------------------------------
# Tool 4: get_task_detail
# ---------------------------------------------------------------------------

@mcp.tool
async def get_task_detail(project_id: str, task_id: str) -> dict:
    """查看单个任务的详细信息。

    Args:
        project_id: 项目 ID
        task_id:    任务 ID
    """
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"后端不可达: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"项目未找到: {project_id}")

    req = _find_requirement(project, task_id)
    if not req:
        return _error(f"任务未找到: {task_id}")

    return req  # 返回完整 requirement JSON


# ---------------------------------------------------------------------------
# Tool 5: list_tasks
# ---------------------------------------------------------------------------

@mcp.tool
async def list_tasks(project_id: str, status: str = "") -> dict:
    """按状态筛选任务。status 为空时返回所有任务。

    Args:
        project_id: 项目 ID
        status:     筛选状态（可选），留空返回所有
    """
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"后端不可达: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"项目未找到: {project_id}")

    tasks = []
    for req in project.get("requirements", []):
        if status and req.get("status") != status:
            continue
        tasks.append({
            "id": req.get("id"),
            "title": req.get("title"),
            "priority": req.get("priority"),
            "status": req.get("status"),
            "assigned_member": req.get("assigned_member"),
        })

    return {
        "project": project.get("name"),
        "project_id": project_id,
        "status_filter": status or "(all)",
        "count": len(tasks),
        "tasks": tasks,
    }


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # 默认 stdio transport（本地开发）
    # Docker 部署用: fastmcp run server.py --transport streamable-http --host 0.0.0.0 --port 8000
    mcp.run()
