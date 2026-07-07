import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { inputVariants } from '../variants';

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
        className={inputVariants.default}
      />
      {type === 'password' && (
        <button
          type="button"
          onClick={() => setIsPassword(!isPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-1"
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
