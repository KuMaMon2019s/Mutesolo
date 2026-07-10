import type { Config } from './config';
import { api } from './client';

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
  assigned_member?: string;
  prompt?: string;
  commit_id?: string;
  editor_content?: unknown;
  attachments?: unknown;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  plan: string;
  docs: string;
  cover_url?: string;
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
  return api<AppState>('/api/state');
}
