import { apiFetch } from './api';

// ── Types ──────────────────────────────────────────────

export interface AgentWorkload {
  agent: string;
  backlog: number;
  todo: number;
  in_progress: number;
  done: number;
  projects: string[];
}

type Listener = () => void;

// ── Store ──────────────────────────────────────────────

class Store {
  private _workloads: AgentWorkload[] = [];
  private _selectedAgent: string | null = null;
  private _user: string | null = null;
  private _loading = false;
  private _error: string | null = null;
  private listeners: Set<Listener> = new Set();

  get workloads(): AgentWorkload[] { return this._workloads; }
  get selectedAgent(): string | null { return this._selectedAgent; }
  get user(): string | null { return this._user; }
  get loading(): boolean { return this._loading; }
  get error(): string | null { return this._error; }

  /** Agent list derived from workloads (DB-backed, not Discord bot API).
   *  Filters out entries where agent is not a string (defensive against API shape changes). */
  get agents(): string[] {
    return this._workloads
      .filter(w => typeof w.agent === 'string' && w.agent.length > 0)
      .map(w => w.agent);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  setSelectedAgent(agent: string | null): void {
    this._selectedAgent = agent;
    this.notify();
  }

  /** Load user from chrome.storage. Safe to call multiple times. */
  async loadUser(): Promise<void> {
    if (this._user !== null) return; // already loaded
    try {
      const result = await chrome.storage.local.get(['mutesolo_user']);
      const stored = result.mutesolo_user;
      // Handle both old format (object {username}) and new format (string)
      if (stored && typeof stored === 'object' && 'username' in stored) {
        this._user = (stored as { username: string }).username;
        // Migrate to new format
        await chrome.storage.local.set({ mutesolo_user: this._user });
      } else if (typeof stored === 'string') {
        this._user = stored;
      } else {
        this._user = null;
      }
    } catch {
      this._user = null;
    }
    this.notify();
  }

  /** Load agent workloads from backend DB. Cached — only loads once. */
  async loadWorkloads(force = false): Promise<void> {
    if (!force && (this._loading || this._workloads.length > 0)) return;

    this._loading = true;
    this._error = null;
    this.notify();

    try {
      const res = await apiFetch('/api/agent-workload');
      if (res.status === 401) { window.location.hash = '#login'; return; }
      if (!res.ok) throw new Error(`Workloads API error ${res.status}`);

      const raw = await res.json();
      console.log('[store] /api/agent-workload raw response:', raw);

      // Validate response shape — must be an array
      if (!Array.isArray(raw)) {
        console.error('[store] workloads response is not an array:', typeof raw);
        throw new Error('Invalid workloads response: expected array');
      }

      // Filter out entries with non-string agent names (defensive)
      const valid: AgentWorkload[] = [];
      const bad: unknown[] = [];
      for (const w of raw) {
        if (w && typeof w.agent === 'string') {
          valid.push(w as AgentWorkload);
        } else {
          bad.push(w);
        }
      }
      if (bad.length > 0) {
        console.warn('[store] filtered out', bad.length, 'workload entries with non-string agent:', bad);
      }

      this._workloads = valid;
      console.log('[store] workloads loaded:', valid.length, 'agents');
      this._error = null;
    } catch (err) {
      this._error = err instanceof TypeError
        ? 'Cannot connect to server'
        : (err as Error).message;
    } finally {
      this._loading = false;
      this.notify();
    }
  }

  /** Get workload for a specific agent. */
  getWorkload(agent: string): AgentWorkload | undefined {
    if (typeof agent !== 'string') return undefined;
    return this._workloads.find(w => w.agent === agent);
  }

  /** Logout: clear storage + reset store. */
  async handleLogout(): Promise<void> {
    try {
      await chrome.storage.local.remove(['mutesolo_token', 'mutesolo_user']);
    } catch { /* best effort */ }

    this._user = null;
    this._workloads = [];
    this._selectedAgent = null;
    this._error = null;
    this.notify();

    window.location.hash = '#login';
  }
}

export const store = new Store();
