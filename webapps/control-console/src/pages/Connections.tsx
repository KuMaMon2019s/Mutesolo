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
import { fetchConfig, saveConfig, type Config } from '../api/config';
import { fetchAIAgentStatus, fetchDiscordMembers } from '../api/projects';

interface Props { ctx: AppContextType }

const emptyConfig: Config = {
  ai_agent_base_url: '',
  ai_agent_token: '',
  github_repo: '',
  discord_url: '',
  discord_widget_url: '',
  discord_bot_id: '',
  discord_guild_id: '',
  discord_bot_username: '',
  clawhub_base_url: '',
  llm_api_key: '',
  llm_locked: false,
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
  const [discordMembers, setDiscordMembers] = useState<Array<{ username: string; status: string; avatar_url?: string }>>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetchConfig()
      .then(c => setConfig({ ...emptyConfig, ...c }))
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    fetchAIAgentStatus().then(setAiAgentStatus).catch(() => {});
    fetchDiscordMembers().then(data => {
      setDiscordMembers((data.members || []).filter(m => m.username.toLowerCase() !== 'doraemon'));
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
      alert('Discord widget URL not configured in Connections');
      return;
    }
    setDrawerOpen(true);
  };

  return (
    <section id="connectionsView" className="view activeView">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">Connections</h1>
            <p className="text-sm text-zinc-500 mt-1">Configure external service integrations</p>
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
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
          <SettingsCard title="Repository" description="Target GitHub repository">
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
        </SettingsSection>

        <SettingsSection icon={<KeyIcon className="w-4 h-4" />} title="LLM">
          <SettingsCard title="API Key" description="LLM provider API key">
            <TextInput value={config.llm_api_key} onChange={v => update('llm_api_key', v)} type="password" placeholder="API key" />
          </SettingsCard>
          <SettingsCard title="Locked" description="Prevent accidental edits to LLM config">
            <div className="flex justify-end">
              <Toggle enabled={config.llm_locked} onChange={v => update('llm_locked', v)} />
            </div>
          </SettingsCard>
        </SettingsSection>

        {/* Status panels — old UI style */}
        <div className="statusGrid" style={{ marginTop: '16px' }}>
          <div className="panel">
            <h2>AI Agent</h2>
            <div className="statusLine">
              <span className={`dot ${aiAgentStatus?.online ? 'ok' : 'bad'}`} />
              <strong>{aiAgentStatus?.online ? 'AI Agent online' : 'AI Agent offline'}</strong>
            </div>
            <p className="muted" style={{ color: '#d8dee8' }}>
              {aiAgentStatus?.online
                ? `${aiAgentStatus.name || 'agent'} · ${aiAgentStatus.presence_count || 0} online`
                : aiAgentStatus?.error || 'not reachable'}
            </p>
          </div>
          <div className="panel">
            <h2>Discord Widget</h2>
            <button className={mergeTW(buttonVariants.primary)} type="button" onClick={openDrawer}>Open Discord</button>
          </div>

          {/* AI Agent Strip */}
          <div className="aiAgentStrip panel" style={{ gridColumn: '1 / -1' }}>
            {discordMembers.length === 0 ? (
              <span className="empty" style={{ color: '#d8dee8' }}>No Discord members online</span>
            ) : (
              <>
                <span className="stripLabel">AI Agent</span>
                <div className="aiAgentAvatars">
                  {discordMembers.map(member => (
                    <div
                      key={member.username}
                      className={`aiAgentAvatar ${member.status === 'online' ? 'online' : 'offline'}`}
                      style={{ '--avatar-bg': avatarColor(member.username) } as React.CSSProperties}
                      title={`${member.username} · ${member.status}`}
                    >
                      {member.avatar_url
                        ? <img className="avatarImg" src={member.avatar_url} alt={member.username} />
                        : <span className="avatarFace">{avatarText(member.username)}</span>
                      }
                      <span className="presenceDot" />
                      <span className="avatarName">{member.username}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Widget Preview */}
        {config.discord_widget_url && (
          <section style={{ marginTop: '24px' }}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-white">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.047 5.25.899 11.291a1.5 1.5 0 0 0 1.493 1.21h15.122a1.5 1.5 0 0 0 1.493-1.21l.899-11.291A1.5 1.5 0 0 0 20.46 4H3.54a1.5 1.5 0 0 0-1.493 1.25ZM9 10h.01M15 10h.01M9.5 15a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5Z" />
                </svg>
              </span>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Widget Preview</h2>
            </div>
            <div className="rounded-xl bg-zinc-900 border border-zinc-700/60 p-5">
              {config.discord_widget_url.includes('<iframe') || config.discord_widget_url.includes('<') ? (
                <div
                  className="rounded-lg overflow-hidden bg-zinc-950"
                  dangerouslySetInnerHTML={{ __html: config.discord_widget_url }}
                />
              ) : (
                <iframe
                  src={config.discord_widget_url}
                  title="Discord Widget"
                  className="w-full h-[500px] rounded-lg border-0"
                />
              )}
            </div>
          </section>
        )}
      </div>

      {/* Discord Drawer */}
      <div
        className={`discordDrawerOverlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`discordDrawer ${drawerOpen ? 'open' : ''}`}>
        <div className="discordDrawerHead">
          <h3>Discord Widget</h3>
          <button className="discordDrawerClose" type="button" onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        <iframe
          title="Discord server widget"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          src={drawerOpen ? config.discord_widget_url : undefined}
        />
      </aside>
    </section>
  );
}
