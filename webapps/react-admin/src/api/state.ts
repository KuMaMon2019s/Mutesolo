import type { Config } from './config';

export interface ProjectBranch {
  id: string;
  name: string;
  created_at: string;
}

export interface Requirement {
  id: string;
  branch_id?: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  agent_id?: string;
  prompt?: string;
  commit_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  plan: string;
  docs: string;
  branches: ProjectBranch[];
  requirements: Requirement[];
  created_at: string;
  updated_at: string;
}

export interface AppState {
  config: Config;
  projects: Project[];
}

export async function fetchState(): Promise<AppState> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`GET /api/state: ${res.statusText}`);
  return res.json();
}
