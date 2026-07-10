import { Switch } from '@headlessui/react';

interface ToggleProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
}

export default function Toggle({ enabled, onChange }: ToggleProps) {
  return (
    <Switch
      checked={enabled}
      onChange={onChange}
      className={`
        group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
        transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900
        ${enabled
          ? 'bg-blue-500'
          : 'bg-zinc-800 border border-zinc-600'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0
          transform transition duration-200 ease-in-out
          group-hover:ring-4 group-hover:ring-blue-500/30
          ${enabled ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </Switch>
  );
}
