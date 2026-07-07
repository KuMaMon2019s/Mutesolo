import { api } from './client';
import type { Project, Requirement, ProjectBranch } from './state';

export async function createProject(input: { name: string; description: string; plan: string; docs: string }): Promise<Project> {
  return api<Project>('/api/projects', { method: 'POST', body: JSON.stringify(input) });
}

export async function createBranch(projectId: string, name: string): Promise<ProjectBranch> {
  return api<ProjectBranch>(`/api/projects/${projectId}/branches`, { method: 'POST', body: JSON.stringify({ name }) });
}

export async function createRequirement(projectId: string, input: Partial<Requirement>): Promise<Requirement> {
  return api<Requirement>(`/api/projects/${projectId}/requirements`, { method: 'POST', body: JSON.stringify(input) });
}

export async function updateRequirement(projectId: string, reqId: string, input: Partial<Requirement>): Promise<Requirement> {
  return api<Requirement>(`/api/projects/${projectId}/requirements/${encodeURIComponent(reqId)}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function updateBoard(projectId: string, input: { requirement_ids: string[]; status?: string; branch_id?: string; agent_id?: string }) {
  return api(`/api/projects/${projectId}/board`, { method: 'POST', body: JSON.stringify(input) });
}

export async function generatePrompt(projectId: string, input: {
  requirement_id: string;
  blocks: unknown[];
  tencentDocs: unknown[];
  attachments: unknown[];
  plainText: string;
  llm: { provider: string; api_key: string };
}) {
  return api<{ prompt: string; artifact_path: string; discord_text: string; segments?: string[] }>(
    `/api/projects/${projectId}/prompt`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function testLLM(llm: { provider: string; api_key: string }) {
  return api<{ ok: boolean; expected: string; response: string }>('/api/llm/test', {
    method: 'POST',
    body: JSON.stringify({ llm }),
  });
}

export async function pushGitHub() {
  return api<{ status: string }>('/api/github/push', { method: 'POST', body: '{}' });
}

export async function fetchAIAgentStatus() {
  return api<{ online: boolean; name?: string; presence_count?: number; error?: string }>('/api/ai-agent/status');
}

export async function fetchTailscaleDevices() {
  return api<{ devices: Array<{ id: string; name: string; dns_name?: string; online: boolean; ai_agent_url?: string }>; error?: string }>('/api/tailscale/devices');
}

export async function fetchDiscordMembers() {
  return api<{ members: Array<{ username: string; status: string; avatar_url?: string }>; error?: string }>('/api/discord/members');
}

export async function fetchClawHubSkills() {
  return api<Array<{ id: string; name?: string; capabilities?: string[]; version?: string; description?: string; runtime?: string; entrypoint?: string }>>('/api/clawhub/skills');
}

export async function fetchClawHubSkillDetail(skillId: string) {
  return api<{ id: string; name?: string; description?: string; capabilities?: string[]; runtime?: string; entrypoint?: string }>(`/api/clawhub/skills/${encodeURIComponent(skillId)}`);
}

export async function installSkill(skillId: string, agentId: string) {
  return api<{ result: { sent?: boolean; message?: string } }>(`/api/clawhub/skills/${encodeURIComponent(skillId)}/install`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId }),
  });
}

export async function fetchPluginRuntimes() {
  return api<Array<{ name: string; extensions?: string[]; command_hint?: string }>>('/api/plugin-runtimes');
}
