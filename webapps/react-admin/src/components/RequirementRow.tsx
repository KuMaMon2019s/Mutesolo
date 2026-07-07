import Badge from './Badge';
import type { Requirement, ProjectBranch } from '../api/state';

interface RequirementRowProps {
  requirement: Requirement;
  branches: ProjectBranch[];
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function RequirementRow({
  requirement,
  branches,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: RequirementRowProps) {
  const branch = branches.find((b) => b.id === requirement.branch_id);

  return (
    <tr className={`border-b border-zinc-700/60 transition-colors ${selected ? 'bg-blue-600/10' : 'hover:bg-zinc-800/40'}`}>
      <td className="w-10 px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
        />
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-white truncate max-w-xs">{requirement.title}</p>
        {requirement.description && (
          <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{requirement.description}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge value={requirement.status || 'draft'} variant="status" />
      </td>
      <td className="px-4 py-3">
        <Badge value={requirement.priority || 'medium'} variant="priority" />
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-zinc-400">{requirement.agent_id || '—'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-zinc-400">{branch?.name || '—'}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
