import { useState, useRef, useEffect, useCallback } from 'react';
import type { AppContextType } from '../App';
import { createBranch, createRequirement, updateBoard } from '../api/projects';

interface Props { ctx: AppContextType }

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const columns = [
    { id: 'draft', title: 'BACKLOG', color: 'low' },
    { id: 'sent', title: 'TO DO', color: 'medium' },
    { id: 'in_progress', title: 'IN PROGRESS', color: 'agent' },
    { id: 'closed', title: 'DONE', color: 'done' },
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

  const handleCreateBranch = useCallback(async () => {
    if (!project || !branchName.trim()) return;
    try {
      const branch = await createBranch(project.id, branchName.trim());
      ctx.selectBranch(branch.id);
      setBranchModalOpen(false);
      setBranchName('');
      await ctx.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
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
      });
      ctx.selectRequirement(req.id);
      setReqModalOpen(false);
      setReqTitle('');
      setReqDescription('');
      setReqPriority('low');
      await ctx.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    }
  }, [project, reqTitle, reqDescription, reqPriority, reqStatus, ctx, branches]);

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
      alert(e instanceof Error ? e.message : 'Failed');
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
      alert(e instanceof Error ? e.message : 'Failed');
    }
  }, [project, ctx]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const priorityLabel = (p: string) => ({
    no_priority: 'No priority', urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
  }[p] || 'Low');

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
          <button className="secondary" onClick={() => {
            if (!project) { alert('Select a project first'); return; }
            setBranchModalOpen(true);
          }}>Branch</button>
          <button onClick={() => {
            if (!project) { alert('Select a project first'); return; }
            setReqStatus('draft');
            setReqModalOpen(true);
          }}>New Requirement</button>
        </div>
      </div>

      {/* Selection toolbar */}
      {ctx.selectedRequirements.size > 0 && (
        <div className="selectionToolbar">
          <strong>{ctx.selectedRequirements.size} selected</strong>
          <div className="moveBranchControls">
            <select className="moveBranchSelect" disabled>
              <option value="">Select branch...</option>
            </select>
            <button className="secondary" disabled>Move</button>
          </div>
          <button className="secondary" onClick={handleCloseSelected}>Close</button>
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
                        {col.title} <span>{colReqs.length}</span>
                      </div>
                      <button
                        className="addLane"
                        onClick={() => {
                          if (!project) return;
                          setReqStatus(col.id);
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
                                <div className="badges">
                                  <span className={`badge ${req.priority || 'low'}`}>
                                    {priorityLabel(req.priority)}
                                  </span>
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
              <button className="secondary" onClick={() => setBranchModalOpen(false)}>Close</button>
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
            <button onClick={handleCreateBranch}>Create Branch</button>
          </section>
        </div>
      )}

      {/* Requirement creation modal */}
      {reqModalOpen && (
        <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) setReqModalOpen(false); }}>
          <section className="modal">
            <div className="modalHead">
              <h2>New Requirement</h2>
              <button className="secondary" onClick={() => setReqModalOpen(false)}>Close</button>
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
              <textarea
                placeholder="Requirement detail"
                value={reqDescription}
                onChange={e => setReqDescription(e.target.value)}
              />
            </div>
            <button onClick={handleCreateRequirement}>Add</button>
          </section>
        </div>
      )}
    </section>
  );
}
