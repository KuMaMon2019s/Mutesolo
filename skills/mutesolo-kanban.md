---
name: mutesolo-kanban
description: Use when user in Discord wants to operate Mutesolo Kanban board with informal Chinese/English prompts. Translates natural language into mcp_mutesolo tool calls.
version: 1.0.0
author: Panda
license: MIT
metadata:
  hermes:
    tags: [mcp, mutesolo, kanban, discord, nlp]
    related_skills: [mutesolo-development]
---

# Mutesolo Kanban — Natural Language → MCP Bridge

Translates informal user prompts into structured `mcp_mutesolo_*` tool calls so any Discord user can operate the Mutesolo Kanban board without knowing exact project IDs, task IDs, or status codes.

## When to Use

- User says anything about Mutesolo tasks, kanban, projects, or status changes
- User mentions: "task", "项目", "任务", "看板", "移到", "完成", "待办", "backlog", "todo", "done", "进行中"
- User asks about agent/task statistics or board view

## Status Mapping

Mutesolo Kanban has 4 columns. Display names are human-facing; code values are the MCP protocol values.

| 列显示 | 中文含义 | 代码值 | 状态含义 |
|--------|---------|--------|---------|
| BACKLOG | 积压 / 待办池 | `draft` | 草稿 — 需求刚创建，尚未派发 |
| TO DO | 待办 | `sent` | 已派发 — 已下达给 Agent，等待执行 |
| IN PROGRESS | 进行中 / 处理中 | `in_progress` | 执行中 — Agent 正在处理 |
| DONE | 已完成 / 搞定了 | `closed` | 已关闭 — 任务完成，归档 |

### Natural Language → Code Value

| User can say... | → code value |
|---|---|
| BACKLOG / 待办池 / 积压 / 草稿 / 还没派 | `draft` |
| TO DO / 待办 / 要做 / 已派发 / 等 agent 干 | `sent` |
| IN PROGRESS / 进行中 / 在处理 / 正在做 / doing | `in_progress` |
| DONE / 已完成 / 完成 / 搞定了 / 关闭 / closed | `closed` |

## Workflow (Always Follow This Order)

### Step 1: Resolve Project

If user mentions a project by **name** (not ID):
```
Use: mcp_mutesolo_list_projects()
Find the matching project by name → get its project_id.
```
If the user already provides a project_id, skip this step.

### Step 2: Resolve Task (when moving/getting a task)

If user mentions a task by **name** (not ID):
```
Use: mcp_mutesolo_get_board(project_id)
Scan all 4 columns for the task by title → get its task_id.
```
If the user already provides a task_id, skip this step.

### Step 3: Execute the Action

**Move a task:**
```
mcp_mutesolo_task(project_id="<id>", task_id="<id>", new_status="<status>")
```
Always return old_status → new_status to confirm the change.

**View board:**
```
mcp_mutesolo_get_board(project_id)
```

**View task detail:**
```
mcp_mutesolo_get_task_detail(project_id, task_id)
```

**List tasks by status:**
```
mcp_mutesolo_list_tasks(project_id, status="<status>")
```

## Examples

| User says | Translation |
|-----------|------------|
| "把 new tom 移到 DONE" | list_projects → get_board → task(new_status="closed") |
| "new Project 有什么任务" | list_projects → get_board |
| "看看 four task 的详情" | list_projects → get_board → get_task_detail |
| "TO DO 列里有什么" | list_projects → list_tasks(status="sent") |
| "panda 完成了哪些" | list_projects → get_board → filter by assigned_member |

## Common Pitfalls

1. **Don't guess IDs.** Always resolve project_id and task_id before calling `mcp_mutesolo_task`.
2. **Status case matters.** Only use lowercase: `draft`, `sent`, `in_progress`, `closed`.
3. **Title matching is case-insensitive.** "new Tom" matches "new tom" and "New Tom".
4. **Board shows current state.** Always call `get_board` after a move to confirm.
5. **Project names are exact.** "new Project" ≠ "new project" — check `list_projects` output.

## Verification Checklist

- [ ] project_id resolved from `list_projects` (not guessed)
- [ ] task_id resolved from `get_board` (not guessed)
- [ ] new_status is one of: draft, sent, in_progress, closed
- [ ] Confirmed with get_board after the move
