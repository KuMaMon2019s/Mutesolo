import { useEffect, useState } from 'react';
import {
  FolderIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { fetchState, type Project, type Requirement } from '../api/state';
import Badge from '../components/Badge';

interface StatCard {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchState()
      .then((state) => setProjects(state.projects))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  const allRequirements: (Requirement & { projectName: string })[] = projects.flatMap((p) =>
    p.requirements.map((r) => ({ ...r, projectName: p.name })),
  );

  const totalReqs = allRequirements.length;
  const sentCount = allRequirements.filter((r) => r.status === 'sent').length;
  const doneCount = allRequirements.filter((r) => r.status === 'done').length;

  const stats: StatCard[] = [
    { label: 'Total Projects', value: projects.length, icon: <FolderIcon className="w-6 h-6" />, color: 'text-blue-400 bg-blue-400/10' },
    { label: 'Total Requirements', value: totalReqs, icon: <DocumentTextIcon className="w-6 h-6" />, color: 'text-purple-400 bg-purple-400/10' },
    { label: 'Sent', value: sentCount, icon: <PaperAirplaneIcon className="w-6 h-6" />, color: 'text-amber-400 bg-amber-400/10' },
    { label: 'Done', value: doneCount, icon: <CheckCircleIcon className="w-6 h-6" />, color: 'text-green-400 bg-green-400/10' },
  ];

  const recent = [...allRequirements]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Overview of your projects and requirements</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="
              p-5 rounded-xl
              bg-zinc-800/60 border border-zinc-700/60
              hover:border-zinc-600 transition-colors duration-150
            "
          >
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3 ${stat.color}`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-zinc-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-700/60">
          <h2 className="text-sm font-semibold text-zinc-300">Recent Activity</h2>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-zinc-500 text-sm">No requirements yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-700/40">
            {recent.map((req) => (
              <li key={req.id} className="flex items-center justify-between px-5 py-3 hover:bg-zinc-800/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{req.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{req.projectName}</p>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <Badge value={req.status || 'draft'} variant="status" />
                  <span className="text-xs text-zinc-600 w-16 text-right">{formatTimeAgo(req.updated_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
