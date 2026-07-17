const API_BASE = 'http://localhost:8787';

async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(['mutesolo_token']);
  return result.mutesolo_token ?? null;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getToken();

  if (!token) {
    // No token at all — the caller must handle this
    const res = new Response(JSON.stringify({ error: 'No auth token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    return res;
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

  const url = `${API_BASE}${path}`;
  return fetch(url, {
    ...options,
    headers,
  });
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    let errorMsg = `API error ${res.status}`;
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await res.json();
        errorMsg = (body as any).error || body.message || errorMsg;
      } else {
        const text = await res.text();
        const preview = text.substring(0, 200);
        errorMsg = `API error ${res.status}: received non-JSON response (${contentType || 'no content-type'}): ${preview}`;
      }
    } catch {
      errorMsg = `API error ${res.status}: could not parse response`;
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPut<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ────────────────────────────────────────────────

/**
 * Check if user is authenticated. Redirects to #login if no token.
 * Call this at the start of render() for protected pages.
 * Returns true if authenticated, false if redirected.
 */
export async function checkAuth(): Promise<boolean> {
  const result = await chrome.storage.local.get(['mutesolo_token']);
  if (!result.mutesolo_token) {
    window.location.hash = '#login';
    return false;
  }
  return true;
}

// ── Toast ───────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info';

const TOAST_COLORS: Record<ToastType, string> = {
  success: 'bg-green-500/10 text-green-400 border-green-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'global-toast-container';
    toastContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a global toast notification.
 * @param message - The message to display.
 * @param type - 'success' | 'error' | 'info' (default: 'info').
 * @param durationMs - Auto-hide duration in ms (default: 3000).
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  durationMs = 3000,
): void {
  const container = getToastContainer();
  const colorClass = TOAST_COLORS[type] ?? TOAST_COLORS.info;

  const toast = document.createElement('div');
  toast.className = `px-4 py-2 rounded-lg border text-xs font-medium ${colorClass} shadow-lg animate-in`;
  toast.textContent = message;
  toast.style.cssText += 'animation: slideIn 0.3s ease;';

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}
