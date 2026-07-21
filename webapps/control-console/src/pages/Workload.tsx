import { useState, useEffect } from 'react';
import { useEffectEvent } from 'react';
import type { AppContextType } from '../App';
import { fetchAgentWorkload, fetchAgentTasks, type AgentWorkload, type AgentTask } from '../api/projects';
import { fetchAgents } from '../api/agents';
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
  backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', done: 'Done',
};

const statusColors: Record<string, string> = {
  backlog: '#ff8b66', todo: '#8b95a5', in_progress: '#5b8def', done: '#4dc89a',
};

interface Props { ctx: AppContextType }

export default function Workload({ ctx }: Props) {
  const projects = ctx.state?.projects ?? [];
  const [onlineAgents, setOnlineAgents] = useState<Array<{ username: string; status: string }>>([]);
  const [workloadMap, setWorkloadMap] = useState<Record<string, AgentWorkload>>({});
  const [selectedAgent, setSelectedAgent] = useState(ctx.selectedAgent || '');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAgents(), fetchAgentWorkload()])
      .then(([agents, workloads]) => {
        setOnlineAgents(agents);
        const map: Record<string, AgentWorkload> = {};
        for (const wl of workloads) map[wl.agent] = wl;
        setWorkloadMap(map);
        if (!selectedAgent && agents.length > 0) {
          setSelectedAgent(ctx.selectedAgent || agents[0].username);
        }
      }).catch(e => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAgent || !selectedProject || !selectedBranch) {
      setTasks([]);
      return;
    }
    setTasksLoading(true);
    fetchAgentTasks(selectedAgent, selectedProject)
      .then(data => {
        setTasks((data.tasks || []).filter(t => t.branch_id === selectedBranch));
      })
      .catch(e => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setTasksLoading(false));
  }, [selectedAgent, selectedProject, selectedBranch]);

  // ── Polling: refresh tasks every 5s without re-rendering unnecessarily ──
  const refreshTasks = useEffectEvent(async () => {
    if (!selectedAgent || !selectedProject || !selectedBranch) return;
    try {
      const data = await fetchAgentTasks(selectedAgent, selectedProject);
      setTasks((data.tasks || []).filter(t => t.branch_id === selectedBranch));
    } catch {
      // silent fail on poll
    }
  });

  useEffect(() => {
    const id = setInterval(refreshTasks, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Polling: refresh workloads & agents every 15s ──
  const refreshWorkloads = useEffectEvent(async () => {
    try {
      const [agents, workloads] = await Promise.all([
        fetchAgents(),
        fetchAgentWorkload(),
      ]);
      setOnlineAgents(agents);
      const map: Record<string, AgentWorkload> = {};
      for (const wl of workloads) map[wl.agent] = wl;
      setWorkloadMap(map);
    } catch {
      // silent fail on poll
    }
  });

  useEffect(() => {
    const id = setInterval(refreshWorkloads, 15000);
    return () => clearInterval(id);
  }, []);

  const handleAgentClick = (agent: string) => setSelectedAgent(agent);
  const handleProjectClick = (projectId: string) => {
    setSelectedProject(projectId);
    setSelectedBranch('');
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  };
  const handleBranchClick = (branchId: string) => setSelectedBranch(branchId);
  const handleTaskClick = (t: AgentTask) => {
    ctx.selectProject(t.project_id);
    ctx.selectRequirement(t.requirement_id);
    ctx.setView('taskView');
  };

  const totalTasksFn = (wl: AgentWorkload) => wl.backlog + wl.todo + wl.in_progress + wl.done;
  const currentAgentProjects = workloadMap[selectedAgent]?.projects || [];
  const visibleProjects = projects.filter(p => currentAgentProjects.includes(p.id));

  if (loading) return <div className="workloadLayout"><div className="workloadLoading"><p className="muted">Loading workload...</p></div></div>;

  return (
    <div className="workloadLayout">
      <div className="workloadHeader">
        <button onClick={() => ctx.setView('boardView')}
          className="p-1.5 rounded-lg hover:bg-white/10 text-[#8b95a5] hover:text-white transition-colors"
          title="Back to Board">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h2 className="workloadHeaderTitle">Workload</h2>
          <p className="workloadHeaderSub">Workload visualizes capacity and balances tasks.</p>
        </div>
      </div>
      <div className="workloadPanels">
        <aside className="workloadAgents">
          {onlineAgents.length === 0 ? <p className="muted" style={{ padding: '12px' }}>No agents online.</p> : onlineAgents.map(member => {
            const wl = workloadMap[member.username];
            const total = wl ? totalTasksFn(wl) : 0;
            const doneCount = wl ? wl.done : 0;
            const donePct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
            return (
              <button key={member.username}
                className={`workloadAgentCard${member.username === selectedAgent ? ' active' : ''}`}
                onClick={() => handleAgentClick(member.username)}>
                <div className="workloadAgentRow">
                  <div className="workloadAgentAvatar" style={{ background: avatarColor(member.username) }}>{avatarText(member.username)}</div>
                  <div className="workloadAgentInfo">
                    <span className="workloadAgentName">{member.username}</span>
                    <span className="workloadAgentStats">{wl ? `${doneCount}/${total} done` : 'No tasks'}</span>
                  </div>
                </div>
                <div className="workloadProgressTrack"><div className="workloadProgressFill" style={{ width: `${donePct}%` }} /></div>
              </button>
            );
          })}
        </aside>
        <aside className="workloadBranchTree">
          <h3 className="workloadSideTitle">Projects</h3>
          {visibleProjects.length === 0 ? <p className="muted" style={{ padding: '12px' }}>No projects assigned.</p> : visibleProjects.map(proj => {
            const isExpanded = expandedProjects.has(proj.id);
            const isSelected = selectedProject === proj.id;
            const branches = proj.branches?.length ? proj.branches : [{ id: 'main', name: 'Main', created_at: '' }];
            return (
              <div key={proj.id} className="workloadTreeItem">
                <button className={`workloadProjectToggle${isSelected ? ' selected' : ''}`} onClick={() => handleProjectClick(proj.id)}>
                  <span className={`workloadProjectDot${isSelected ? ' active' : ''}`} />
                  <span className="workloadProjectName">{proj.name}</span>
                </button>
                {isExpanded && (
                  <div className="workloadSubTree">
                    {branches.map(b => {
                      const isBranchSel = selectedBranch === b.id;
                      return (
                        <button key={b.id} className={`workloadBranchItem${isBranchSel ? ' selected' : ''}`} onClick={() => handleBranchClick(b.id)}>
                          <span className="workloadBranchName">{b.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </aside>
        <section className="workloadGrid">
          {tasksLoading ? <div className="workloadGridLoading"><p className="muted">Loading tasks...</p></div>
          : !selectedAgent ? <div className="workloadGridEmpty"><p className="muted">Select an agent.</p></div>
          : !selectedProject ? <div className="workloadGridEmpty"><p className="muted">Select a project and branch.</p></div>
          : !selectedBranch ? <div className="workloadGridEmpty"><p className="muted">Select a branch to view tasks.</p></div>
          : tasks.length === 0 ? <div className="workloadGridEmpty"><p className="muted">No tasks found.</p></div>
          : (
            <div className="workloadGridFlat">
              {tasks.map(t => {
                const s = t.status === 'draft' || t.status === '' ? 'backlog' : t.status === 'sent' ? 'todo' : t.status === 'in_progress' ? 'in_progress' : t.status === 'closed' ? 'done' : 'backlog';
                return (
                  <div key={t.requirement_id} className="workloadCard" onClick={() => handleTaskClick(t)} style={{ cursor: 'pointer' }}>
                    <div className="workloadCardHead">
                      <span className="workloadStatusDot" style={{ background: statusColors[s] }} />
                      <span className="workloadCardStatus">{statusLabels[s]}</span>
                      <span className="workloadPriorityBadge" data-priority={t.priority}>{t.priority === 'no_priority' ? '—' : t.priority.toUpperCase()}</span>
                    </div>
                    <span className="workloadCardTitle">{t.title}</span>
                    <div className="workloadCardMeta">
                      <span className="workloadCardBranch">{t.branch_name}</span>
                      <span className="workloadCardProject">{t.project_name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
