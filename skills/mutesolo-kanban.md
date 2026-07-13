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
- User mentions: "task", "project", "kanban", "move to", "done", "todo", "backlog", "in progress"
- User asks about agent/task statistics or board view

## Status Mapping

Mutesolo Kanban has 4 columns. Display names are human-facing; code values are the MCP protocol values.

| Column Display | Meaning | Code Value | Status Definition |
|----------------|---------|------------|-------------------|
| BACKLOG | Backlog / Todo Pool | `draft` | Draft — Requirement just created, not yet assigned |
| TO DO | To Do | `sent` | Assigned — Dispatched to Agent, awaiting execution |
| IN PROGRESS | In Progress / Processing | `in_progress` | Executing — Agent is currently working on it |
| DONE | Completed / Finished | `closed` | Closed — Task completed and archived |

### Natural Language → Code Value

| User can say... | → code value |
|---|---|
| BACKLOG / todo pool / backlog / draft / not assigned yet | `draft` |
| TO DO / to do / need to do / assigned / waiting for agent | `sent` |
| IN PROGRESS / in progress / processing / doing | `in_progress` |
| DONE / completed / done / finished / closed | `closed` |

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
| "Move new tom to DONE" | list_projects → get_board → task(new_status="closed") |
| "What tasks are in new Project" | list_projects → get_board |
| "Show details of four task" | list_projects → get_board → get_task_detail |
| "What's in the TO DO column" | list_projects → list_tasks(status="sent") |
| "What has panda completed" | list_projects → get_board → filter by assigned_member |

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
