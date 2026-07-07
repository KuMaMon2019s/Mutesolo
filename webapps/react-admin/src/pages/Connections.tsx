import { useEffect, useState, useCallback } from 'react';
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
import { fetchConfig, saveConfig, type Config } from '../api/config';

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

export default function Connections() {
  const [config, setConfig] = useState<Config>(emptyConfig);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConfig()
      .then((c) => setConfig({ ...emptyConfig, ...c }))
      .catch((e) => setError(e.message));
  }, []);

  const update = useCallback((field: keyof Config, value: string | boolean) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Connections</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure external service integrations</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="
            px-4 py-2 rounded-lg text-sm font-medium
            bg-blue-600 text-white
            hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors duration-150
          "
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
          {error}
        </div>
      )}

      <SettingsSection
        icon={<CpuChipIcon className="w-4 h-4" />}
        title="AI Agent"
      >
        <SettingsCard title="Tailscale URL" description="AI Agent base URL via Tailscale">
          <TextInput value={config.ai_agent_base_url} onChange={(v) => update('ai_agent_base_url', v)} placeholder="https://..." />
        </SettingsCard>
        <SettingsCard title="Bearer Token" description="Authentication token">
          <TextInput value={config.ai_agent_token} onChange={(v) => update('ai_agent_token', v)} type="password" placeholder="Token" />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        icon={<CodeBracketIcon className="w-4 h-4" />}
        title="GitHub"
      >
        <SettingsCard title="Repository" description="Target GitHub repository">
          <TextInput value={config.github_repo} onChange={(v) => update('github_repo', v)} placeholder="owner/repo" />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        icon={<ChatBubbleLeftIcon className="w-4 h-4" />}
        title="Discord"
      >
        <SettingsCard title="Widget URL" description="Discord widget embed URL">
          <TextInput value={config.discord_widget_url} onChange={(v) => update('discord_widget_url', v)} placeholder="https://discord.com/widget..." />
        </SettingsCard>
        <SettingsCard title="Channel / DM URL" description="Discord channel or DM URL">
          <TextInput value={config.discord_url} onChange={(v) => update('discord_url', v)} placeholder="https://discord.com/channels/..." />
        </SettingsCard>
        <SettingsCard title="Bot ID" description="Discord bot application ID">
          <TextInput value={config.discord_bot_id} onChange={(v) => update('discord_bot_id', v)} placeholder="Bot ID" />
        </SettingsCard>
        <SettingsCard title="Guild ID" description="Discord server (guild) ID">
          <TextInput value={config.discord_guild_id} onChange={(v) => update('discord_guild_id', v)} placeholder="Guild ID" />
        </SettingsCard>
        <SettingsCard title="Bot Username" description="Discord bot display name">
          <TextInput value={config.discord_bot_username} onChange={(v) => update('discord_bot_username', v)} placeholder="Bot username" />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        icon={<PuzzlePieceIcon className="w-4 h-4" />}
        title="ClawHub"
      >
        <SettingsCard title="Private URL" description="ClawHub private instance URL">
          <TextInput value={config.clawhub_base_url} onChange={(v) => update('clawhub_base_url', v)} placeholder="https://..." />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        icon={<KeyIcon className="w-4 h-4" />}
        title="LLM"
      >
        <SettingsCard title="API Key" description="LLM provider API key">
          <TextInput value={config.llm_api_key} onChange={(v) => update('llm_api_key', v)} type="password" placeholder="API key" />
        </SettingsCard>
        <SettingsCard title="Locked" description="Prevent accidental edits to LLM config">
          <div className="flex justify-end">
            <Toggle enabled={config.llm_locked} onChange={(v) => update('llm_locked', v)} />
          </div>
        </SettingsCard>
      </SettingsSection>

      {config.discord_widget_url && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-zinc-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.047 5.25.899 11.291a1.5 1.5 0 0 0 1.493 1.21h15.122a1.5 1.5 0 0 0 1.493-1.21l.899-11.291A1.5 1.5 0 0 0 20.46 4H3.54a1.5 1.5 0 0 0-1.493 1.25ZM9 10h.01M15 10h.01M9.5 15a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5Z" />
              </svg>
            </span>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Widget Preview</h2>
          </div>
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/60 p-5">
            {config.discord_widget_url.includes('<iframe') || config.discord_widget_url.includes('<') ? (
              <div
                className="rounded-lg overflow-hidden bg-white"
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
  );
}
