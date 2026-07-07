import { type ReactNode } from 'react';

interface SettingsCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <div className="
      flex items-center gap-4 p-4 rounded-xl
      bg-zinc-800/60 border border-zinc-700/60
      hover:border-zinc-600 transition-colors duration-150
    ">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200 truncate">{title}</p>
        {description && (
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{description}</p>
        )}
      </div>
      <div className="shrink-0 w-56">
        {children}
      </div>
    </div>
  );
}
