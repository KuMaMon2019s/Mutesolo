import type { ViewId } from '../App';
import type { User } from '../api/auth';

interface NavRailProps {
  currentView: ViewId;
  onViewChange: (view: ViewId) => void;
  todoRatio: string;
  user?: User | null;
}

const navItems: { view: ViewId; label: string; letter: string }[] = [
  { view: 'projectsView', label: 'Projects', letter: 'P' },
  { view: 'boardView', label: 'Board', letter: 'B' },
  { view: 'githubReposView', label: 'GitHub', letter: 'G' },
  { view: 'skillsView', label: 'ClawHub', letter: 'S' },
  { view: 'runtimesView', label: 'Runtimes', letter: 'R' },
  { view: 'connectionsView', label: 'Connections', letter: 'C' },
];

export default function NavRail({ currentView, onViewChange, todoRatio, user }: NavRailProps) {
  const pct = parseInt(todoRatio) || 0;
  return (
    <aside className="navRail">
      <div className="navLogo" title="Mutesolo">M</div>
      <div className="statusPill" style={{ '--fill-pct': `${pct}%` } as React.CSSProperties}>
        <strong>{todoRatio}</strong>
        <span>TO DO</span>
      </div>
      <nav>
        {navItems.map(item => (
          <button
            key={item.view}
            className={`navIcon ${currentView === item.view ? 'active' : ''}`}
            data-view={item.view}
            title={item.label}
            onClick={() => onViewChange(item.view)}
          >
            {item.letter}
          </button>
        ))}
      </nav>
      {user && (
        <div className="navRailFooter">
          <button
            className="navUserAvatar"
            title={user.username}
            onClick={() => onViewChange('profileView')}
          >
            {user.username.slice(0, 2).toUpperCase()}
          </button>
        </div>
      )}
    </aside>
  );
}
