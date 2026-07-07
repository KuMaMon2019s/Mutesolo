import type { Project, Requirement } from './state';

export async function createProject(data: {
  name: string;
  description?: string;
  plan?: string;
}): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export async function addRequirement(
  projectId: string,
  data: {
    title: string;
    description?: string;
    priority?: string;
    branch_id?: string;
  },
): Promise<Requirement> {
  const res = await fetch(`/api/projects/${projectId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export async function updateRequirement(
  projectId: string,
  reqId: string,
  data: {
    title: string;
    description?: string;
    priority?: string;
    branch_id?: string;
  },
): Promise<Requirement> {
  const res = await fetch(`/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export async function updateBoard(
  projectId: string,
  data: {
    requirement_ids: string[];
    status: string;
    branch_id?: string;
    agent_id?: string;
    commit_id?: string;
  },
): Promise<Requirement[]> {
  const res = await fetch(`/api/projects/${projectId}/board`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}
