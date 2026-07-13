export interface User {
  id: number;
  username: string;
  created_at: string;
}

const API_BASE = '';

export async function fetchMe(): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/api/me`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  localStorage.removeItem('mutesolo_remember');
}
