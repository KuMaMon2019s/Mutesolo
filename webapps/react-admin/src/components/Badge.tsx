const statusColors: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  sent: 'bg-blue-600 text-blue-100',
  done: 'bg-green-600 text-green-100',
};

const priorityColors: Record<string, string> = {
  low: 'bg-zinc-700 text-zinc-300',
  medium: 'bg-yellow-600 text-yellow-100',
  high: 'bg-red-600 text-red-100',
};

interface BadgeProps {
  value: string;
  variant: 'status' | 'priority';
}

export default function Badge({ value, variant }: BadgeProps) {
  const palette = variant === 'status' ? statusColors : priorityColors;
  const color = palette[value] || 'bg-zinc-700 text-zinc-300';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {value}
    </span>
  );
}
