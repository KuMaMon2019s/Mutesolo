import type { PageComponent } from '../lib/router';
import { apiFetch, apiPut, checkAuth } from '../lib/api';
import { store } from '../lib/store';

// ── Types ──────────────────────────────────────────────

interface Requirement {
  id: string;
  title: string;
  description: string;
  priority: string;
  assigned_member: string;
  editor_content?: unknown;
  status: string;
}

interface GeneratePromptResponse {
  prompt?: string;
  result?: string;
  content?: string;
}

// ── Constants ──────────────────────────────────────────

const PRIORITY_OPTIONS = ['No priority', 'Low', 'Medium', 'High', 'Urgent'];

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

function initial(name: unknown): string {
  const s = typeof name === 'string' && name.length > 0 ? name : String(name ?? '');
  return (s.slice(0, 2) || '??').toUpperCase();
}

function ringSvg(done: number, total: number): string {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return `<svg class="absolute inset-0 -rotate-90" width="52" height="52" viewBox="0 0 52 52">
    <circle cx="26" cy="26" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
    <circle cx="26" cy="26" r="${r}" fill="none" stroke="#4dc89a" stroke-width="3"
            stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
  </svg>`;
}

// ── Component ──────────────────────────────────────────

export class DetailPage implements PageComponent {
  private container: HTMLElement | null = null;
  private projectId = '';
  private requirementId = '';
  private requirement: Requirement | null = null;
  private promptResult = '';
  private saving = false;
  private generating = false;
  private profileOpen = false;
  private unsub: (() => void) | null = null;

  // ── render ─────────────────────────────────────────

  async render(container: HTMLElement): Promise<void> {
    this.container = container;

    if (!(await checkAuth())) return;

    // Subscribe to store
    this.unsub = store.subscribe(() => this.renderSidebar());

    // Load shared data
    await store.loadUser();
    await store.loadWorkloads();

    const params = this.getParams();
    this.projectId = params.project_id ?? '';
    this.requirementId = params.requirement_id ?? '';

    if (!this.projectId || !this.requirementId) {
      this.renderError('Missing project or requirement ID.');
      return;
    }

    this.renderShell();
    this.loadData();
  }

  private renderError(msg: string): void {
    const el = this.container!;
    el.innerHTML = `
      <header class="flex items-center gap-2 px-3 py-2 border-b border-line-soft shrink-0">
        <a href="#workload" class="text-muted hover:text-text-primary transition-colors text-lg leading-none">&larr;</a>
        <h1 class="text-sm font-bold text-text-primary">Task detail</h1>
      </header>
      <div class="flex-1 flex items-center justify-center">
        <p class="text-muted text-xs">${this.escapeHtml(msg)}</p>
      </div>`;
  }

