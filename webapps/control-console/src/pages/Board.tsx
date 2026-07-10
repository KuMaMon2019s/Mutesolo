import { useState, useRef, useEffect, useCallback } from 'react';
import type { AppContextType } from '../App';
import { createBranch, createRequirement, updateBoard, fetchAIAgentScreenshotMembers, fetchStats } from '../api/projects';
import { buttonVariants } from '../variants';
import mergeTW from '../utils/mergeTW';
import { toast } from '../components/toastStore';

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

interface Props { ctx: AppContextType }

type MemberStatsData = { username: string; task_count: number; status_breakdown: Record<string, number> };

export default function Board({ ctx }: Props) {
  const project = ctx.currentProject();
  const branches = project?.branches?.length
    ? project.branches
    : [{ id: 'main', name: 'Main', created_at: '' }];

  const requirements = project
    ? (project.requirements ?? []).filter(r =>
        (r.branch_id || branches[0].id) === ctx.selectedBranch
      )
    : [];

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [reqTitle, setReqTitle] = useState('');
  const [reqPriority, setReqPriority] = useState('low');
  const [reqDescription, setReqDescription] = useState('');
  const [reqStatus, setReqStatus] = useState('draft');
  const [reqAssignedMember, setReqAssignedMember] = useState('');
  const [agentMembers, setAgentMembers] = useState<Array<{ username: string; status: string }>>([]);
  const [memberStats, setMemberStats] = useState<MemberStatsData[]>([]);
  const [moveTargetBranch, setMoveTargetBranch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const columns = [
    { id: 'draft', title: 'BACKLOG', dotColor: '#ff8b66' },
    { id: 'sent', title: 'TO DO', dotColor: '#8b95a5' },
    { id: 'in_progress', title: 'IN PROGRESS', dotColor: '#5b8def' },
    { id: 'closed', title: 'DONE', dotColor: '#4dc89a' },
  ];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Fetch AI Agent members for avatar stack + stats
  useEffect(() => {
    fetchAIAgentScreenshotMembers().then(data => {
      setAgentMembers((data.members || []).filter(m => m.username.toLowerCase() !== 'doraemon'));
    }).catch(() => {});
    fetchStats(ctx.selectedProject, ctx.selectedBranch).then(data => {
      setMemberStats(data.members || []);
    }).catch(() => {});
  }, [ctx.selectedProject, ctx.selectedBranch]);

  // Reset move target branch when selection changes or branch changes
  useEffect(() => {
    setMoveTargetBranch('');
  }, [ctx.selectedRequirements.size, ctx.selectedBranch]);

  const handleCreateBranch = useCallback(async () => {
    if (!project || !branchName.trim()) return;
    try {
      const branch = await createBranch(project.id, branchName.trim());
      ctx.selectBranch(branch.id);
      setBranchModalOpen(false);
      setBranchName('');
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }, [project, branchName, ctx]);

  const handleCreateRequirement = useCallback(async () => {
    if (!project || !reqTitle.trim()) return;
    try {
      const req = await createRequirement(project.id, {
        title: reqTitle.trim(),
        description: reqDescription.trim(),
        priority: reqPriority,
        status: reqStatus,
        branch_id: ctx.selectedBranch || branches[0].id,
        assigned_member: reqAssignedMember,
      });
      ctx.selectRequirement(req.id);
      setReqModalOpen(false);
      setReqTitle('');
      setReqDescription('');
      setReqPriority('low');
      setReqAssignedMember('');
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }, [project, reqTitle, reqDescription, reqPriority, reqStatus, reqAssignedMember, ctx, branches]);

  const handleMoveSelected = useCallback(async () => {
    if (!project || ctx.selectedRequirements.size === 0 || !moveTargetBranch) return;
    try {
      await updateBoard(project.id, {
        requirement_ids: [...ctx.selectedRequirements],
        branch_id: moveTargetBranch,
      });
      ctx.clearSelection();
      setMoveTargetBranch('');
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }, [project, ctx, moveTargetBranch]);

  const handleCloseSelected = useCallback(async () => {
    if (!project || ctx.selectedRequirements.size === 0) return;
    try {
      await updateBoard(project.id, {
        requirement_ids: [...ctx.selectedRequirements],
        status: 'closed',
      });
      ctx.clearSelection();
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }, [project, ctx]);

  const handleDragStart = (e: React.DragEvent, reqId: string) => {
    e.dataTransfer.setData('text/plain', reqId);
  };

  const handleDrop = useCallback(async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const reqId = e.dataTransfer.getData('text/plain');
    if (!reqId || !project) return;
    try {
      await updateBoard(project.id, {
        requirement_ids: [reqId],
        status,
      });
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }, [project, ctx]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const priorityLabel = (p: string) => ({
    no_priority: 'No priority', urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
  }[p] || 'Low');

  // Find stat for a given member
  const getMemberStat = (username: string) => memberStats.find(s => s.username === username);

  const canMove = moveTargetBranch !== '' && moveTargetBranch !== ctx.selectedBranch;

  return (
    <section id="boardView" className="view activeView">
      <div className="viewHead">
        <div>
          <p className="breadcrumb">Your projects / AI Agent / Requirements</p>
          <h2>Project Board</h2>
          <p className="muted">Select requirement cards, move them across lanes, or archive them in bulk.</p>
        </div>
        <div className="buttonRow">
          {/* Branch dropdown */}
          <div className="dropdown" ref={dropdownRef}>
            <button
              className="dropdownTrigger"
              disabled={!project}
              onClick={() => setDropdownOpen(prev => !prev)}
            >
              <span>{branches.find(b => b.id === ctx.selectedBranch)?.name || 'No project'}</span>
              <span className="dropdownChevron"></span>
            </button>
            {dropdownOpen && (
              <div className="dropdownMenu">
                {branches.map(branch => (
                  <button
                    key={branch.id}
                    className={`dropdownItem ${branch.id === ctx.selectedBranch ? 'active' : ''}`}
                    onClick={() => {
                      ctx.selectBranch(branch.id);
                      setDropdownOpen(false);
                    }}
                  >
                    <span>{branch.name}</span>
                    <span className="dropdownCheck">{branch.id === ctx.selectedBranch ? '✓' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={mergeTW(buttonVariants.secondary)} disabled={!project} onClick={() => {
            if (!project) return;
            setBranchModalOpen(true);
          }}>Branch</button>
          <button className={mergeTW(buttonVariants.default)} disabled={!project} onClick={() => {
            if (!project) return;
            setReqStatus('draft');
            setReqAssignedMember('');
            setReqModalOpen(true);
          }}>New Requirement</button>
        </div>
      </div>

      {/* AI Agent Members Row — independent full-width row */}
      {agentMembers.length > 0 && (
        <div className="memberRow">
          <div className="memberAvatars">
            {agentMembers.slice(0, 6).map((member, idx) => {
              const stat = getMemberStat(member.username);
              return (
                <div
                  key={member.username}
                  className="memberAvatarItem"
                  style={{ zIndex: agentMembers.length - idx }}
                  title={`${member.username} · ${member.status}${stat ? ` · ${stat.task_count} tasks` : ''}`}
                >
                  <div
                    className="memberAvatarFace"
                    style={{ backgroundColor: avatarColor(member.username) }}
                  >
                    {avatarText(member.username)}
                  </div>
                  {stat && stat.task_count > 0 && (
                    <span className="memberTaskBadge">{stat.task_count}</span>
                  )}
                </div>
              );
            })}
            {agentMembers.length > 6 && (
              <div className="memberAvatarItem" style={{ zIndex: 0 }}>
                <div className="memberAvatarFace" style={{ backgroundColor: '#3a4454' }}>
                  +{agentMembers.length - 6}
                </div>
              </div>
            )}
          </div>
          <div className="memberStats">
            {agentMembers.length} members online
            {memberStats.length > 0 && (
              <> · {memberStats.reduce((sum, s) => sum + s.task_count, 0)} tasks assigned</>
            )}
          </div>
        </div>
      )}

      {/* Selection toolbar */}
      {ctx.selectedRequirements.size > 0 && (
        <div className="selectionToolbar">
          <strong>{ctx.selectedRequirements.size} selected</strong>
          <div className="moveBranchControls">
            <select
              className="moveBranchSelect select-native"
              value={moveTargetBranch}
              onChange={e => setMoveTargetBranch(e.target.value)}
            >
              <option value="">Move to branch...</option>
              {branches.filter(b => b.id !== ctx.selectedBranch).map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <button
              className={mergeTW(buttonVariants.secondary)}
              disabled={!canMove}
              onClick={handleMoveSelected}
            >Move</button>
          </div>
          <button className={mergeTW(buttonVariants.secondary)} onClick={handleCloseSelected}>Close</button>
        </div>
      )}

      <div className="kanbanPanel">
        <div className="tabs">
          <button
            className={`tab ${ctx.boardTab === 'kanban' ? 'active' : ''}`}
            onClick={() => ctx.setBoardTab('kanban')}
          >
            Kanban
          </button>
          <button
            className={`tab ${ctx.boardTab === 'branch' ? 'active' : ''}`}
            onClick={() => ctx.setBoardTab('branch')}
          >
            Branch
          </button>
          <button className="tab ghost">Filter</button>
        </div>

        {ctx.boardTab === 'kanban' ? (
          <div className={`kanbanBoard ${requirements.length === 0 ? 'empty' : ''}`}>
            {requirements.length === 0
              ? (project ? 'No requirements' : 'Select a project to view its board')
              : columns.map(col => {
                  const colReqs = requirements.filter(r =>
                    (r.status || 'draft') === col.id || (col.id === 'draft' && !r.status)
                  );
                  return (
                    <section
                      key={col.id}
                      className="kanbanColumn"
                      data-status={col.id}
                      onDragOver={handleDragOver}
                      onDrop={e => handleDrop(e, col.id)}
                    >
                      <div className="columnHead">
                        <span className="columnDot" style={{ backgroundColor: col.dotColor }}></span>
                        {col.title} <span>{colReqs.length}</span>
                      </div>
                      <button
                        className="addLane"
                        onClick={() => {
                          if (!project) return;
                          setReqStatus(col.id);
                          setReqAssignedMember('');
                          setReqModalOpen(true);
                        }}
                      >+</button>
                      {colReqs.map(req => {
                        const isSelected = ctx.selectedRequirements.has(req.id);
                        return (
                          <div key={req.id} className={`issueWrap ${isSelected ? 'selected' : ''}`}>
                            <div className="issueSelect">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  ctx.toggleRequirementSelection(req.id, e.target.checked);
                                }}
                              />
                            </div>
                            <div
                              className="issueCard"
                              draggable
                              onDragStart={e => handleDragStart(e, req.id)}
                              onClick={e => {
                                if ((e.target as HTMLElement).closest('input,select')) return;
                                ctx.selectRequirement(req.id);
                                ctx.setView('taskView');
                              }}
                            >
                              <div className="issueBody">
                                <div className="issueTitle">{req.title}</div>
                                <div className="issueRow">
                                  <span className={`badge ${req.priority || 'low'}`}>{priorityLabel(req.priority)}</span>
                                </div>
                                <div className="issueRow">
                                  {req.assigned_member ? (
                                    <span className="badge member" style={{
                                      backgroundColor: avatarColor(req.assigned_member),
                                      color: '#fff',
                                    }}>{avatarText(req.assigned_member)}</span>
                                  ) : (
                                    <span className="badge none">Unassigned</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  );
                })
            }
          </div>
        ) : (
          <div className="branchList">
            {branches.map(branch => {
              const branchReqs = (project?.requirements ?? []).filter(
                r => (r.branch_id || branches[0].id) === branch.id
              );
              return (
                <button
                  key={branch.id}
                  className={`branchCard ${branch.id === ctx.selectedBranch ? 'active' : ''}`}
                  onClick={() => ctx.selectBranch(branch.id)}
                >
                  <strong>{branch.name}</strong>
                  <span>{branchReqs.length} requirement point(s)</span>
                  <div className="branchStats">
                    <span>Backlog {branchReqs.filter(r => (r.status || 'draft') === 'draft' || !r.status).length}</span>
                    <span>To do {branchReqs.filter(r => r.status === 'sent').length}</span>
                    <span>Progress {branchReqs.filter(r => r.status === 'in_progress').length}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Branch creation modal */}
      {branchModalOpen && (
        <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) setBranchModalOpen(false); }}>
          <section className="modal compactModal">
            <div className="modalHead">
              <h2>New Branch</h2>
              <button className={mergeTW(buttonVariants.secondary)} onClick={() => setBranchModalOpen(false)}>Close</button>
            </div>
            <div className="formStack">
              <input
                placeholder="Branch name"
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); }}
                autoFocus
              />
            </div>
            <button className={mergeTW(buttonVariants.default)} onClick={handleCreateBranch}>Create Branch</button>
          </section>
        </div>
      )}

      {/* Requirement creation modal */}
      {reqModalOpen && (
        <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) setReqModalOpen(false); }}>
          <section className="modal">
            <div className="modalHead">
              <h2>New Requirement</h2>
              <button className={mergeTW(buttonVariants.secondary)} onClick={() => setReqModalOpen(false)}>Close</button>
            </div>
            <div className="formStack">
              <input
                placeholder="Requirement title"
                value={reqTitle}
                onChange={e => setReqTitle(e.target.value)}
                autoFocus
              />
              <div className="priorityChoices">
                {['low', 'medium', 'high', 'urgent'].map(p => (
                  <label key={p}>
                    <input
                      type="radio"
                      name="reqPriority"
                      value={p}
                      checked={reqPriority === p}
                      onChange={() => setReqPriority(p)}
                    />
                    {priorityLabel(p)}
                  </label>
                ))}
              </div>
              <select className="select-native" value={reqAssignedMember} onChange={e => setReqAssignedMember(e.target.value)}>
                <option value="">Unassigned</option>
                {agentMembers.map(m => (
                  <option key={m.username} value={m.username}>{m.username}</option>
                ))}
              </select>
              <textarea
                placeholder="Requirement detail"
                value={reqDescription}
                onChange={e => setReqDescription(e.target.value)}
              />
            </div>
            <button className={mergeTW(buttonVariants.default)} onClick={handleCreateRequirement}>Add</button>
          </section>
        </div>
      )}
    </section>
  );
}
