import type { PageComponent } from '../lib/router';
import { checkAuth, showToast } from '../lib/api';

export class SettingsPage implements PageComponent {
  private container: HTMLElement | null = null;

  async render(container: HTMLElement): Promise<void> {
    this.container = container;

    // Auth guard — redirect if not logged in
    if (!(await checkAuth())) return;

    this.renderShell();
    this.loadUser();
  }

  private renderShell(): void {
    const el = this.container!;

    el.innerHTML = `
      <!-- Header -->
      <header class="flex items-center gap-2 px-3 py-2 border-b border-line-soft shrink-0">
        <a href="#workload" class="text-muted hover:text-text-primary transition-colors text-lg leading-none">&larr;</a>
        <h1 class="text-sm font-bold text-text-primary">Settings</h1>
      </header>

      <!-- Settings content -->
      <div class="flex-1 overflow-y-auto p-4 space-y-5">
        <section>
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Account</h2>
          <div class="bg-card border border-line-soft rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div id="settings-user-avatar" class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: #5b8def;">
                  ?
                </div>
                <span class="text-sm text-text-primary truncate" id="settings-user">Loading...</span>
              </div>
              <button id="logout-btn" class="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-medium hover:bg-red-500/20 transition-colors shrink-0 ml-3">
                Logout
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Backend</h2>
          <div class="bg-card border border-line-soft rounded-lg p-3">
            <p class="text-xs text-muted">API endpoint: <code class="text-blue bg-line-soft px-1 rounded">http://localhost:8787</code></p>
          </div>
        </section>

        <section>
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">About</h2>
          <div class="bg-card border border-line-soft rounded-lg p-3">
            <p class="text-xs text-muted">Mutesolo Extension v0.1.0</p>
            <p class="text-xs text-faint mt-1">Agent Task Manager — Chrome Side Panel</p>
          </div>
        </section>
      </div>
    `;

    this.bindEvents();
  }

  private async loadUser(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['mutesolo_user']);
      const username: string | undefined = result.mutesolo_user;

      const userEl = this.container?.querySelector('#settings-user');
      const avatarEl = this.container?.querySelector('#settings-user-avatar') as HTMLElement;

      if (userEl && username) {
        userEl.textContent = username;

        // Update avatar with initial
        if (avatarEl) {
          avatarEl.textContent = (username[0] ?? '?').toUpperCase();
          // Generate consistent avatar color from username
          avatarEl.style.background = this.avatarColor(username);
        }
      } else if (userEl) {
        userEl.textContent = 'Not logged in';
        userEl.classList.add('text-muted');
      }
    } catch {
      const userEl = this.container?.querySelector('#settings-user');
      if (userEl) {
        userEl.textContent = 'Error loading user';
        userEl.classList.add('text-red-400');
      }
    }
  }

  private bindEvents(): void {
    const el = this.container!;

    el.querySelector('#logout-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        this.handleLogout();
      }
    });
  }

  private async handleLogout(): Promise<void> {
    try {
      await chrome.storage.local.remove(['mutesolo_token', 'mutesolo_user']);
      showToast('Logged out successfully', 'success');
      // Short delay so user sees the toast
      setTimeout(() => {
        window.location.hash = '#login';
      }, 500);
    } catch {
      showToast('Logout failed', 'error');
    }
  }

  // ── Helpers ──────────────────────────────────────────

  private avatarColor(name: unknown): string {
    const s = typeof name === 'string' && name.length > 0 ? name : String(name ?? '?');
    const colors = [
      '#5b8def', '#e05b8d', '#5be0a3', '#e0c85b', '#8d5be0', '#e08d5b',
      '#5bc0de', '#de8d5b', '#a35be0', '#e05ba3', '#5be0c8', '#c8e05b',
    ];
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (hash * 31 + s.charCodeAt(i)) | 0;
    }
    return colors[Math.abs(hash) % colors.length];
  }

  destroy(): void {
    this.container = null;
  }
}
