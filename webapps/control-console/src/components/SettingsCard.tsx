import { type ReactNode } from 'react';
import { cardVariants } from '../variants';
import mergeTW from '../utils/mergeTW';

interface SettingsCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  variant?: 'default' | 'elevated';
}

export default function SettingsCard({ title, description, children, variant = 'default' }: SettingsCardProps) {
  return (
    <div className={mergeTW('flex items-center gap-4 p-4', cardVariants[variant])}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{title}</p>
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
