import {
  HomeIcon,
  FolderIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import SidebarIcon from './SidebarIcon';

export type Page = 'dashboard' | 'projects' | 'connections' | 'agents';

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
  dark: boolean;
  onToggleDark: () => void;
}

export default function Sidebar({ current, onNavigate, dark, onToggleDark }: SidebarProps) {
  return (
    <aside className="
      fixed left-0 top-0 bottom-0 w-[64px] bg-zinc-950 border-r border-zinc-800
      flex flex-col items-center py-4 gap-1 z-40
    ">
      <div className="flex flex-col items-center gap-1 flex-1">
        <SidebarIcon
          icon={<HomeIcon className="w-5 h-5" />}
          label="Home"
          active={current === 'dashboard'}
          onClick={() => onNavigate('dashboard')}
        />
        <SidebarIcon
          icon={<FolderIcon className="w-5 h-5" />}
          label="Projects"
          active={current === 'projects'}
          onClick={() => onNavigate('projects')}
        />
        <SidebarIcon
          icon={<Cog6ToothIcon className="w-5 h-5" />}
          label="Connections"
          active={current === 'connections'}
          onClick={() => onNavigate('connections')}
        />
        <SidebarIcon
          icon={<CpuChipIcon className="w-5 h-5" />}
          label="Agents"
          active={current === 'agents'}
          onClick={() => onNavigate('agents')}
        />
      </div>

      <div className="mt-auto">
        <SidebarIcon
          icon={dark
            ? <SunIcon className="w-5 h-5" />
            : <MoonIcon className="w-5 h-5" />
          }
          label={dark ? 'Light mode' : 'Dark mode'}
          onClick={onToggleDark}
        />
      </div>
    </aside>
  );
}
