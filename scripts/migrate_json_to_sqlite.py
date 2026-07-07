#!/usr/bin/env python3
"""Mutesolo JSON -> SQLite migration draft.

This migrates the legacy file-backed state into the SQLite schema.
It is intentionally conservative and merge-oriented:

- prefer the current `.ai-agent/web-state.json` when present
- merge in `.openclaw/web-state.json` to recover legacy projects/config
- optionally import coordination state from `.ai-agent/state.json`
- preserve timestamps when they already exist in JSON
- emit a concise import summary so you can verify what landed

Typical usage:

    python scripts/migrate_json_to_sqlite.py \
      --db .ai-agent/mutesolo.db \
      --schema schema.sql

Dry run:

    python scripts/migrate_json_to_sqlite.py --dry-run

Notes:
- This is a draft migration utility, not a one-way destructive upgrader.
- It assumes the destination database is either empty or ready for UPSERTs.
- Events are imported append-only; if you rerun the draft repeatedly, add a
  manual dedupe step before promoting it to production.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


EMPTY_VALUES = (None, "", [], {})


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def is_nonempty(value: Any) -> bool:
    return value not in EMPTY_VALUES


def normalize_timestamp(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)


def utc_now_ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def normalize_config(config: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if not isinstance(config, dict):
        return out

    # Accept both the current AI Agent names and the legacy OpenClaw names.
    aliases = {
        "ai_agent_base_url": "ai_agent_base_url",
        "ai_agent_token": "ai_agent_token",
        "discord_url": "discord_url",
        "discord_widget_url": "discord_widget_url",
        "discord_bot_id": "discord_bot_id",
        "discord_guild_id": "discord_guild_id",
        "discord_bot_username": "discord_bot_username",
        "github_repo": "github_repo",
        "clawhub_base_url": "clawhub_base_url",
        "llm_api_key": "llm_api_key",
        "llm_locked": "llm_locked",
        "openclaw_base_url": "ai_agent_base_url",
        "openclaw_token": "ai_agent_token",
    }
    for key, value in config.items():
        if not is_nonempty(value):
            continue
        mapped_key = aliases.get(key)
        if mapped_key:
            out[mapped_key] = value

    # Try to recover the guild ID from the widget URL if it was omitted.
    if not out.get("discord_guild_id"):
        for candidate in (config.get("discord_widget_url"), config.get("discord_url")):
            widget_url = str(candidate or "")
            match = re.search(r"id=(\d+)", widget_url)
            if match:
                out["discord_guild_id"] = match.group(1)
                break

    return out


def merge_non_empty_fields(target: dict[str, Any], source: dict[str, Any], *, skip: set[str] | None = None) -> None:
    skip = skip or set()
    for key, value in source.items():
        if key in skip or key == "id":
            continue
        if not is_nonempty(value):
            continue
        target[key] = value


def merge_records(*lists: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for records in lists:
        for record in records or []:
            if not isinstance(record, dict):
                continue
            record_id = str(record.get("id", "")).strip()
            if not record_id:
                continue
            if record_id not in merged:
                merged[record_id] = {k: v for k, v in record.items() if is_nonempty(v) or k == "id"}
                merged[record_id]["id"] = record_id
                order.append(record_id)
            else:
                merge_non_empty_fields(merged[record_id], record)
                merged[record_id]["id"] = record_id
    return [merged[item_id] for item_id in order]


def merge_web_state(current: dict[str, Any] | None, legacy: dict[str, Any] | None) -> dict[str, Any]:
    current = current or {}
    legacy = legacy or {}
    config = {}
    config.update(legacy.get("config") or {})
    config.update(current.get("config") or {})

    project_inputs = as_list(legacy.get("projects")) + as_list(current.get("projects"))
    projects: dict[str, dict[str, Any]] = {}
    order: list[str] = []

    for project in project_inputs:
        if not isinstance(project, dict):
            continue
        project_id = str(project.get("id", "")).strip()
        if not project_id:
            continue
        if project_id not in projects:
            projects[project_id] = {
                "id": project_id,
                "name": "",
                "description": "",
                "plan": "",
                "docs": "",
                "branches": [],
                "requirements": [],
            }
            order.append(project_id)
        target = projects[project_id]
        merge_non_empty_fields(target, project, skip={"branches", "requirements"})
        target["id"] = project_id
        target["branches"] = merge_records(target.get("branches", []), as_list(project.get("branches")))
        target["requirements"] = merge_records(target.get("requirements", []), as_list(project.get("requirements")))

    return {"config": config, "projects": [projects[project_id] for project_id in order]}


def merge_coord_state(current: dict[str, Any] | None, legacy: dict[str, Any] | None) -> dict[str, Any]:
    current = current or {}
    legacy = legacy or {}
    result = {
        "agents": merge_records(as_list(legacy.get("agents")), as_list(current.get("agents"))),
        "skills": merge_records(as_list(legacy.get("skills")), as_list(current.get("skills"))),
        "tasks": merge_records(as_list(legacy.get("tasks")), as_list(current.get("tasks"))),
        "sessions": merge_records(as_list(legacy.get("sessions")), as_list(current.get("sessions"))),
        # events are append-only and intentionally preserved in source order
        "events": [event for event in as_list(legacy.get("events")) + as_list(current.get("events")) if isinstance(event, dict)],
    }
    return result


def ensure_schema(conn: sqlite3.Connection, schema_path: Path) -> None:
    schema = schema_path.read_text(encoding="utf-8")
    conn.executescript(schema)


def upsert_config(conn: sqlite3.Connection, config: dict[str, Any]) -> int:
    count = 0
    for key, value in config.items():
        if not is_nonempty(value):
            continue
        conn.execute(
            """
            INSERT INTO config (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
            """,
            (
                key,
                json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list, bool)) else str(value),
                utc_now_ts(),
            ),
        )
        count += 1
    return count


def upsert_projects(conn: sqlite3.Connection, projects: Iterable[dict[str, Any]]) -> tuple[int, int, int]:
    project_count = 0
    branch_count = 0
    requirement_count = 0
    for project in projects:
        if not isinstance(project, dict):
            continue
        project_id = str(project.get("id", "")).strip()
        if not project_id:
            continue

        project_count += 1
        conn.execute(
            """
            INSERT INTO projects (id, name, description, plan, docs, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              plan = excluded.plan,
              docs = excluded.docs,
              updated_at = excluded.updated_at
            """,
            (
                project_id,
                str(project.get("name", "")).strip() or project_id,
                str(project.get("description", "")),
                str(project.get("plan", "")),
                str(project.get("docs", "")),
                normalize_timestamp(project.get("created_at")) or utc_now_ts(),
                normalize_timestamp(project.get("updated_at")) or utc_now_ts(),
            ),
        )

        for branch in as_list(project.get("branches")):
            if not isinstance(branch, dict):
                continue
            branch_id = str(branch.get("id", "")).strip()
            if not branch_id:
                continue
            branch_count += 1
            conn.execute(
                """
                INSERT INTO branches (id, project_id, name, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  project_id = excluded.project_id,
                  name = excluded.name
                """,
                (
                    branch_id,
                    project_id,
                    str(branch.get("name", "Branch")).strip() or "Branch",
                    normalize_timestamp(branch.get("created_at")) or utc_now_ts(),
                ),
            )

        for req in as_list(project.get("requirements")):
            if not isinstance(req, dict):
                continue
            req_id = str(req.get("id", "")).strip()
            if not req_id:
                continue
            requirement_count += 1
            conn.execute(
                """
                INSERT INTO requirements (
                  id, project_id, branch_id, title, description, priority,
                  status, agent_id, prompt, commit_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  project_id = excluded.project_id,
                  branch_id = excluded.branch_id,
                  title = excluded.title,
                  description = excluded.description,
                  priority = excluded.priority,
                  status = excluded.status,
                  agent_id = excluded.agent_id,
                  prompt = excluded.prompt,
                  commit_id = excluded.commit_id,
                  updated_at = excluded.updated_at
                """,
                (
                    req_id,
                    project_id,
                    str(req.get("branch_id", "main")) or "main",
                    str(req.get("title", "")).strip() or req_id,
                    str(req.get("description", "")),
                    str(req.get("priority", "no_priority")),
                    str(req.get("status", "draft")),
                    str(req.get("agent_id", "")),
                    str(req.get("prompt", "")),
                    str(req.get("commit_id", "")),
                    normalize_timestamp(req.get("created_at")) or utc_now_ts(),
                    normalize_timestamp(req.get("updated_at")) or utc_now_ts(),
                ),
            )
    return project_count, branch_count, requirement_count


def upsert_coordination(conn: sqlite3.Connection, coord_state: dict[str, Any]) -> tuple[int, int, int, int, int]:
    if not isinstance(coord_state, dict):
        return 0, 0, 0, 0, 0

    agent_count = 0
    skill_count = 0
    task_count = 0
    session_count = 0
    event_count = 0

    for agent in as_list(coord_state.get("agents")):
        if not isinstance(agent, dict):
            continue
        agent_id = str(agent.get("id", "")).strip()
        if not agent_id:
            continue
        agent_count += 1
        conn.execute(
            """
            INSERT INTO agents (id, address, status, skills_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              address = excluded.address,
              status = excluded.status,
              skills_json = excluded.skills_json,
              updated_at = excluded.updated_at
            """,
            (
                agent_id,
                str(agent.get("address", "")),
                str(agent.get("status", "offline")),
                json.dumps(agent.get("skills", []) or [], ensure_ascii=False),
                utc_now_ts(),
            ),
        )

    for skill in as_list(coord_state.get("skills")):
        if not isinstance(skill, dict):
            continue
        skill_id = str(skill.get("id", "")).strip()
        if not skill_id:
            continue
        skill_count += 1
        conn.execute(
            """
            INSERT INTO skills (id, capabilities_json, version)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              capabilities_json = excluded.capabilities_json,
              version = excluded.version
            """,
            (
                skill_id,
                json.dumps(skill.get("capabilities", []) or [], ensure_ascii=False),
                str(skill.get("version", "")),
            ),
        )

    for task in as_list(coord_state.get("tasks")):
        if not isinstance(task, dict):
            continue
        task_id = str(task.get("id", "")).strip()
        if not task_id:
            continue
        task_count += 1
        conn.execute(
            """
            INSERT INTO tasks (id, required_caps_json, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              required_caps_json = excluded.required_caps_json,
              status = excluded.status,
              updated_at = excluded.updated_at
            """,
            (
                task_id,
                json.dumps(task.get("required_caps", []) or [], ensure_ascii=False),
                str(task.get("status", "pending")),
                utc_now_ts(),
                utc_now_ts(),
            ),
        )

    for session in as_list(coord_state.get("sessions")):
        if not isinstance(session, dict):
            continue
        session_id = str(session.get("id", "")).strip()
        if not session_id:
            continue
        session_count += 1
        conn.execute(
            """
            INSERT INTO sessions (id, task_id, agent_id, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              task_id = excluded.task_id,
              agent_id = excluded.agent_id,
              status = excluded.status,
              updated_at = excluded.updated_at
            """,
            (
                session_id,
                str(session.get("task_id", "")),
                str(session.get("agent_id", "")),
                str(session.get("status", "active")),
                utc_now_ts(),
                utc_now_ts(),
            ),
        )

    # Events are append-only in the draft. If you need idempotent re-runs,
    # add an event hash or import batch key in a follow-up revision.
    for event in as_list(coord_state.get("events")):
        if not isinstance(event, dict):
            continue
        event_count += 1
        conn.execute(
            """
            INSERT INTO events (type, entity_id, payload_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                str(event.get("type", "")),
                str(event.get("entity_id", "")),
                json.dumps(event.get("payload", {}) or {}, ensure_ascii=False),
                normalize_timestamp(event.get("timestamp")) or utc_now_ts(),
            ),
        )

    return agent_count, skill_count, task_count, session_count, event_count


def extract_top_level_lists(web_state: dict[str, Any], *keys: str) -> list[dict[str, Any]]:
    for key in keys:
        value = web_state.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def upsert_assets(conn: sqlite3.Connection, web_state: dict[str, Any]) -> int:
    assets = extract_top_level_lists(web_state, "assets", "uploaded_assets", "attachments")
    count = 0
    for asset in assets:
        storage_key = str(asset.get("storage_key") or asset.get("storageKey") or "").strip()
        if not storage_key:
            continue
        count += 1
        asset_id = str(asset.get("id") or Path(storage_key).stem or storage_key).strip()
        conn.execute(
            """
            INSERT INTO assets (id, storage_key, source, name, mime_type, size, url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(storage_key) DO UPDATE SET
              source = excluded.source,
              name = excluded.name,
              mime_type = excluded.mime_type,
              size = excluded.size,
              url = excluded.url
            """,
            (
                asset_id,
                storage_key,
                str(asset.get("source", "local_static_fallback")),
                str(asset.get("name", Path(storage_key).name)),
                str(asset.get("mime_type") or asset.get("mimeType") or ""),
                int(asset.get("size") or 0),
                str(asset.get("url") or ""),
                normalize_timestamp(asset.get("created_at")) or utc_now_ts(),
            ),
        )
    return count


def upsert_document_jobs(conn: sqlite3.Connection, web_state: dict[str, Any]) -> int:
    jobs = extract_top_level_lists(web_state, "document_parse_jobs", "parse_jobs")
    count = 0
    for job in jobs:
        job_id = str(job.get("id") or "").strip()
        input_path = str(job.get("input_path") or job.get("inputPath") or "").strip()
        output_dir = str(job.get("output_dir") or job.get("outputDir") or "").strip()
        if not job_id:
            if input_path:
                job_id = Path(input_path).stem or f"job-{count + 1}"
            elif output_dir:
                job_id = Path(output_dir).name or f"job-{count + 1}"
            else:
                continue
        count += 1
        conn.execute(
            """
            INSERT INTO document_parse_jobs (
              id, name, input_path, output_dir, status, markdown_path, content_list_path,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              input_path = excluded.input_path,
              output_dir = excluded.output_dir,
              status = excluded.status,
              markdown_path = excluded.markdown_path,
              content_list_path = excluded.content_list_path,
              updated_at = excluded.updated_at
            """,
            (
                job_id,
                str(job.get("name") or Path(input_path or job_id).stem or job_id),
                input_path,
                output_dir,
                str(job.get("status") or "queued"),
                str(job.get("markdown_path") or job.get("markdownPath") or ""),
                str(job.get("content_list_path") or job.get("contentListPath") or ""),
                normalize_timestamp(job.get("created_at")) or utc_now_ts(),
                normalize_timestamp(job.get("updated_at")) or utc_now_ts(),
            ),
        )
    return count


def summarize_db(conn: sqlite3.Connection) -> dict[str, int]:
    tables = [
        "config",
        "projects",
        "branches",
        "requirements",
        "agents",
        "skills",
        "tasks",
        "sessions",
        "events",
        "assets",
        "document_parse_jobs",
    ]
    summary: dict[str, int] = {}
    for table in tables:
        summary[table] = int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    return summary


def migrate(
    db_path: Path,
    schema_path: Path,
    web_state_path: Path,
    legacy_web_state_path: Path,
    coord_state_path: Path,
    legacy_coord_state_path: Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    current_web_state = read_json(web_state_path)
    legacy_web_state = read_json(legacy_web_state_path)
    merged_web_state = merge_web_state(current_web_state, legacy_web_state)

    current_coord_state = read_json(coord_state_path)
    legacy_coord_state = read_json(legacy_coord_state_path)
    merged_coord_state = merge_coord_state(current_coord_state, legacy_coord_state)

    if dry_run:
        return {
            "mode": "dry-run",
            "web_state_path": str(web_state_path),
            "legacy_web_state_path": str(legacy_web_state_path),
            "coord_state_path": str(coord_state_path),
            "legacy_coord_state_path": str(legacy_coord_state_path),
            "destination_db": str(db_path),
            "merged_input_counts": {
                "config": len(normalize_config(merged_web_state.get("config", {}))),
                "projects": len(merged_web_state.get("projects", [])),
                "branches": sum(len(project.get("branches", [])) for project in merged_web_state.get("projects", []) if isinstance(project, dict)),
                "requirements": sum(len(project.get("requirements", [])) for project in merged_web_state.get("projects", []) if isinstance(project, dict)),
                "agents": len(merged_coord_state.get("agents", [])),
                "skills": len(merged_coord_state.get("skills", [])),
                "tasks": len(merged_coord_state.get("tasks", [])),
                "sessions": len(merged_coord_state.get("sessions", [])),
                "events": len(merged_coord_state.get("events", [])),
                "assets": len(extract_top_level_lists(merged_web_state, "assets", "uploaded_assets", "attachments")),
                "document_parse_jobs": len(extract_top_level_lists(merged_web_state, "document_parse_jobs", "parse_jobs")),
            },
        }

    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        ensure_schema(conn, schema_path)

        config_count = upsert_config(conn, normalize_config(merged_web_state.get("config", {})))
        project_count, branch_count, requirement_count = upsert_projects(conn, merged_web_state.get("projects", []))
        asset_count = upsert_assets(conn, merged_web_state)
        job_count = upsert_document_jobs(conn, merged_web_state)
        agent_count, skill_count, task_count, session_count, event_count = upsert_coordination(conn, merged_coord_state)
        conn.commit()

        summary = summarize_db(conn)

    return {
        "mode": "migrated",
        "db_path": str(db_path),
        "counts": {
            "config_rows_written": config_count,
            "projects_written": project_count,
            "branches_written": branch_count,
            "requirements_written": requirement_count,
            "assets_written": asset_count,
            "document_parse_jobs_written": job_count,
            "agents_written": agent_count,
            "skills_written": skill_count,
            "tasks_written": task_count,
            "sessions_written": session_count,
            "events_written": event_count,
        },
        "summary": summary,
        "sources": {
            "web_state": str(web_state_path),
            "legacy_web_state": str(legacy_web_state_path),
            "coord_state": str(coord_state_path),
            "legacy_coord_state": str(legacy_coord_state_path),
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Mutesolo JSON -> SQLite migration draft")
    parser.add_argument("--db", default=".ai-agent/mutesolo.db", help="SQLite database path")
    parser.add_argument("--schema", default="schema.sql", help="SQLite schema path")
    parser.add_argument("--web-state", default=".ai-agent/web-state.json", help="Current web state JSON path")
    parser.add_argument("--legacy-web-state", default=".openclaw/web-state.json", help="Legacy web state JSON path")
    parser.add_argument("--coord-state", default=".ai-agent/state.json", help="Current coordination state JSON path")
    parser.add_argument("--legacy-coord-state", default=".openclaw/state.json", help="Legacy coordination state JSON path")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen without writing")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    result = migrate(
        db_path=Path(args.db),
        schema_path=Path(args.schema),
        web_state_path=Path(args.web_state),
        legacy_web_state_path=Path(args.legacy_web_state),
        coord_state_path=Path(args.coord_state),
        legacy_coord_state_path=Path(args.legacy_coord_state),
        dry_run=args.dry_run,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
