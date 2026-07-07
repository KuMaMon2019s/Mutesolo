import { useEffect, useState, useCallback } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import ProjectCard from '../components/ProjectCard';
import NewProjectDialog from '../components/NewProjectDialog';
import { fetchState, type Project } from '../api/state';

interface ProjectsProps {
  onOpenBoard: (projectId: string) => void;
}

export default function Projects({ onOpenBoard }: ProjectsProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const state = await fetchState();
      setProjects(state.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Projects</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage your projects and their requirements</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            bg-blue-600 text-white
            hover:bg-blue-500 transition-colors duration-150
          "
        >
          <PlusIcon className="w-4 h-4" />
          New project
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-zinc-500 text-sm">Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-zinc-500 text-sm mb-4">No projects yet</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onOpenBoard(project.id)}
            />
          ))}
        </div>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={load}
      />
    </div>
  );
}
