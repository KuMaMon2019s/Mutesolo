import type { PageComponent } from '../lib/router';

export class LoginPage implements PageComponent {
  private container: HTMLElement | null = null;
  private submitting = false;

  async render(container: HTMLElement): Promise<void> {
    console.log('[LoginPage] render() called');
    this.container = container;

    // If already logged in, skip to workload
    const result = await chrome.storage.local.get(['mutesolo_token']);
    if (result.mutesolo_token) {
      window.location.hash = '#workload';
      return;
    }

    // Load saved credentials
    const savedCredentials = await chrome.storage.local.get(['mutesolo_remember_username', 'mutesolo_remember_password']);
    const savedUsername = savedCredentials.mutesolo_remember_username ?? '';
    const savedPassword = savedCredentials.mutesolo_remember_password ?? '';
    const hasSaved = !!(savedUsername && savedPassword);

    container.innerHTML = `
      <!-- Background -->
      <div class="absolute inset-0 z-0">
        <img src="/background.jpeg" alt="" class="w-full h-full object-cover opacity-30" />
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      </div>

      <!-- Content -->
      <div class="relative z-10 flex flex-col items-center justify-center h-full px-6">
        <!-- Logo / Title -->
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold tracking-tight text-text-primary">Mutesolo</h1>
          <p class="text-muted text-sm mt-1">Agent Task Manager</p>
        </div>

        <!-- Login Form -->
        <form id="login-form" class="w-full max-w-xs space-y-4">
          <div>
            <label class="block text-xs text-muted mb-1" for="username">Username</label>
            <input
              id="username"
              type="text"
              autocomplete="username"
              class="w-full px-3 py-2 bg-card/80 border border-line-soft rounded-md text-text-primary text-sm placeholder-faint focus:outline-none focus:border-blue transition-colors"
              placeholder="Enter username"
              value="${this.escapeAttr(savedUsername)}"
              required
            />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1" for="password">Password</label>
            <input
              id="password"
              type="password"
              autocomplete="current-password"
              class="w-full px-3 py-2 bg-card/80 border border-line-soft rounded-md text-text-primary text-sm placeholder-faint focus:outline-none focus:border-blue transition-colors"
              placeholder="Enter password"
              value="${this.escapeAttr(savedPassword)}"
              required
            />
          </div>

          <!-- Remember me -->
          <label class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input id="remember-checkbox" type="checkbox" class="accent-blue w-3.5 h-3.5" ${hasSaved ? 'checked' : ''} />
            <span>Remember me</span>
          </label>

          <div id="login-error" class="text-red-400 text-xs hidden"></div>
          <button
            id="login-btn"
            type="submit"
            class="w-full py-2 bg-blue text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Login
          </button>
        </form>

        <p class="text-faint text-xs mt-6">Login only — no registration</p>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const form = this.container!.querySelector('#login-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => this.handleLogin(e));
  }

  private async handleLogin(e: Event): Promise<void> {
    e.preventDefault();
    if (this.submitting) return;

    const username = (this.container!.querySelector('#username') as HTMLInputElement).value.trim();
    const password = (this.container!.querySelector('#password') as HTMLInputElement).value;
    const remember = (this.container!.querySelector('#remember-checkbox') as HTMLInputElement).checked;
    const errorEl = this.container!.querySelector('#login-error') as HTMLElement;
    const btn = this.container!.querySelector('#login-btn') as HTMLButtonElement;

    if (!username || !password) {
      errorEl.textContent = 'Please enter username and password';
      errorEl.classList.remove('hidden');
      return;
    }

    this.submitting = true;
    btn.disabled = true;
    btn.textContent = 'Logging in...';
    errorEl.classList.add('hidden');

    try {
      const res = await fetch('http://localhost:8787/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Invalid credentials');
        }
        throw new Error(`Server error (${res.status})`);
      }

      const data: unknown = await res.json();
      console.log('[LoginPage] login response:', data);

      // Backend returns {token, user:{id,username,created_at}}
      if (
        !data ||
        typeof data !== 'object' ||
        typeof (data as Record<string, unknown>).token !== 'string'
      ) {
        console.error('[LoginPage] unexpected response shape:', data);
        throw new Error('Invalid server response');
      }

      const { token, user } = data as { token: string; user: { id: number; username: string } };

      // Validate username is a string
      if (typeof user?.username !== 'string') {
        console.error('[LoginPage] unexpected user shape:', user);
        throw new Error('Invalid server response');
      }

      // Save token + user
      const storageItems: Record<string, string> = {
        mutesolo_token: token,
        mutesolo_user: user.username,
      };

      // Remember me: save credentials, otherwise clear
      if (remember) {
        storageItems['mutesolo_remember_username'] = username;
        storageItems['mutesolo_remember_password'] = password;
      } else {
        await chrome.storage.local.remove(['mutesolo_remember_username', 'mutesolo_remember_password']);
      }

      await chrome.storage.local.set(storageItems);

      console.log('[LoginPage] login success, redirecting to #workload');
      window.location.hash = '#workload';
    } catch (err) {
      if (err instanceof TypeError) {
        errorEl.textContent = 'Cannot connect to server';
      } else if (err instanceof Error) {
        errorEl.textContent = err.message;
      } else {
        errorEl.textContent = 'Login failed';
      }
      errorEl.classList.remove('hidden');
    } finally {
      this.submitting = false;
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  }

  private escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  destroy(): void {
    this.container = null;
  }
}
