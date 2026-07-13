import { useState, useEffect } from 'react';
import { api } from '../api/client';

type Mode = 'login' | 'register';

const REMEMBER_KEY = 'mutesolo_remember';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load saved credentials on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.username) setUsername(data.username);
        if (data.password) setPassword(data.password);
        setRememberMe(true);
      }
    } catch {}
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      // Save or clear credentials
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({
          username: username.trim(),
          password,
        }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      window.location.href = '/';
    } catch (err: any) {
      setError(err?.message || (mode === 'login' ? 'Invalid username or password' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginPage">
      <div className="loginBg">
        <img src="/login-bg.png" alt="" className="loginBgImg" />
      </div>

      <div className="loginRight">
        <div className="loginFormSide">
          <div className="loginFormHead">
            <div className="loginLogo">M</div>
            <h1 className="loginFormTitle">
              {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
            </h1>
            <p className="loginFormSub">
              {mode === 'login' ? (
                <>Don't have an account?{' '}
                  <button type="button" onClick={() => { setMode('register'); setError(''); }} className="loginToggle">Sign up</button>
                </>
              ) : (
                <>Already have an account?{' '}
                  <button type="button" onClick={() => { setMode('login'); setError(''); }} className="loginToggle">Sign in</button>
                </>
              )}
            </p>
          </div>

          <form onSubmit={submit} className="loginForm">
            <div className="loginField">
              <label className="loginLabel">Username</label>
              <input
                className="loginInput"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="loginField">
              <label className="loginLabel">Password</label>
              <input
                className="loginInput"
                type="password"
                placeholder={mode === 'login' ? 'Enter your password' : 'Create a password (min 4 chars)'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <label className="loginRemember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
            {error && <p className="loginError">{error}</p>}
            <button type="submit" className="loginBtn" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
