import { useState, useEffect, useCallback } from 'react';
import type { AppContextType } from '../App';
import {
  CpuChipIcon,
  CodeBracketIcon,
  ChatBubbleLeftIcon,
  PuzzlePieceIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import SettingsSection from '../components/SettingsSection';
import SettingsCard from '../components/SettingsCard';
import TextInput from '../components/TextInput';
import Toggle from '../components/Toggle';
import { buttonVariants } from '../variants';
import mergeTW from '../utils/mergeTW';
import { toast } from '../components/toastStore';
import { fetchConfig, saveConfig, type Config } from '../api/config';
import TransferBox from '../components/TransferBox';
import { fetchAIAgentStatus, fetchDiscordMembers, fetchDiscordGuildMembers, fetchAIAgentScreenshotMembers } from '../api/projects';

interface Props { ctx: AppContextType }

const emptyConfig: Config = {
  ai_agent_base_url: '',
  ai_agent_token: '',
  github_repo: '',
  discord_url: '',
  discord_widget_url: '',
  discord_bot_id: '',
  discord_bot_token: '',
  discord_guild_id: '',
  discord_bot_username: '',
  clawhub_base_url: '',
  clawhub_api_key: '',
  opencode_api_key: '',
  ark_api_key: '',
  github_token: '',
  llm_locked: false,
  agent_self_id: '',
  agent_member_ids: {},
};

function avatarText(name: string) {
  const compact = String(name || 'AI').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
  return compact.slice(0, 2).toUpperCase() || 'AI';
}

function avatarColor(value: string) {
  const palette = ['#5b8def', '#4dc89a', '#f1bd6c', '#e989d8', '#ff8b66', '#7c8cff', '#44b4a6'];
  let hash = 0;
  for (const char of String(value || 'ai-agent')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export default function Connections({ ctx: _ctx }: Props) {
  const [config, setConfig] = useState<Config>(emptyConfig);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [aiAgentStatus, setAiAgentStatus] = useState<{ online: boolean; name?: string; presence_count?: number; error?: string } | null>(null);
  const [discordMembers, setDiscordMembers] = useState<Array<{ id: string; username: string; status: string; avatar_url?: string }>>([]);
  const [screenshotMembers, setScreenshotMembers] = useState<Array<{ username: string; status: string }>>([]);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [selfIdentified, setSelfIdentified] = useState('');

  useEffect(() => {
    setScreenshotLoading(true);
    Promise.all([fetchConfig(), fetchAIAgentScreenshotMembers()])
      .then(([c, data]) => {
        setConfig({ ...emptyConfig, ...c });
        setExclusions(c.agent_exclusions || []);
        setSelfIdentified(c.agent_self || '');
        setScreenshotMembers(data.members || []);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setScreenshotLoading(false));

    fetchAIAgentStatus().then(setAiAgentStatus).catch(() => {});
    fetchDiscordMembers().then(data => {
      setDiscordMembers(data.members || []);
    }).catch(() => {});
  }, []);

  const update = useCallback((field: keyof Config, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await saveConfig(config);
      setConfig({ ...emptyConfig, ...saved });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const openDrawer = () => {
    if (!config.discord_widget_url) {
      toast('warning', 'Discord widget URL not configured in Connections');
      return;
    }
    setDrawerOpen(true);
  };

  const handleExclusionsChange = (newExclusions: string[], newSelfIdentified: string) => {
    setExclusions(newExclusions);
    setSelfIdentified(newSelfIdentified);
  };

  const handleExclusionsDone = async () => {
    // Fetch real Discord IDs via REST API (Bot Token required)
    let selfID = '';
    let memberIdMap: Record<string, string> = {};
    try {
      const freshData = await fetchDiscordGuildMembers();
      const members = freshData.members || [];
      let selfMember = members.find(m => m.username === selfIdentified);
      selfID = selfMember?.id || '';
      for (const m of members) {
        if (m.id) memberIdMap[m.username] = m.id;
      }
      // Fallback: if self not found in REST API, look in existing persisted agent_member_ids
      if (!selfID) {
        selfID = (config.agent_member_ids || {})[selfIdentified] || '';
      }
    } catch { /* Guild API may fail, save without IDs */ }

    const updatedConfig = {
      ...config,
      agent_exclusions: exclusions,
      agent_self: selfIdentified,
      agent_self_id: selfID,
      agent_member_ids: memberIdMap,
    };
    setConfig(updatedConfig);
    try {
      await saveConfig(updatedConfig);
      toast('success', 'Configuration saved successfully');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to save configuration');
    }
    setTransferOpen(false);
  };
  return (
    <section id="connectionsView" className="view activeView">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-[#f2f5f8]">Connections</h1>
            <p className="muted">Configure external service integrations</p>
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={mergeTW(buttonVariants.default, "disabled:cursor-not-allowed")}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
            {error}
          </div>
        )}

        <SettingsSection icon={<CpuChipIcon className="w-4 h-4" />} title="AI Agent">
          <SettingsCard title="Tailscale URL" description="AI Agent base URL via Tailscale">
            <TextInput value={config.ai_agent_base_url} onChange={v => update('ai_agent_base_url', v)} placeholder="https://..." />
          </SettingsCard>
          <SettingsCard title="Bearer Token" description="Authentication token">
            <TextInput value={config.ai_agent_token} onChange={v => update('ai_agent_token', v)} type="password" placeholder="Token" />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection icon={<CodeBracketIcon className="w-4 h-4" />} title="GitHub">
          <SettingsCard title="API Token" description="Personal access token for REST API">
            <TextInput value={config.github_token} onChange={v => update('github_token', v)} placeholder="ghp_..." />
          </SettingsCard>
          <SettingsCard title="Push Repo" description="Repository for local git push">
            <TextInput value={config.github_repo} onChange={v => update('github_repo', v)} placeholder="owner/repo" />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection icon={<ChatBubbleLeftIcon className="w-4 h-4" />} title="Discord">
          <SettingsCard title="Widget URL" description="Discord widget embed URL">
            <TextInput value={config.discord_widget_url} onChange={v => update('discord_widget_url', v)} placeholder="https://discord.com/widget..." />
          </SettingsCard>
          <SettingsCard title="Channel / DM URL" description="Discord channel or DM URL">
            <TextInput value={config.discord_url} onChange={v => update('discord_url', v)} placeholder="https://discord.com/channels/..." />
          </SettingsCard>
          <SettingsCard title="Bot ID" description="Discord bot application ID">
            <TextInput value={config.discord_bot_id} onChange={v => update('discord_bot_id', v)} placeholder="Bot ID" />
          </SettingsCard>
          <SettingsCard title="Bot Token" description="Discord bot token for REST API access (requires GUILD_MEMBERS intent)">
            <TextInput value={config.discord_bot_token} onChange={v => update('discord_bot_token', v)} type="password" placeholder="Bot token" />
          </SettingsCard>
          <SettingsCard title="Guild ID" description="Discord server (guild) ID">
            <TextInput value={config.discord_guild_id} onChange={v => update('discord_guild_id', v)} placeholder="Guild ID" />
          </SettingsCard>
          <SettingsCard title="Bot Username" description="Discord bot display name">
            <TextInput value={config.discord_bot_username} onChange={v => update('discord_bot_username', v)} placeholder="Bot username" />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection icon={<PuzzlePieceIcon className="w-4 h-4" />} title="ClawHub">
          <SettingsCard title="Private URL" description="ClawHub private instance URL">
            <TextInput value={config.clawhub_base_url} onChange={v => update('clawhub_base_url', v)} placeholder="https://..." />
          </SettingsCard>
          <SettingsCard title="API Key" description="ClawHub API key for authentication">
            <TextInput value={config.clawhub_api_key} onChange={v => update('clawhub_api_key', v)} type="password" placeholder="clh_..." />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection icon={<KeyIcon className="w-4 h-4" />} title="LLM">
          <SettingsCard title="API Key" description="OpenCode API key for prompt generation">
            <TextInput value={config.opencode_api_key} onChange={v => update('opencode_api_key', v)} type="password" placeholder="opencode_..." />
          </SettingsCard>
          <SettingsCard title="Ark API Key" description="Ark API Key for LLM access">
            <TextInput value={config.ark_api_key} onChange={v => update('ark_api_key', v)} type="password" placeholder="ark_..." />
          </SettingsCard>
          <SettingsCard title="Locked" description="Prevent accidental edits to LLM config">
            <div className="flex justify-end">
              <Toggle enabled={config.llm_locked} onChange={v => update('llm_locked', v)} />
            </div>
          </SettingsCard>
        </SettingsSection>

        {/* AI Agent Members — Team members card style */}
        <div className="mt-8">
          <div className="items-start justify-between sm:flex mb-6">
            <div>
              <h4 className="text-[#f2f5f8] text-lg font-semibold">AI Agent Members</h4>
              <p className="mt-2 text-[#8b95a5] text-sm">
                Members detected from the Discord widget via headless screenshot.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className={mergeTW(buttonVariants.secondary, "mt-2 sm:mt-0")}
                onClick={() => setTransferOpen(true)}
              >
                Setting
              </button>
              <button
                className={mergeTW(buttonVariants.secondary, "mt-2 sm:mt-0")}
                disabled={screenshotLoading}
                onClick={async () => {
                setScreenshotLoading(true);
                try {
                  const [c, data] = await Promise.all([fetchConfig(), fetchAIAgentScreenshotMembers()]);
                  setConfig({ ...emptyConfig, ...c });
                  setExclusions(c.agent_exclusions || []);
                  setSelfIdentified(c.agent_self || '');
                  setScreenshotMembers(data.members || []);
                } catch { /* ignore */ }
                finally { setScreenshotLoading(false); }
              }}
            >
              {screenshotLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg bg-white/5 border border-white/10">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${aiAgentStatus?.online ? 'bg-[#4dc89a]' : 'bg-[#ff8b66]'}`} />
            <span className="text-[#f2f5f8] text-sm font-medium">
              {aiAgentStatus?.online ? 'AI Agent online' : 'AI Agent offline'}
            </span>
            {aiAgentStatus?.online && (
              <span className="text-[#8b95a5] text-xs ml-auto">
                {aiAgentStatus.name || 'agent'} · {aiAgentStatus.presence_count || 0} online
              </span>
            )}
            {!aiAgentStatus?.online && aiAgentStatus?.error && (
              <span className="text-[#8b95a5] text-xs ml-auto">{aiAgentStatus.error}</span>
            )}
          </div>

          {screenshotMembers.length === 0 ? (
            <div className="px-4 py-8 text-center text-[#8b95a5] text-sm border border-dashed border-white/10 rounded-xl">
              {screenshotLoading
                ? 'Capturing Discord widget...'
                : 'No AI Agent members detected. Ensure Discord Widget URL or Guild ID is configured in Connections settings above.'}
            </div>
          ) : (
            <ul className="divide-y divide-white/5 border border-white/10 rounded-xl bg-white/[0.03]">
              {screenshotMembers.filter(m => !exclusions.includes(m.username) && m.username !== selfIdentified).map((member, idx) => (
                <li key={idx} className="px-5 py-4 flex items-start justify-between">
                  <div className="flex gap-3 items-center">
                    {/* Avatar circle */}
                    <div
                      className="flex-none w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: avatarColor(member.username) }}
                    >
                      {avatarText(member.username)}
                    </div>
                    <div>
                      <span className="block text-sm text-[#f2f5f8] font-semibold">{member.username}</span>
                      <span className="block text-xs text-[#8b95a5] capitalize">{member.status}</span>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                    ${member.status === 'online' ? 'bg-[#4dc89a]/20 text-[#4dc89a]' :
                      member.status === 'idle' ? 'bg-[#f1bd6c]/20 text-[#f1bd6c]' :
                      member.status === 'dnd' ? 'bg-[#ff8b66]/20 text-[#ff8b66]' :
                      'bg-white/10 text-[#8b95a5]'}`}
                  >
                    {member.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Discord Widget quick panel */}
          <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[#f2f5f8] text-sm font-semibold">Discord Widget</h4>
                <p className="text-[#8b95a5] text-xs mt-1">
                  {discordMembers.length > 0 ? `${discordMembers.length} members from widget API` : 'View the Discord server widget'}
                </p>
              </div>
              <button
                className={mergeTW(buttonVariants.secondary)}
                type="button"
                onClick={openDrawer}
              >
                Open Widget
              </button>
            </div>
            {discordMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {discordMembers.slice(0, 8).map(member => (
                  <div
                    key={member.username}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-xs text-[#f2f5f8]"
                    title={`${member.username} · ${member.status}`}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: avatarColor(member.username) }}
                    >
                      {avatarText(member.username)}
                    </div>
                    {member.username}
                  </div>
                ))}
                {discordMembers.length > 8 && (
                  <span className="text-xs text-[#8b95a5] self-center">+{discordMembers.length - 8} more</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TransferBox Modal */}
      {transferOpen && (
        <TransferBox
          available={screenshotMembers.map(m => m.username).filter(u => !exclusions.includes(u) && u !== selfIdentified)}
          selected={exclusions}
          selfIdentified={selfIdentified}
          onChange={handleExclusionsChange}
          onClose={() => setTransferOpen(false)}
          onDone={handleExclusionsDone}
        />
      )}

      {/* Discord Drawer — only render when open */}
      {drawerOpen && (
        <>
          <div
            className="discordDrawerOverlay open"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="discordDrawer open">
            <div className="discordDrawerHead">
              <h3>Discord Widget</h3>
              <button className="discordDrawerClose" type="button" onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            {config.discord_widget_url.includes('<iframe') || config.discord_widget_url.includes('<') ? (
              <div
                className="w-full h-full"
                dangerouslySetInnerHTML={{ __html: config.discord_widget_url }}
              />
            ) : (
              <iframe
                title="Discord server widget"
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                src={config.discord_widget_url}
              />
            )}
          </aside>
        </>
      )}
    </section>
  );
}
