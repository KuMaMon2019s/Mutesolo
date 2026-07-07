import type { ViewId } from '../App';

interface NavRailProps {
  currentView: ViewId;
  onViewChange: (view: ViewId) => void;
  todoRatio: string;
}

const navItems: { view: ViewId; label: string; letter: string }[] = [
  { view: 'projectsView', label: 'Projects', letter: 'P' },
  { view: 'boardView', label: 'Board', letter: 'B' },
  { view: 'connectionsView', label: 'Connections', letter: 'C' },
  { view: 'runtimesView', label: 'Runtimes', letter: 'R' },
  { view: 'skillsView', label: 'ClawHub', letter: 'S' },
];

export default function NavRail({ currentView, onViewChange, todoRatio }: NavRailProps) {
  return (
    <aside className="navRail">
      <div className="navLogo" title="Mutesolo">M</div>
      <div className="statusPill">
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
    </aside>
  );
}
