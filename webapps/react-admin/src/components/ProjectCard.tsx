import { FolderIcon, CodeBracketIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import type { Project } from '../api/state';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export default function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        group text-left w-full p-5 rounded-xl
        bg-zinc-800 border border-zinc-700
        hover:border-zinc-500 hover:bg-zinc-800/80
        transition-all duration-150 cursor-pointer
      "
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-700/60 text-zinc-400 group-hover:text-zinc-200 transition-colors">
          <FolderIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{project.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <CodeBracketIcon className="w-3.5 h-3.5" />
          {project.branches.length} branch{project.branches.length !== 1 ? 'es' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
          {project.requirements.length} req{project.requirements.length !== 1 ? 's' : ''}
        </span>
      </div>
    </button>
  );
}
