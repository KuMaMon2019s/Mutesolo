import { type ReactNode } from 'react';

interface SidebarIconProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export default function SidebarIcon({ icon, label, active, onClick }: SidebarIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`
        group relative flex items-center justify-center w-11 h-11 rounded-xl
        transition-colors duration-150 cursor-pointer
        ${active
          ? 'bg-zinc-700 text-white'
          : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
        }
      `}
    >
      {icon}
      <span className="
        absolute left-full ml-3 px-2 py-1 rounded-md text-xs font-medium
        bg-zinc-800 text-zinc-200 border border-zinc-700
        opacity-0 group-hover:opacity-100 pointer-events-none
        transition-opacity duration-150 whitespace-nowrap z-50
      ">
        {label}
      </span>
    </button>
  );
}
