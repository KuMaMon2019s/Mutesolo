import { fetchAIAgentScreenshotMembers } from './projects';
import { fetchConfig } from './config';

/**
 * agents = members - agent_exclusions
 * Returns only non-excluded members (the actual agents).
 * IDs come from agent_member_ids in config (persisted once at Done time).
 * On first use, IDs will be empty until user completes Agent Exclusion Setting.
 */
export async function fetchAgents(): Promise<Array<{ id?: string; username: string; status: string }>> {
  const [membersData, cfg] = await Promise.all([
    fetchAIAgentScreenshotMembers(),
    fetchConfig(),
  ]);

  // ID map from config — set once when Done clicked, persists forever
  const idMap: Record<string, string> = cfg.agent_member_ids || {};

  const exclusions = cfg.agent_exclusions || [];
  return (membersData.members || [])
    .filter(m => !exclusions.includes(m.username))
    .map(m => ({
      ...m,
      id: m.id || idMap[m.username] || '',
    }));
}