  private renderShell(): void {
    const el = this.container!;

    el.innerHTML = `
      <!-- Main: side-by-side layout -->
      <div class="flex flex-1 overflow-hidden min-h-0">
        <!-- Left: Agent sidebar + profile -->
        <aside id="detail-agent-sidebar" class="w-[72px] shrink-0 border-r border-line-soft flex flex-col items-center pt-5 pb-3 gap-3 overflow-y-auto">
        </aside>

        <!-- Right: detail content -->
        <div id="right-panel" class="flex-1 flex flex-col overflow-hidden min-w-0">
          <!-- Header -->
          <header class="flex items-center gap-3 px-3 py-2 border-b border-line-soft shrink-0">
            <a href="#workload" class="text-muted hover:text-text-primary transition-colors text-lg leading-none">&larr;</a>
            <div class="flex flex-col min-w-0">
              <h1 class="text-sm font-bold text-text-primary">Task detail</h1>
              <p class="text-[11px] text-faint truncate">Edit requirement and generate AI agent prompt.</p>
            </div>
          </header>

          <!-- Tabs -->
          <nav id="detail-tabs" class="flex border-b border-line-soft shrink-0">
            <button class="detail-tab px-4 py-2 text-xs font-medium text-blue border-b-2 border-blue bg-transparent" data-tab="requirement">
              Requirement
            </button>
            <button class="detail-tab px-4 py-2 text-xs font-medium text-muted border-b-2 border-transparent hover:text-text-primary transition-colors" data-tab="prompt">
              Prompt
            </button>
          </nav>

          <!-- Tab content -->
          <div class="flex-1 overflow-y-auto p-3">
            <!-- Requirement Tab -->
            <div id="tab-requirement" class="detail-tab-content space-y-4">
              <div>
                <label class="block text-xs text-muted mb-1">Title</label>
                <input
                  id="detail-title"
                  type="text"
                  class="w-full px-3 py-2 bg-card border border-line-soft rounded-md text-text-primary text-sm placeholder-faint focus:outline-none focus:border-blue transition-colors"
                  placeholder="Task title"
                />
              </div>

              <div>
                <label class="block text-xs text-muted mb-1">Description</label>
                <div id="detail-description-editor" contenteditable="true" 
                     class="w-full min-h-[200px] p-3 bg-card border border-line-soft rounded-md text-text-primary text-sm focus:outline-none focus:border-blue transition-colors overflow-y-auto"
                     style="min-height: 200px; max-height: 400px;">
                </div>
              </div>

              <div>
                <label class="block text-xs text-muted mb-2">Priority</label>
                <div id="detail-priority" class="flex gap-3 flex-wrap">
                  ${PRIORITY_OPTIONS.map((p, i) => `
                    <label class="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                      <input type="radio" name="priority" value="${this.escapeAttr(p)}" ${i === 0 ? 'checked' : ''} class="accent-blue" />
                      ${this.escapeHtml(p)}
                    </label>
                  `).join('')}
                </div>
              </div>

              <div>
                <label class="block text-xs text-muted mb-1">Assignee</label>
                <select
                  id="detail-assignee"
                  class="w-full px-3 py-2 bg-card border border-line-soft rounded-md text-text-primary text-sm focus:outline-none focus:border-blue transition-colors"
                >
                  <option value="">Loading agents...</option>
                </select>
              </div>

              <div class="flex gap-2">
                <button id="detail-general-btn" class="px-4 py-1.5 bg-blue text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  General
                </button>
                <button id="detail-save-btn" class="px-4 py-1.5 bg-blue text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  Save
                </button>
                <span id="detail-save-toast" class="text-xs text-green-400 self-center hidden">Saved</span>
              </div>

              <!-- Loading bar below General/Save -->
              <div id="detail-general-status" class="text-muted text-xs mt-2 hidden">
                <div class="flex items-center gap-2 mb-1">
                  <span class="inline-flex items-center gap-2">
                    <span class="animate-spin w-3 h-3 border-2 border-blue border-t-transparent rounded-full"></span>
                    <span class="text-xs text-muted">Generating prompt...</span>
                  </span>
                </div>
                <div class="w-full h-1 bg-line-soft rounded-full overflow-hidden">
                  <div id="detail-general-progress" class="h-full bg-blue rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
              </div>

              <div id="detail-req-error" class="text-red-400 text-xs hidden"></div>
            </div>

            <!-- Prompt Tab -->
            <div id="tab-prompt" class="detail-tab-content hidden space-y-4">
              <button
                id="detail-generate-btn"
                class="px-4 py-1.5 bg-blue text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Generate
              </button>

              <div id="detail-generate-status" class="text-muted text-xs hidden">
                <span class="inline-flex items-center gap-2">
                  <span class="animate-spin w-3 h-3 border-2 border-blue border-t-transparent rounded-full"></span>
                  Generating prompt...
                </span>
              </div>

              <div id="detail-prompt-result" class="hidden space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted font-medium">Generated Prompt</span>
                  <button id="detail-copy-btn" class="px-3 py-1 bg-card border border-line-soft text-muted rounded text-xs hover:border-blue hover:text-text-primary transition-colors">
                    Copy
                  </button>
                </div>
                <div id="detail-prompt-content" class="bg-[#0d1117] border border-line-soft rounded-lg p-4 font-mono text-xs text-muted whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                </div>
              </div>

              <div id="detail-prompt-error" class="text-red-400 text-xs hidden"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderSidebar();
    this.bindEvents();
  }

  // ── Sidebar (shared agent list + profile) ─────────

  private renderSidebar(): void {
    const sidebar = this.container?.querySelector('#detail-agent-sidebar');
    if (!sidebar) return;

    const agents = store.agents;

    sidebar.innerHTML = '';

    // ── Logo (matching Workload) ──
    const logoDiv = document.createElement('div');
    logoDiv.className = 'flex flex-col items-center shrink-0 mb-1';
    logoDiv.innerHTML = `
      <img src="/icon128.png" alt="Mutesolo" class="w-[52px] h-[52px] rounded-full object-cover shrink-0" />
    `;
    sidebar.appendChild(logoDiv);

    // ── Divider ──
    const logoDivider = document.createElement('div');
    logoDivider.className = 'w-10 border-t border-line-soft mb-1';
    sidebar.appendChild(logoDivider);

    if (store.loading) {
      const loadMsg = document.createElement('div');
      loadMsg.className = 'text-faint text-xs mt-2';
      loadMsg.textContent = 'Loading...';
      sidebar.appendChild(loadMsg);
      return;
    }

    if (agents.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'text-faint text-xs mt-2 text-center px-1';
      emptyMsg.textContent = 'No agents';
      sidebar.appendChild(emptyMsg);
    } else {
      for (const agent of agents) {
        const wl = store.getWorkload(agent);
        const done = wl?.done ?? 0;
        const total = wl ? (wl.backlog + wl.todo + wl.in_progress + wl.done) : 0;
        const color = avatarColor(agent);
        const isSelected = store.selectedAgent === agent;

        const div = document.createElement('div');
        div.className = 'flex flex-col items-center gap-1 cursor-pointer shrink-0 group relative';
        div.title = agent;
        const ring = ringSvg(done, total);

        div.innerHTML = `
          <div class="relative w-[52px] h-[52px] flex-shrink-0">
            ${ring}
            <div class="absolute inset-0 w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-bold transition-transform group-hover:scale-110"
                 style="background: ${color}; font-size: 20px; ${isSelected ? 'box-shadow: 0 0 0 3px #5b8def;' : ''}">
              ${initial(agent)}
            </div>
          </div>
          <span class="text-[13px] text-muted leading-none max-w-[62px] truncate text-center">${this.escapeHtml(agent)}</span>
          <span class="text-[12px] text-faint leading-none">${done}/${total}</span>
        `;

        div.addEventListener('click', (e) => {
          e.stopPropagation();
          store.setSelectedAgent(agent);
          window.location.hash = '#workload';
        });
        sidebar.appendChild(div);
      }
    }

    // ── Divider + Profile ──
    const divider = document.createElement('div');
    divider.className = 'w-10 border-t border-line-soft mt-auto';
    sidebar.appendChild(divider);

    const profileArea = document.createElement('div');
    profileArea.id = 'profile-area';
    profileArea.className = 'flex flex-col items-center gap-0.5 shrink-0 relative';

    const username = store.user ?? 'U';
    const init = initial(username);

    profileArea.innerHTML = `
      <button id="profile-btn" class="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white transition-transform hover:scale-110 cursor-pointer border-0"
              style="background: linear-gradient(135deg, #4f8ef7, #7c3aed);" title="${this.escapeHtml(username)}">
        ${init}
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
    const init = initial(username);

    rightPanel.innerHTML = `
      <header class="flex items-center gap-3 px-3 py-2 border-b border-line-soft shrink-0">
        <button id="profile-back-btn" class="text-muted hover:text-text-primary transition-colors text-lg leading-none cursor-pointer border-0 bg-transparent">&larr;</button>
        <h1 class="text-sm font-bold text-text-primary">Profile</h1>
      </header>
      <div class="flex-1 overflow-y-auto flex flex-col items-center pt-8 px-4">
        <div class="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold mb-4"
             style="background: linear-gradient(135deg, #4f8ef7, #7c3aed); font-size: 32px;">
          ${init}
        </div>
        <h2 class="text-lg font-semibold text-text-primary mb-1">${this.escapeHtml(username)}</h2>
        <p class="text-xs text-muted mb-6">Mutesolo Extension User</p>
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
    // Re-render the detail content by re-rendering shell and reloading data
    this.renderShell();
    this.loadData();
  }

  // ── Events ────────────────────────────────────────

  private bindEvents(): void {
    const el = this.container!;

    // Tab switching
    el.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest('.detail-tab') as HTMLElement | null;
      if (!tab) return;

      const target = tab.dataset.tab;
      const allTabs = el.querySelectorAll('.detail-tab');
      const allContents = el.querySelectorAll('.detail-tab-content');

      allTabs.forEach((t) => {
        t.classList.remove('text-blue', 'border-blue');
        t.classList.add('text-muted', 'border-transparent');
      });
      tab.classList.add('text-blue', 'border-blue');
      tab.classList.remove('text-muted', 'border-transparent');

      allContents.forEach((c) => {
        if (c.id === `tab-${target}`) {
          c.classList.remove('hidden');
        } else {
          c.classList.add('hidden');
        }
      });
    });

    // Save
    el.querySelector('#detail-save-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSave();
    });

    // General — generate prompt and switch to Prompt tab
    el.querySelector('#detail-general-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleGenerateFromGeneral(e);
    });

    // Generate
    el.querySelector('#detail-generate-btn')?.addEventListener('click', () => this.handleGenerate());

    // Copy
    el.querySelector('#detail-copy-btn')?.addEventListener('click', () => this.handleCopy());
  }

  // ── Data loading ──────────────────────────────────

  private async loadData(): Promise<void> {
    try {
      const reqRes = await apiFetch(
        `/api/requirement?project_id=${encodeURIComponent(this.projectId)}&requirement_id=${encodeURIComponent(this.requirementId)}`
      );

      if (reqRes.status === 401) { window.location.hash = '#login'; return; }
      if (!reqRes.ok) throw new Error(`Requirement API error ${reqRes.status}`);

      this.requirement = (await reqRes.json()) as Requirement;

      this.populateForm();
      this.populateAssignee();
    } catch (err) {
      this.showReqError(
        err instanceof TypeError ? 'Cannot connect to server' : (err as Error).message
      );
    }
  }

  private populateForm(): void {
    const req = this.requirement;
    if (!req) return;

    // Title
    const titleInput = this.container!.querySelector('#detail-title') as HTMLInputElement;
    if (titleInput) titleInput.value = req.title ?? '';

    // Description — set content in contenteditable div (prefer description, fallback to EditorContent)
    const editor = this.container!.querySelector('#detail-description-editor') as HTMLElement;
    if (editor) {
      if (req.description) {
        // Replace relative /assets/ paths with absolute URLs for extension context
        editor.innerHTML = req.description.replace(
          /src="\/assets\//g,
          'src="http://localhost:8787/assets/'
        );
      } else {
        // Fallback: extract text from EditorContent (Web BlockNote JSON → plain text)
        const extracted = this.extractPlainTextFromEditorContent(req.editor_content);
        if (extracted) {
          editor.textContent = extracted;
        }
      }
    }

    // Priority
    const priorityVal = req.priority ?? 'No priority';
    const radio = this.container!.querySelector(
      `input[name="priority"][value="${this.escapeAttr(priorityVal)}"]`,
    ) as HTMLInputElement;
    if (radio) radio.checked = true;
  }

  // Extract plain text from BlockNote EditorContent JSON for fallback display
  private extractPlainTextFromEditorContent(editorContent: unknown): string {
    if (!editorContent) return '';
    try {
      const blocks = Array.isArray(editorContent) ? editorContent : [editorContent];
      const texts: string[] = [];
      const collect = (node: unknown): void => {
        if (node == null) return;
        if (typeof node === 'string') {
          const t = node.trim();
          if (t) texts.push(t);
          return;
        }
        if (typeof node === 'object') {
          const obj = node as Record<string, unknown>;
          if (typeof obj.text === 'string' && (obj.text as string).trim()) {
            texts.push((obj.text as string).trim());
          }
          for (const val of Object.values(obj)) {
            collect(val);
          }
        }
        if (Array.isArray(node)) {
          for (const item of node) collect(item);
        }
      };
      collect(blocks);
      return texts.join('\n');
    } catch {
      return '';
    }
  }

  private populateAssignee(): void {
    const select = this.container!.querySelector('#detail-assignee') as HTMLSelectElement;
    if (!select) return;

    const agents = store.agents;

    select.innerHTML =
      '<option value="">Unassigned</option>' +
      agents
        .map(
          (a) =>
            `<option value="${this.escapeAttr(a)}">${this.escapeHtml(a)}</option>`,
        )
        .join('');

    if (this.requirement?.assigned_member) {
      select.value = this.requirement.assigned_member;
    }
  }

  // ── Generate from General button ────────────────────

  private async handleGenerateFromGeneral(e?: Event): Promise<void> {
    // Prevent event bubbling to sidebar (Bug 2 fix)
    if (e) { e.stopPropagation(); e.preventDefault(); }

    if (this.generating) return;
    this.generating = true;

    const btn = this.container!.querySelector('#detail-general-btn') as HTMLButtonElement;
    const statusEl = this.container!.querySelector('#detail-general-status') as HTMLElement;
    const progressBar = this.container!.querySelector('#detail-general-progress') as HTMLElement;
    const errorEl = this.container!.querySelector('#detail-req-error') as HTMLElement;

    btn.disabled = true;
    statusEl.classList.remove('hidden');
    errorEl.classList.add('hidden');

    // Animate progress bar
    let p = 0;
    const iv = setInterval(() => { p = Math.min(p + 12, 85); if (progressBar) progressBar.style.width = `${p}%`; }, 250);

    try {
      // Get description directly from contenteditable div
      const editor = this.container!.querySelector('#detail-description-editor') as HTMLElement;
      const plainText = editor?.innerHTML?.trim() || this.requirement?.description?.trim() || '';
      console.log('[DetailPage] General: plainText length:', plainText.length);

      if (!plainText) {
        throw new Error('Description is empty. Please enter a description and click Save first.');
      }

      // 3) Save to backend first, then generate with saved content
      const title = (this.container!.querySelector('#detail-title') as HTMLInputElement).value.trim();
      const priorityRadio = this.container!.querySelector<HTMLInputElement>('input[name="priority"]:checked');
      const priority = priorityRadio?.value ?? 'No priority';
      const assignedMember = (this.container!.querySelector('#detail-assignee') as HTMLSelectElement).value;

      if (title) {
        try {
          console.log('[DetailPage] General: saving before generate...');
          await apiPut(`/api/projects/${encodeURIComponent(this.projectId)}/requirements/${encodeURIComponent(this.requirementId)}`, {
            title,
            description: plainText,
            priority: priority === 'No priority' ? '' : priority,
            assigned_member: assignedMember,
          });
          if (this.requirement) this.requirement.description = plainText;
          console.log('[DetailPage] General: save OK');
        } catch (saveErr) {
          console.log('[DetailPage] General: save failed (continuing):', saveErr);
        }
      }

      console.log('[DetailPage] General: calling generate-prompt API...');
      const res = await apiFetch('/api/generate-prompt', {
        method: 'POST',
        body: JSON.stringify({
          projectId: this.projectId,
          requirementId: this.requirementId,
          plainText,
          blocks: [],
          tencentDocs: [],
          attachments: [],
        }),
      });

      if (res.status === 401) {
        // Check if token is missing entirely
        const token = await chrome.storage.local.get(['mutesolo_token']);
        const reason = !token.mutesolo_token
          ? 'Not logged in. Please go back and login.'
          : 'Session expired. Please logout and login again.';
        throw new Error(reason);
      }
      if (!res.ok) throw new Error(`Generate API error ${res.status}`);

      const data: GeneratePromptResponse = await res.json();
      console.log('[DetailPage] General: generate response keys:', Object.keys(data));
      const promptText = data.prompt ?? data.result ?? data.content ?? '';
      if (!promptText) throw new Error('No prompt content returned');

      this.promptResult = promptText;
      this.renderPromptContent(promptText);
      const resultEl = this.container!.querySelector('#detail-prompt-result') as HTMLElement;
      resultEl?.classList.remove('hidden');
      this.switchTab('prompt');
      console.log('[DetailPage] General: done, switched to prompt tab');
    } catch (err) {
      const msg = err instanceof TypeError ? 'Cannot connect to server' : (err as Error).message;
      console.error('[DetailPage] General: error:', msg);
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    } finally {
      clearInterval(iv);
      if (progressBar) progressBar.style.width = '100%';
      setTimeout(() => { this.generating = false; btn.disabled = false; statusEl.classList.add('hidden'); if (progressBar) progressBar.style.width = '0%'; }, 500);
    }
  }

  private switchTab(name: string): void {
    const allTabs = this.container!.querySelectorAll('.detail-tab');
    const allContents = this.container!.querySelectorAll('.detail-tab-content');
    allTabs.forEach((t) => {
      if ((t as HTMLElement).dataset.tab === name) {
        t.classList.add('text-blue', 'border-blue'); t.classList.remove('text-muted', 'border-transparent');
      } else {
        t.classList.remove('text-blue', 'border-blue'); t.classList.add('text-muted', 'border-transparent');
      }
    });
    allContents.forEach((c) => {
      if (c.id === `tab-${name}`) c.classList.remove('hidden'); else c.classList.add('hidden');
    });
  }

  // ── Save ──────────────────────────────────────────

  private async handleSave(): Promise<void> {
    if (this.saving) return;
    this.saving = true;

    const btn = this.container!.querySelector('#detail-save-btn') as HTMLButtonElement;
    const toast = this.container!.querySelector('#detail-save-toast') as HTMLElement;
    const errorEl = this.container!.querySelector('#detail-req-error') as HTMLElement;
    btn.disabled = true;
    errorEl.classList.add('hidden');
    toast.classList.add('hidden');

    const title = (this.container!.querySelector('#detail-title') as HTMLInputElement).value.trim();
    const priorityRadio = this.container!.querySelector<HTMLInputElement>(
      'input[name="priority"]:checked',
    );
    const priority = priorityRadio?.value ?? 'No priority';
    const assignedMember = (this.container!.querySelector('#detail-assignee') as HTMLSelectElement).value;

    // Get description directly from contenteditable div
    const editor = this.container!.querySelector('#detail-description-editor') as HTMLElement;
    const description = editor?.innerHTML?.trim() || this.requirement?.description?.trim() || '';
    console.log('[DetailPage] Save: title=', title, 'description length=', description.length);

    if (!title) {
      errorEl.textContent = 'Title is required';
      errorEl.classList.remove('hidden');
      this.saving = false;
      btn.disabled = false;
      return;
    }

    try {
      console.log('[DetailPage] Save: calling PUT API...');
      await apiPut(
        `/api/projects/${encodeURIComponent(this.projectId)}/requirements/${encodeURIComponent(this.requirementId)}`,
        {
          title,
          description,
          priority: priority === 'No priority' ? '' : priority,
          assigned_member: assignedMember,
        },
      );
      console.log('[DetailPage] Save: PUT OK');

      // Update local state
      if (this.requirement) {
        this.requirement.title = title;
        this.requirement.description = description;
        this.requirement.priority = priority === 'No priority' ? '' : priority;
        this.requirement.assigned_member = assignedMember;
      }

      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2500);
    } catch (err) {
      const msg =
        err instanceof TypeError ? 'Cannot connect to server' : (err as Error).message;
      console.error('[DetailPage] Save: error:', msg);
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    } finally {
      this.saving = false;
      btn.disabled = false;
    }
  }

  // ── Generate prompt ───────────────────────────────

  private async handleGenerate(): Promise<void> {
    if (this.generating) return;
    this.generating = true;

    const btn = this.container!.querySelector('#detail-generate-btn') as HTMLButtonElement;
    const statusEl = this.container!.querySelector('#detail-generate-status') as HTMLElement;
    const resultEl = this.container!.querySelector('#detail-prompt-result') as HTMLElement;
    const errorEl = this.container!.querySelector('#detail-prompt-error') as HTMLElement;

    btn.disabled = true;
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    try {
      // Get description directly from contenteditable div
      const editor = this.container!.querySelector('#detail-description-editor') as HTMLElement;
      const plainText = editor?.innerHTML?.trim() || this.requirement?.description?.trim() || '';

      const res = await apiFetch('/api/generate-prompt', {
        method: 'POST',
        body: JSON.stringify({
          projectId: this.projectId,
          requirementId: this.requirementId,
          plainText,
          blocks: [],
          tencentDocs: [],
          attachments: [],
        }),
      });

      if (res.status === 401) {
        // Check if token is missing entirely
        const token = await chrome.storage.local.get(['mutesolo_token']);
        const reason = !token.mutesolo_token
          ? 'Not logged in. Please go back and login.'
          : 'Session expired. Please logout and login again.';
        throw new Error(reason);
      }
      if (!res.ok) throw new Error(`Generate API error ${res.status}`);

      const data: GeneratePromptResponse = await res.json();
      const promptText = data.prompt ?? data.result ?? data.content ?? '';

      if (!promptText) {
        throw new Error('No prompt content returned');
      }

      this.promptResult = promptText;
      this.renderPromptContent(promptText);
      resultEl.classList.remove('hidden');
    } catch (err) {
      errorEl.textContent =
        err instanceof TypeError ? 'Cannot connect to server' : (err as Error).message;
      errorEl.classList.remove('hidden');
    } finally {
      this.generating = false;
      btn.disabled = false;
      statusEl.classList.add('hidden');
    }
  }

  private renderPromptContent(text: string): void {
    const el = this.container!.querySelector('#detail-prompt-content') as HTMLElement;
    if (!el) return;

    // Extract code blocks first so they aren't double-escaped
    const codeBlocks: string[] = [];
    let processed = text.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_m, _lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(`<pre class="bg-[#161b22] border border-line-soft rounded my-2 p-3 overflow-x-auto"><code class="text-xs text-[#c9d1d9]">${this.escapeHtml(code.trim())}</code></pre>`);
        return `__CODEBLOCK_${idx}__`;
      },
    );

    // Escape remaining text for HTML safety
    let html = this.escapeHtml(processed);

    // Headings
    html = html.replace(
      /^### (.+)$/gm,
      '<h4 class="text-xs font-semibold text-[#e6edf3] mt-3 mb-1">$1</h4>',
    );
    html = html.replace(
      /^## (.+)$/gm,
      '<h3 class="text-sm font-semibold text-[#e6edf3] mt-4 mb-2">$1</h3>',
    );
    html = html.replace(
      /^# (.+)$/gm,
      '<h2 class="text-base font-semibold text-[#e6edf3] mt-4 mb-2">$1</h2>',
    );

    // Bold
    html = html.replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="text-[#e6edf3]">$1</strong>',
    );

    // Inline code
    html = html.replace(
      /`([^`]+)`/g,
      '<code class="bg-[#161b22] text-[#c9d1d9] px-1 py-0.5 rounded text-[11px]">$1</code>',
    );

    // List items
    html = html.replace(
      /^- (.+)$/gm,
      '<li class="text-xs text-muted ml-4 list-disc">$1</li>',
    );

    // Double newlines to <br>
    html = html.replace(/\n\n/g, '<br/><br/>');

    // Restore code blocks
    html = html.replace(/__CODEBLOCK_(\d+)__/g, (_m, idx) => codeBlocks[parseInt(idx)] ?? '');

    el.innerHTML = html;
  }

  // ── Copy ──────────────────────────────────────────

  private async handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.promptResult);
      const btn = this.container!.querySelector('#detail-copy-btn') as HTMLButtonElement;
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('text-green-400', 'border-green-400');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('text-green-400', 'border-green-400');
      }, 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = this.promptResult;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  // ── Helpers ───────────────────────────────────────

  private showReqError(msg: string): void {
    const el = this.container?.querySelector('#detail-req-error') as HTMLElement;
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  private getParams(): Record<string, string> {
    try {
      return JSON.parse(this.container?.dataset.params ?? '{}');
    } catch {
      return {};
    }
  }

  escapeHtml(s: unknown): string {
    const str = typeof s === 'string' ? s : String(s ?? '');
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  escapeAttr(s: unknown): string {
    const str = typeof s === 'string' ? s : String(s ?? '');
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── destroy ──────────────────────────────────────

  destroy(): void {
    this.container = null;
    this.requirement = null;
    this.promptResult = '';
    this.unsub?.();
    this.unsub = null;
  }
}
