import { useState, useEffect } from 'react';
import type { AppContextType } from '../App';
import { fetchAgentTasks, type AgentTask } from '../api/projects';
import { toast } from '../components/toastStore';

function avatarText(name: string) {
  const compact = String(name || 'AI').replace(/[^a-zA-Z0-9]/g, '');
  return compact.slice(0, 2).toUpperCase() || 'AI';
}

function avatarColor(value: string) {
  const palette = ['#5b8def', '#4dc89a', '#f1bd6c', '#e989d8', '#ff8b66', '#7c8cff', '#44b4a6'];
  let hash = 0;
  for (const char of String(value || 'agent')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

const statusLabels: Record<string, string> = {
  draft: 'Backlog',
  sent: 'To Do',
  in_progress: 'In Progress',
  closed: 'Done',
};

const statusColors: Record<string, string> = {
  draft: '#ff8b66',
  sent: '#8b95a5',
  in_progress: '#5b8def',
  closed: '#4dc89a',
};

interface Props { ctx: AppContextType }

export default function AgentDetail({ ctx }: Props) {
  const member = ctx.selectedAgent;
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!member) return;
    setLoading(true);
    fetchAgentTasks(member)
      .then(data => setTasks(data.tasks || []))
      .catch(e => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [member]);

  // Group by project → branch
  const grouped = new Map<string, Map<string, AgentTask[]>>();
  for (const t of tasks) {
    if (!grouped.has(t.project_id)) grouped.set(t.project_id, new Map());
    const branches = grouped.get(t.project_id)!;
    const branchKey = t.branch_name || t.branch_id || 'main';
    if (!branches.has(branchKey)) branches.set(branchKey, []);
    branches.get(branchKey)!.push(t);
  }

  if (!member) return null;

  return (
    <section className="view activeView" id="agentDetailView">
      <div className="viewHead">
        <div className="flex items-center gap-3">
          <button
            onClick={() => ctx.setView('boardView')}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[#8b95a5] hover:text-white transition-colors"
            title="Back to Board"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <p className="breadcrumb">Agent / Tasks</p>
            <div className="flex items-center gap-3">
              <div
                className="rounded-full"
                style={{
                  width: 40, height: 40,
                  backgroundColor: avatarColor(member),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 16,
                }}
              >
                {avatarText(member)}
              </div>
              <h2 className="text-2xl font-bold text-white">{member}</h2>
            </div>
          </div>
        </div>
        <p className="muted">
          {loading ? 'Loading...' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''} across ${grouped.size} project${grouped.size !== 1 ? 's' : ''}`}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#8b95a5]">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-[#8b95a5]">No tasks assigned.</div>
      ) : (
        <div className="agentTaskList">
          {[...grouped.entries()].map(([projectId, branches]) => {
            const proj = tasks.find(t => t.project_id === projectId);
            return (
              <div key={projectId} className="agentProjectBlock">
                <h3 className="agentProjectName">{proj?.project_name || projectId}</h3>
                {[...branches.entries()].map(([branchName, branchTasks]) => (
                  <div key={branchName} className="agentBranchBlock">
                    <h4 className="agentBranchName">{branchName}</h4>
                    <div className="agentTaskCards">
                      {branchTasks.map(t => (
                        <div key={t.requirement_id} className="agentTaskCard">
                          <span
                            className="agentTaskStatus"
                            style={{ backgroundColor: statusColors[t.status] || '#8b95a5' }}
                          >
                            {statusLabels[t.status] || t.status}
                          </span>
                          <span className="agentTaskTitle">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
