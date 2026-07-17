import type { PageComponent } from '../lib/router';
import { apiFetch, checkAuth } from '../lib/api';
import { store, type AgentWorkload } from '../lib/store';

// ── Types ──────────────────────────────────────────────

interface Task {
  requirement_id: string;
  project_id: string;
  project_name: string;
  branch_id: string;
  branch_name: string;
  status: string;
  title: string;
  priority: string;
}

interface AgentTasksResponse {
  agent: string;
  tasks: Task[];
}

// ── Helpers ────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: 'Backlog',
  sent: 'To Do',
  in_progress: 'In Progress',
  closed: 'Done',
};

const STATUS_DOT: Record<string, string> = {
  draft: '#ff8b66',
  sent: '#8b95a5',
  in_progress: '#5b8def',
  closed: '#4dc89a',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#dc3545',
  P1: '#ff8b66',
  P2: '#5b8def',
  P3: '#555f70',
};

const PRIORITY_LABELS: Record<string, string> = {
  P0: 'High',
  P1: 'Medium',
  P2: 'Low',
  P3: 'None',
};

const AVATAR_COLORS = [
  '#5b8def', '#e05b8d', '#5be0a3', '#e0c85b', '#8d5be0', '#e08d5b',
  '#5bc0de', '#de8d5b', '#a35be0', '#e05ba3', '#5be0c8', '#c8e05b',
];

