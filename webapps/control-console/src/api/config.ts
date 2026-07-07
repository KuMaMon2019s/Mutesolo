import { api } from './client';

export interface Config {
  ai_agent_base_url: string;
  ai_agent_token: string;
  github_repo: string;
  discord_url: string;
  discord_widget_url: string;
  discord_bot_id: string;
  discord_guild_id: string;
  discord_bot_username: string;
  clawhub_base_url: string;
  llm_api_key: string;
  llm_locked: boolean;
}

export async function fetchConfig(): Promise<Config> {
  return api<Config>('/api/config');
}

export async function saveConfig(config: Partial<Config>): Promise<Config> {
  return api<Config>('/api/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}
