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
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900
        ${enabled ? 'bg-blue-600' : 'bg-[#2a3342]'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg
          transform transition duration-200 ease-in-out
          ${enabled ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </Switch>
  );
}