function avatarColor(name: unknown): string {
  const s = typeof name === 'string' && name.length > 0 ? name : String(name ?? '?');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function firstLetter(name: unknown): string {
  const s = typeof name === 'string' && name.length > 0 ? name : String(name ?? '');
  return (s.slice(0, 1) || '?').toUpperCase();
}

function initial(name: unknown): string {
  const s = typeof name === 'string' && name.length > 0 ? name : String(name ?? '');
  return (s.slice(0, 2) || '??').toUpperCase();
}

// ── Dot Matrix Progress Bar ────────────────────────────

function dotMatrixBar(done: number, total: number): string {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filledCount = Math.round((pct / 100) * 20);
  let dots = '';
  for (let i = 0; i < 20; i++) {
    const color = i < filledCount ? '#4dc89a' : '#3a3f4b';
    dots += `<span style="display:inline-block;width:8px;height:8px;background:${color};border-radius:1px;"></span>`;
  }
  return `<div class="flex items-center gap-2">
    <div class="flex gap-[2px]">${dots}</div>
    <span class="text-xs text-muted whitespace-nowrap font-medium">${pct}%</span>
  </div>`;
}

// ── Component ──────────────────────────────────────────

export class WorkloadPage implements PageComponent {
  private container: HTMLElement | null = null;
  private tasks: Task[] = [];
  private searchQuery = '';
  private loadingTasks = false;
  private profileOpen = false;
  private unsub: (() => void) | null = null;
  private lastLoadedAgent: string | null = null;

  // ── render ─────────────────────────────────────────

  async render(container: HTMLElement): Promise<void> {
    this.container = container;

    // Auth guard
    if (!(await checkAuth())) return;

    // Subscribe to store changes
    this.unsub = store.subscribe(() => this.onStoreChange());

    // Load data from store (shared, cached)
    await store.loadUser();
    await store.loadWorkloads();

    this.renderShell();
    this.renderSidebar();
    this.bindShellEvents();

    // Auto-select first agent if none selected
    if (!store.selectedAgent && store.agents.length > 0) {
      store.setSelectedAgent(store.agents[0]);
    }

    // Load tasks for the selected agent
    if (store.selectedAgent) {
      await this.selectAgent(store.selectedAgent);
    }
  }

  private onStoreChange(): void {
    if (!this.container) return;
    this.renderSidebar();
    // Reload tasks if selected agent changed
    if (store.selectedAgent && store.selectedAgent !== this.lastLoadedAgent) {
      this.selectAgent(store.selectedAgent);
    }
  }

  private renderShell(): void {
    const el = this.container!;

    el.innerHTML = `
      <!-- Main: side-by-side layout -->
      <div class="flex flex-1 overflow-hidden min-h-0">
        <!-- Left: Agent sidebar -->
        <aside id="agent-sidebar" class="w-[72px] shrink-0 border-r border-line-soft flex flex-col items-center pt-5 pb-3 gap-3 overflow-y-auto">
          <div id="agent-loading" class="text-faint text-xs mt-2">Loading...</div>
        </aside>

        <!-- Right: main content area (or profile panel) -->
        <div id="right-panel" class="flex-1 flex flex-col overflow-hidden min-w-0">
          <!-- Header -->
          <header class="flex items-center justify-between px-3 py-2 border-b border-line-soft shrink-0">
            <h1 class="text-sm font-bold text-text-primary">Mutesolo</h1>
          </header>

          <!-- Search bar -->
          <div class="flex gap-2 px-3 py-2 border-b border-line-soft shrink-0">
            <input
              id="task-search"
              type="text"
              placeholder="Search tasks..."
              class="flex-1 px-3 py-2 bg-card border border-line-soft rounded text-xs text-text-primary placeholder-faint focus:outline-none focus:border-blue transition-colors"
            />
            <button id="search-btn" class="px-3 py-2 rounded text-xs font-medium text-white hover:opacity-90 transition-opacity" style="background:#2c6bed">
              Search
            </button>
          </div>

          <!-- Progress bar area (between search and task cards) -->
          <div id="progress-area" class="px-3 py-1.5 border-b border-line-soft shrink-0 flex items-center justify-between">
            <span class="text-[11px] text-muted">Select an agent</span>
          </div>

          <!-- Task card list -->
          <div class="flex-1 overflow-y-auto p-3">
            <div id="task-area" class="text-center text-muted text-xs mt-8">
              Select an agent to view tasks
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindShellEvents();
  }

  private renderSidebar(): void {
    const sidebar = this.container?.querySelector('#agent-sidebar');
    if (!sidebar) return;

    const agents = store.agents;
    const selectedAgent = store.selectedAgent;

    console.log('[WorkloadPage] renderSidebar — agents:', agents.length, 'selected:', selectedAgent);

    sidebar.innerHTML = '';

    // ── Logo at top ──
    const logoDiv = document.createElement('div');
    logoDiv.className = 'flex flex-col items-center shrink-0 mb-1';
    logoDiv.innerHTML = `
      <img src="/icon128.png" alt="Mutesolo" class="w-[52px] h-[52px] rounded-full object-cover shrink-0" />
    `;
    sidebar.appendChild(logoDiv);

    // ── Divider under logo ──
    const topDivider = document.createElement('div');
    topDivider.className = 'w-10 border-t border-line-soft shrink-0';
    sidebar.appendChild(topDivider);

    if (store.loading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.id = 'agent-loading';
      loadingDiv.className = 'text-faint text-xs mt-2';
      loadingDiv.textContent = 'Loading...';
      sidebar.appendChild(loadingDiv);
    } else if (store.error) {
      const errDiv = document.createElement('div');
      errDiv.className = 'text-red-400 text-[10px] text-center px-1 mt-2';
      errDiv.textContent = store.error;
      sidebar.appendChild(errDiv);
    } else if (agents.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'text-faint text-xs mt-2 text-center px-1';
      emptyDiv.textContent = 'No agents';
      sidebar.appendChild(emptyDiv);
    } else {
      for (const agent of agents) {
        const wl = store.getWorkload(agent);
        const done = wl?.done ?? 0;
        const total = wl ? (wl.backlog + wl.todo + wl.in_progress + wl.done) : 0;
        const color = avatarColor(agent);
        const isSelected = selectedAgent === agent;

        const div = document.createElement('div');
        div.className = 'flex flex-col items-center gap-1 cursor-pointer shrink-0 group relative';
        div.title = agent;

        div.innerHTML = `
          <div class="relative w-[52px] h-[52px] flex-shrink-0">
            <div class="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-bold transition-transform group-hover:scale-110"
                 style="background: ${color}; font-size: 20px; ${isSelected ? 'box-shadow: 0 0 0 3px #5b8def;' : ''}">
              ${initial(agent)}
            </div>
          </div>
          <span class="text-[13px] text-muted leading-none max-w-[62px] truncate text-center">${this.escapeHtml(agent)}</span>
          <span class="text-[12px] text-faint leading-none">${done}/${total}</span>
        `;

        div.addEventListener('click', () => this.selectAgent(agent));
        sidebar.appendChild(div);
      }
    }

    // ── Divider + Profile area at bottom ──
    const divider = document.createElement('div');
    divider.className = 'w-10 border-t border-line-soft mt-auto';
    sidebar.appendChild(divider);

    const profileArea = document.createElement('div');
    profileArea.id = 'profile-area';
    profileArea.className = 'flex flex-col items-center gap-0.5 shrink-0 relative';

    const username = store.user ?? 'U';
    const letter = firstLetter(username);

    profileArea.innerHTML = `
      <button id="profile-btn" class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-transform hover:scale-110 cursor-pointer border-0"
              style="background: linear-gradient(135deg, #4f8ef7, #7c3aed);" title="${this.escapeHtml(username)}">
        ${letter}
      </button>
    `;

    sidebar.appendChild(profileArea);

    // Bind profile click → open right panel profile view
    const profileBtn = profileArea.querySelector('#profile-btn');
    profileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openProfilePanel();
    });
  }

  // ── Profile Panel (right side) ─────────────────────

  private openProfilePanel(): void {
    const rightPanel = this.container?.querySelector('#right-panel') as HTMLElement;
    if (!rightPanel) return;

    this.profileOpen = true;
    const username = store.user ?? 'U';
    const letter = firstLetter(username);

    rightPanel.innerHTML = `
      <!-- Profile Header -->
      <header class="flex items-center gap-2 px-3 py-2 border-b border-line-soft shrink-0">
        <button id="profile-back-btn" class="text-muted hover:text-text-primary transition-colors text-lg leading-none cursor-pointer border-0 bg-transparent">&larr;</button>
        <h1 class="text-sm font-bold text-text-primary">Profile</h1>
      </header>

      <!-- Profile Content -->
      <div class="flex-1 overflow-y-auto flex flex-col items-center pt-8 px-4">
        <!-- Avatar -->
        <div class="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold mb-4"
             style="background: linear-gradient(135deg, #4f8ef7, #7c3aed); font-size: 32px;">
          ${letter}
        </div>

        <!-- Username -->
        <h2 class="text-lg font-semibold text-text-primary mb-1">${this.escapeHtml(username)}</h2>
        <p class="text-xs text-muted mb-6">Mutesolo Extension User</p>

        <!-- Stats -->
        <div class="w-full max-w-xs bg-card border border-line-soft rounded-lg p-4 mb-4">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Account Info</h3>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Account</span>
              <span class="text-xs text-text-primary">${this.escapeHtml(username)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">API Endpoint</span>
              <span class="text-xs text-text-primary">localhost:8787</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Version</span>
              <span class="text-xs text-text-primary">v0.1.0</span>
            </div>
          </div>
        </div>

        <!-- Logout -->
        <button id="profile-logout-btn" class="w-full max-w-xs px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors cursor-pointer">
          Logout
        </button>
      </div>
    `;

    // Bind back button
    rightPanel.querySelector('#profile-back-btn')?.addEventListener('click', () => {
      this.closeProfilePanel();
    });

    // Bind logout
    rightPanel.querySelector('#profile-logout-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        store.handleLogout();
      }
    });
  }

  private closeProfilePanel(): void {
    this.profileOpen = false;
    // Re-render the shell to restore the task view
    this.renderShell();
    this.renderSidebar();
    // Re-select the previously selected agent's tasks if any
    if (store.selectedAgent) {
      this.selectAgent(store.selectedAgent);
    }
  }

  private bindShellEvents(): void {
    const el = this.container!;

    // Search
    const searchInput = el.querySelector('#task-search') as HTMLInputElement;
    const searchBtn = el.querySelector('#search-btn') as HTMLButtonElement;

    const doSearch = () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderTaskCards();
    };

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderTaskCards();
    });
  }

  // ── Agent selection ────────────────────────────────

  private async selectAgent(username: string): Promise<void> {
    if (this.loadingTasks) return;

    store.setSelectedAgent(username);

    // Update progress bar
    this.updateProgressBar(username);

    const taskArea = this.container!.querySelector('#task-area')!;
    taskArea.innerHTML =
      '<div class="flex items-center justify-center mt-8"><div class="animate-spin w-5 h-5 border-2 border-blue border-t-transparent rounded-full"></div></div>';

    this.loadingTasks = true;
    try {
      const res = await apiFetch(`/api/agent-tasks?member=${encodeURIComponent(username)}`);
      if (res.status === 401) { window.location.hash = '#login'; return; }
      if (!res.ok) throw new Error(`Tasks API error ${res.status}`);

      const data: AgentTasksResponse = await res.json();
      this.tasks = data.tasks ?? [];
      this.searchQuery = '';
      const searchInput = this.container!.querySelector('#task-search') as HTMLInputElement;
      if (searchInput) searchInput.value = '';

      this.lastLoadedAgent = username;
      this.renderTaskCards();
    } catch (err) {
      const taskArea = this.container!.querySelector('#task-area')!;
      if (err instanceof TypeError) {
        taskArea.innerHTML =
          '<div class="text-red-400 text-xs text-center mt-8">Cannot connect to server</div>';
      } else {
        taskArea.innerHTML =
          `<div class="text-red-400 text-xs text-center mt-8">${(err as Error).message}</div>`;
      }
    } finally {
      this.loadingTasks = false;
    }
  }

  // ── Progress Bar Update ────────────────────────────

  private updateProgressBar(agent: string): void {
    const progressArea = this.container?.querySelector('#progress-area') as HTMLElement;
    if (!progressArea) return;

    const wl = store.getWorkload(agent);
    const done = wl?.done ?? 0;
    const total = wl ? (wl.backlog + wl.todo + wl.in_progress + wl.done) : 0;

    progressArea.innerHTML = `
      <span class="text-[11px] text-muted">${this.escapeHtml(agent)}</span>
      ${dotMatrixBar(done, total)}
    `;
  }

  // ── Task cards ─────────────────────────────────────

  private renderTaskCards(): void {
    const taskArea = this.container!.querySelector('#task-area')!;
    const selectedAgent = store.selectedAgent;

    if (!selectedAgent) {
      taskArea.innerHTML =
        '<div class="text-center text-muted text-xs mt-8">Select an agent to view tasks</div>';
      return;
    }

    if (this.tasks.length === 0) {
      taskArea.innerHTML =
        '<div class="text-center text-muted text-xs mt-8">No tasks found</div>';
      return;
    }

    // Filter by search
    let filtered = this.tasks;
    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.branch_name ?? '').toLowerCase().includes(q) ||
          (t.project_name ?? '').toLowerCase().includes(q),
      );
    }

    if (filtered.length === 0) {
      taskArea.innerHTML =
        `<div class="text-center text-muted text-xs mt-8">No tasks match "${this.escapeHtml(this.searchQuery)}"</div>`;
      return;
    }

    taskArea.innerHTML =
      `<div class="flex flex-col gap-3">${filtered.map((t) => this.taskCard(t)).join('')}</div>`;

    // Bind clicks
    taskArea.querySelectorAll<HTMLElement>('[data-task-card]').forEach((el) => {
      el.addEventListener('click', () => {
        const pid = el.dataset.projectId!;
        const rid = el.dataset.requirementId!;
        window.location.hash = `#detail?project_id=${encodeURIComponent(pid)}&requirement_id=${encodeURIComponent(rid)}`;
      });
    });
  }

  private taskCard(t: Task): string {
    const dot = STATUS_DOT[t.status] ?? '#555f70';
    const statusLabel = STATUS_LABEL[t.status] ?? t.status;

    // Priority badge
    const prio = t.priority || 'no_priority';
    let prioColor = '#555f70';
    let prioText = 'None';
    if (prio === 'P0' || prio === 'high') {
      prioColor = '#dc3545';
      prioText = 'High';
    } else if (prio === 'P1' || prio === 'medium') {
      prioColor = '#ff8b66';
      prioText = 'Medium';
    } else if (prio === 'P2' || prio === 'low') {
      prioColor = '#5b8def';
      prioText = 'Low';
    } else {
      prioColor = '#555f70';
      prioText = 'None';
    }

    return `
      <div
        class="break-inside-avoid bg-card border border-line-soft rounded-lg p-3 mb-3 cursor-pointer hover:border-blue transition-colors"
        data-task-card
        data-project-id="${this.escapeAttr(t.project_id)}"
        data-requirement-id="${this.escapeAttr(t.requirement_id)}"
      >
        <div class="flex items-center gap-2 mb-1.5">
          <span class="w-2 h-2 rounded-full shrink-0" style="background:${dot}"></span>
          <span class="text-xs text-muted">${this.escapeHtml(statusLabel)}</span>
          <span class="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium"
                style="background: ${prioColor}20; color: ${prioColor}; border: 1px solid ${prioColor}40;">
            ${this.escapeHtml(prioText)}
          </span>
        </div>
        <div class="text-sm font-semibold text-text-primary text-left mb-2">
          ${this.escapeHtml(t.title)}
        </div>
      </div>`;
  }

  // ── Utilities ──────────────────────────────────────

  escapeHtml(s: unknown): string {
    const str = typeof s === 'string' ? s : String(s ?? '');
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  escapeAttr(s: string): string {
    return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── destroy ────────────────────────────────────────

  destroy(): void {
    this.container = null;
    this.unsub?.();
    this.unsub = null;
  }
}
