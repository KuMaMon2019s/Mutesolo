import { useState, useEffect, useCallback } from 'react';
import NavRail from './components/NavRail';
import ModuleSidebar from './components/ModuleSidebar';
import Projects from './pages/Projects';
import Board from './pages/Board';
import TaskDetail from './pages/TaskDetail';
import Skills from './pages/Skills';
import Runtimes from './pages/Runtimes';
import Connections from './pages/Connections';
import type { AppState, Project, ProjectBranch, Requirement } from './api/state';
import { fetchState } from './api/state';
import { fetchConfig, type Config } from './api/config';

export type ViewId = 'projectsView' | 'boardView' | 'taskView' | 'skillsView' | 'runtimesView' | 'connectionsView';

export interface AppContextType {
  state: AppState | null;
  config: Config | null;
  selectedProject: string;
  selectedBranch: string;
  selectedRequirement: string;
  currentView: ViewId;
  boardTab: 'kanban' | 'branch';
  selectedRequirements: Set<string>;
  todoRatio: string;
  selectProject: (id: string) => void;
  selectBranch: (id: string) => void;
  selectRequirement: (id: string) => void;
  setView: (view: ViewId) => void;
  setBoardTab: (tab: 'kanban' | 'branch') => void;
  toggleRequirementSelection: (id: string, selected: boolean) => void;
  clearSelection: () => void;
  reload: () => Promise<void>;
  currentProject: () => Project | null;
  currentBranch: () => ProjectBranch | null;
  currentRequirement: () => Requirement | null;
}

function parseHash(): Record<string, string> {
  const hash = window.location.hash.slice(1);
  if (!hash) return {};
  const params = new URLSearchParams(hash);
  const result: Record<string, string> = {};
  params.forEach((value, key) => { result[key] = value; });
  return result;
}

function syncHash(params: Record<string, string>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const hash = sp.toString();
  const newHash = hash ? `#${hash}` : '';
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash || window.location.pathname);
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [currentView, setCurrentView] = useState<ViewId>('projectsView');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedRequirement, setSelectedRequirement] = useState('');
  const [boardTab, setBoardTab] = useState<'kanban' | 'branch'>('kanban');
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [st, cfg] = await Promise.all([fetchState(), fetchConfig()]);
    setAppState(st);
    setConfig(cfg);
  }, []);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const projects = appState?.projects ?? [];

  const currentProjectFn = useCallback((): Project | null => {
    return projects.find(p => p.id === selectedProject) ?? null;
  }, [projects, selectedProject]);

  const normalizedBranches = useCallback((project: Project): ProjectBranch[] => {
    return project.branches?.length ? project.branches : [{ id: 'main', name: 'Main', created_at: '' }];
  }, []);

  const firstBranch = useCallback((project: Project): ProjectBranch => {
    return normalizedBranches(project)[0];
  }, [normalizedBranches]);

  const currentBranchFn = useCallback((): ProjectBranch | null => {
    const project = currentProjectFn();
    if (!project) return null;
    const branches = normalizedBranches(project);
    return branches.find(b => b.id === selectedBranch) ?? branches[0] ?? null;
  }, [currentProjectFn, normalizedBranches, selectedBranch]);

  const currentRequirementFn = useCallback((): Requirement | null => {
    const project = currentProjectFn();
    if (!project) return null;
    const branchId = selectedBranch || firstBranch(project).id;
    const reqs = (project.requirements ?? []).filter(r => (r.branch_id || firstBranch(project).id) === branchId);
    return reqs.find(r => r.id === selectedRequirement) ?? reqs.at(-1) ?? null;
  }, [currentProjectFn, selectedBranch, selectedRequirement, firstBranch]);

  const selectProject = useCallback((id: string) => {
    const project = projects.find(p => p.id === id);
    setSelectedProject(id);
    if (project) {
      setSelectedBranch(firstBranch(project).id);
    }
    setSelectedRequirement('');
    setSelectedRequirements(new Set());
    setBoardTab('kanban');
  }, [projects, firstBranch]);

  const selectBranch = useCallback((id: string) => {
    setSelectedBranch(id);
    setSelectedRequirement('');
    setSelectedRequirements(new Set());
    setBoardTab('kanban');
  }, []);

  const selectRequirement = useCallback((id: string) => {
    setSelectedRequirement(id);
    setSelectedRequirements(new Set());
  }, []);

  const setView = useCallback((view: ViewId) => {
    setCurrentView(view);
  }, []);

  const toggleRequirementSelection = useCallback((id: string, selected: boolean) => {
    setSelectedRequirements(prev => {
      const next = new Set(prev);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRequirements(new Set());
  }, []);

  // Compute TO DO ratio
  const todoRatio = (() => {
    const all = projects.flatMap(p => p.requirements ?? []);
    const denominator = all.filter(r => ['draft', 'sent', 'in_progress', ''].includes(r.status ?? '')).length;
    const todo = all.filter(r => (r.status ?? '') === 'sent').length;
    return `${denominator ? Math.round((todo / denominator) * 100) : 0}%`;
  })();

  // Sync hash on state changes
  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedProject) params.project = selectedProject;
    if (selectedBranch) params.branch = selectedBranch;
    if (selectedRequirement) params.req = selectedRequirement;
    if (boardTab !== 'kanban') params.tab = boardTab;
    if (currentView !== 'boardView') params.view = currentView;
    syncHash(params);
  }, [selectedProject, selectedBranch, selectedRequirement, boardTab, currentView]);

  // Restore from hash on mount
  useEffect(() => {
    if (!appState) return;
    const hash = parseHash();
    const projectId = hash.project;
    if (projectId && projects.some(p => p.id === projectId)) {
      setSelectedProject(projectId);
      const project = projects.find(p => p.id === projectId)!;
      const branchId = hash.branch;
      if (branchId && project.branches?.some(b => b.id === branchId)) {
        setSelectedBranch(branchId);
      } else {
        setSelectedBranch(firstBranch(project).id);
      }
      if (hash.req) setSelectedRequirement(hash.req);
      if (hash.tab === 'branch') setBoardTab('branch');
    }
    const viewId = hash.view as ViewId | undefined;
    if (viewId && ['projectsView', 'boardView', 'taskView', 'skillsView', 'runtimesView', 'connectionsView'].includes(viewId)) {
      setCurrentView(viewId);
    }
    // Only run on initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  const ctx: AppContextType = {
    state: appState,
    config,
    selectedProject,
    selectedBranch,
    selectedRequirement,
    currentView,
    boardTab,
    selectedRequirements,
    todoRatio,
    selectProject,
    selectBranch,
    selectRequirement,
    setView,
    setBoardTab,
    toggleRequirementSelection,
    clearSelection,
    reload: load,
    currentProject: currentProjectFn,
    currentBranch: currentBranchFn,
    currentRequirement: currentRequirementFn,
  };

  const renderView = () => {
    switch (currentView) {
      case 'projectsView': return <Projects ctx={ctx} />;
      case 'boardView': return <Board ctx={ctx} />;
      case 'taskView': return <TaskDetail ctx={ctx} />;
      case 'skillsView': return <Skills ctx={ctx} />;
      case 'runtimesView': return <Runtimes ctx={ctx} />;
      case 'connectionsView': return <Connections ctx={ctx} />;
    }
  };

  return (
    <main className="appShell">
      <NavRail
        currentView={currentView}
        onViewChange={setView}
        todoRatio={todoRatio}
      />
      <ModuleSidebar
        ctx={ctx}
        projects={projects}
      />
      <section className="mainArea">
        {renderView()}
      </section>
    </main>
  );
}
