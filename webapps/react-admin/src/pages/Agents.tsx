import { useEffect, useState } from 'react';
import { fetchConfig, type Config } from '../api/config';

interface AIAgentStatus {
  online: boolean;
  name?: string;
  avatar_url?: string;
  presence_count: number;
  error?: string;
  checked_at: string;
}

interface DiscordMember {
  id: string;
  username: string;
  status: string;
  avatar_url: string;
}

const statusDot: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  offline: 'bg-zinc-500',
};

export default function Agents() {
  const [agent, setAgent] = useState<AIAgentStatus | null>(null);
  const [members, setMembers] = useState<DiscordMember[]>([]);
  const [guildId, setGuildId] = useState('');
  const [agentError, setAgentError] = useState('');
  const [membersError, setMembersError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/ai-agent/status').then((r) => r.json()).then((d: AIAgentStatus) => setAgent(d)).catch((e) => setAgentError(e.message)),
      fetchConfig().then((c: Config) => setGuildId(c.discord_guild_id)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!guildId) return;
    fetch('/api/discord/members')
      .then((r) => r.json())
      .then((d: { members: DiscordMember[]; error?: string }) => {
        if (d.error) setMembersError(d.error);
        setMembers(d.members || []);
      })
      .catch((e) => setMembersError(e.message));
  }, [guildId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500 text-sm">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Agents</h1>
        <p className="text-sm text-zinc-500 mt-1">AI agent status and Discord members</p>
      </div>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-zinc-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h9a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 15.75 4.5h-9A2.25 2.25 0 0 0 4.5 6.75v10.5A2.25 2.25 0 0 0 6.75 19.5Z" />
            </svg>
          </span>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">AI Agent</h2>
        </div>
        <div className="p-5 rounded-xl bg-zinc-800/60 border border-zinc-700/60">
          {agentError ? (
            <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
              {agentError}
            </div>
          ) : agent ? (
            <div className="flex items-center gap-5">
              <div className="relative">
                {agent.avatar_url ? (
                  <img src={agent.avatar_url} alt="" className="w-14 h-14 rounded-full bg-zinc-700" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center">
                    <svg className="w-7 h-7 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h9a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 15.75 4.5h-9A2.25 2.25 0 0 0 4.5 6.75v10.5A2.25 2.25 0 0 0 6.75 19.5Z" />
                    </svg>
                  </div>
                )}
                <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-zinc-800 ${agent.online ? 'bg-green-500' : 'bg-red-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-white">{agent.name || 'AI Agent'}</p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {agent.online ? 'Online' : 'Offline'}
                  {agent.presence_count > 0 && ` · ${agent.presence_count} presence${agent.presence_count > 1 ? 's' : ''}`}
                </p>
                {agent.checked_at && (
                  <p className="text-xs text-zinc-600 mt-1">Checked: {new Date(agent.checked_at).toLocaleString()}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No agent status available</p>
          )}
        </div>
      </section>

      {guildId && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-zinc-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
            </span>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Discord Members</h2>
          </div>
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/60 overflow-hidden">
            {membersError && !members.length ? (
              <div className="px-5 py-4 text-sm text-zinc-500">
                Could not load members: {membersError}
              </div>
            ) : members.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-zinc-500 text-sm">No members found</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-700/60">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Member</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-zinc-700/30 hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full bg-zinc-700" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400 font-medium">
                              {m.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-medium text-white">{m.username}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${statusDot[m.status] || statusDot.offline}`} />
                          <span className="text-sm text-zinc-400 capitalize">{m.status || 'offline'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
