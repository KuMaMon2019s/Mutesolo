import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}

export default function TextInput({ value, onChange, placeholder, type = 'text' }: TextInputProps) {
  const [isPassword, setIsPassword] = useState(type === 'password');

  return (
    <div className="relative">
      <input
        type={isPassword ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ''}
        className="
          w-full px-3 py-2 rounded-lg text-sm
          bg-zinc-900 border border-zinc-700 text-white
          placeholder-zinc-600
          focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
          transition-colors duration-150
        "
      />
      {type === 'password' && (
        <button
          type="button"
          onClick={() => setIsPassword(!isPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
        >
          {isPassword
            ? <EyeSlashIcon className="w-4 h-4" />
            : <EyeIcon className="w-4 h-4" />
          }
        </button>
      )}
    </div>
  );
}
