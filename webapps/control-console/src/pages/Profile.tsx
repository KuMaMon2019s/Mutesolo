import { useState, useEffect } from 'react';
import type { AppContextType } from '../App';
import { fetchMe, logout, type User } from '../api/auth';
import { api } from '../api/client';
import { toast } from '../components/toastStore';

interface Props { ctx: AppContextType }

export default function Profile({ ctx }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<'account' | 'security'>('account');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    fetchMe().then(setUser).catch(() => {});
  }, []);

  if (!user) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || newPw.length < 4) {
      setPwError('New password must be at least 4 characters');
      return;
    }
    setPwError('');
    setPwLoading(true);
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      toast('success', 'Password changed successfully');
      setCurrentPw('');
      setNewPw('');
    } catch (err: any) {
      setPwError(err?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="profilePage">
      <nav className="profileSidebar">
        <button className={`profileTab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>Account</button>
        <button className={`profileTab ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>Security</button>
      </nav>

      <div className="profileMain">
        <div className="profileBanner">
          <div className="profileAvatarLarge">{user.username.slice(0, 2).toUpperCase()}</div>
          <div>
            <h2 className="profileNameBanner">{user.username}</h2>
            <p className="profileMetaBanner">Member since {new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        {tab === 'account' && (
          <div className="profileSection">
            <h3 className="profileSectionTitle">Account Information</h3>
            <div className="profileGrid">
              <div className="profileField"><label className="profileFieldLabel">User ID</label><p className="profileFieldValue">{user.id}</p></div>
              <div className="profileField"><label className="profileFieldLabel">Username</label><p className="profileFieldValue">{user.username}</p></div>
              <div className="profileField"><label className="profileFieldLabel">Account created</label><p className="profileFieldValue">{new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
            </div>
          </div>
        )}

        {tab === 'security' && (
          <div className="profileSection">
            <h3 className="profileSectionTitle">Change Password</h3>
            <form onSubmit={handleChangePassword} className="profileForm">
              <div className="profileField">
                <label className="profileFieldLabel">Current password</label>
                <input type="password" className="loginInput" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Enter current password" required />
              </div>
              <div className="profileField">
                <label className="profileFieldLabel">New password</label>
                <input type="password" className="loginInput" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 4 characters" required />
              </div>
              {pwError && <p className="loginError">{pwError}</p>}
              <button type="submit" className="loginBtn" disabled={pwLoading} style={{ width: 200 }}>
                {pwLoading ? 'Saving...' : 'Change password'}
              </button>
            </form>
          </div>
        )}

        <div className="profileActions">
          <button className="profileLogoutBtn" onClick={async () => { await logout(); ctx.setView('loginView'); toast('success', 'Logged out'); }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
