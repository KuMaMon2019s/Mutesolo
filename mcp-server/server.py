"""
Mutesolo MCP Server — Exposes project Kanban capabilities to AI Agents via fastMCP.

5 Tools:
  - list_projects:       List all projects
  - get_board:           Get the Kanban board
  - task:                Move a task to the target column ⭐ Core operation
  - get_task_detail:     View task details
  - list_tasks:          Filter tasks by status

Transport: streamable-http (Docker deployment), stdio by default for local development.
"""

from fastmcp import FastMCP
import httpx
import os

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.getenv("MUTESOLO_BACKEND_URL", "http://host.docker.internal:8787")
TIMEOUT = 10.0  # seconds

VALID_STATUSES = {"draft", "sent", "in_progress", "closed"}

COLUMN_ORDER = ["draft", "sent", "in_progress", "closed"]  # Kanban workflow order

STATUS_LABELS = {
    "draft": "BACKLOG",
    "sent": "TO DO",
    "in_progress": "IN PROGRESS",
    "closed": "DONE",
}

# ---------------------------------------------------------------------------
# FastMCP Instance
# ---------------------------------------------------------------------------

mcp = FastMCP("Mutesolo")


# ---------------------------------------------------------------------------
# HTTP Helper Functions
# ---------------------------------------------------------------------------

async def _get(path: str):
    """GET request, returns JSON (list or dict)."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as client:
        resp = await client.get(path)
        resp.raise_for_status()
        return resp.json()


async def _get_projects() -> list:
    """GET /api/projects → Returns project array."""
    projects = await _get("/api/projects")
    if not isinstance(projects, list):
        return []
    return projects


async def _post(path: str, body: dict) -> list | dict:
    """POST request, returns JSON."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as client:
        resp = await client.post(path, json=body)
        resp.raise_for_status()
        return resp.json()


def _find_project(projects: list, project_id: str) -> dict | None:
    """Find specified project_id in the project array."""
    for p in projects:
        if p.get("id") == project_id:
            return p
    return None


def _find_requirement(project: dict, task_id: str) -> dict | None:
    """Find specified task_id in the project's requirements array."""
    for r in project.get("requirements", []):
        if r.get("id") == task_id:
            return r
    return None


def _error(msg: str) -> dict:
    """Unified error response format."""
    return {"success": False, "error": msg}


def _ok(**kwargs) -> dict:
    """Unified success response format."""
    return {"success": True, **kwargs}


# ---------------------------------------------------------------------------
# Tool 1: list_projects
# ---------------------------------------------------------------------------

@mcp.tool
async def list_projects() -> dict:
    """List all projects (name + ID + requirement count) for reference in subsequent operations."""
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"Backend unreachable: {BASE_URL}")
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
    """Get the Kanban board, displaying all tasks in 4 columns by status.

    Args:
        project_id: Project ID (can be obtained from list_projects)
    """
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"Backend unreachable: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"Project not found: {project_id}")

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
# Tool 3: task ⭐ Core
# ---------------------------------------------------------------------------

@mcp.tool
async def task(project_id: str, task_id: str, new_status: str) -> dict:
    """Move a task to the target column (draft/sent/in_progress/closed)."""
    # Parameter validation
    if new_status not in VALID_STATUSES:
        return _error(
            f"Invalid status '{new_status}'. "
            f"Allowed values: {', '.join(sorted(VALID_STATUSES))}"
        )

    # Get old status (for return)
    old_status = "unknown"
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"Backend unreachable: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"Project not found: {project_id}")

    req = _find_requirement(project, task_id)
    if not req:
        return _error(f"Task not found: {task_id}")

    old_status = req.get("status", "unknown")

    # Call POST /api/projects/{id}/board to execute status change
    try:
        await _post(
            f"/api/projects/{project_id}/board",
            {"requirement_ids": [task_id], "status": new_status},
        )
    except httpx.ConnectError:
        return _error(f"Backend unreachable: {BASE_URL}")
    except httpx.HTTPStatusError as e:
        return _error(f"Backend error ({e.response.status_code}): {e.response.text[:500]}")
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
    """View detailed information for a single task.

    Args:
        project_id: Project ID
        task_id:    Task ID
    """
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"Backend unreachable: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"Project not found: {project_id}")

    req = _find_requirement(project, task_id)
    if not req:
        return _error(f"Task not found: {task_id}")

    return req  # Return full requirement JSON


# ---------------------------------------------------------------------------
# Tool 5: list_tasks
# ---------------------------------------------------------------------------

@mcp.tool
async def list_tasks(project_id: str, status: str = "") -> dict:
    """Filter tasks by status. Returns all tasks if status is empty.

    Args:
        project_id: Project ID
        status:     Filter status (optional), leave empty to return all
    """
    try:
        projects = await _get_projects()
    except httpx.ConnectError:
        return _error(f"Backend unreachable: {BASE_URL}")
    except Exception as e:
        return _error(str(e))

    project = _find_project(projects, project_id)
    if not project:
        return _error(f"Project not found: {project_id}")

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
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Default stdio transport (local development)
    # For Docker deployment use: fastmcp run server.py --transport streamable-http --host 0.0.0.0 --port 8000
    mcp.run()
