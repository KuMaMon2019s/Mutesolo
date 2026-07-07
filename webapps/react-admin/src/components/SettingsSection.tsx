import { type ReactNode } from 'react';

interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

export default function SettingsSection({ icon, title, children }: SettingsSectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-zinc-300">{icon}</span>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {children}
      </div>
    </section>
  );
}
