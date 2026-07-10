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
    <div className={mergeTW('grid grid-cols-[1fr_2fr] items-center gap-4 p-4', cardVariants[variant])}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#8b95a5] truncate">{title}</p>
        {description && (
          <p className="text-xs muted mt-0.5 truncate">{description}</p>
        )}
      </div>
      <div className="min-w-0">
        {children}
      </div>
    </div>
  );
}
