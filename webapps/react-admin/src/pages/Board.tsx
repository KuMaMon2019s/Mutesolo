import { useEffect, useState, useCallback } from 'react';
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/20/solid';
import RequirementRow from '../components/RequirementRow';
import NewRequirementDialog from '../components/NewRequirementDialog';
import { fetchState, type Project, type Requirement } from '../api/state';
import { updateBoard } from '../api/projects';
import Badge from '../components/Badge';

interface BoardProps {
  projectId: string;
  onBack: () => void;
}

export default function Board({ projectId, onBack }: BoardProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);

  const load = useCallback(async () => {
    try {
      const state = await fetchState();
      const found = state.projects.find((p) => p.id === projectId);
      if (found) {
        setProject(found);
      } else {
        setError('Project not found');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!project) return;
    const allIds = project.requirements.map((r) => r.id);
    const allSelected = allIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const handleBatchUpdate = async (status: string) => {
    if (selected.size === 0) return;
    setBatchSubmitting(true);
    setBatchStatus('');
    try {
      await updateBoard(projectId, {
        requirement_ids: Array.from(selected),
        status,
      });
      setBatchStatus(`Updated ${selected.size} requirement(s) to "${status}"`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setBatchStatus(e instanceof Error ? e.message : 'Batch update failed');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleDelete = (reqId: string) => {
    if (!project) return;
    const updated = project.requirements.filter((r) => r.id !== reqId);
    setProject({ ...project, requirements: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500 text-sm">Loading board...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-5xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to projects
        </button>
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
          {error || 'Project not found'}
        </div>
      </div>
    );
  }

  const allIds = project.requirements.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  return (
    <div className="max-w-5xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to projects
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
          )}
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
          New requirement
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
          {error}
        </div>
      )}

      {batchStatus && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-blue-900/30 border border-blue-800 text-blue-400 text-sm">
          {batchStatus}
        </div>
      )}

      {project.requirements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-zinc-900 border border-zinc-700">
          <p className="text-zinc-500 text-sm mb-4">No requirements yet</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Add your first requirement
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-zinc-900 border border-zinc-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {project.requirements.map((req: Requirement) => (
                  <RequirementRow
                    key={req.id}
                    requirement={req}
                    branches={project.branches}
                    selected={selected.has(req.id)}
                    onToggleSelect={() => toggleSelect(req.id)}
                    onEdit={() => setEditingReq(req)}
                    onDelete={() => handleDelete(req.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {selected.size > 0 && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700">
              <span className="text-sm text-zinc-400">
                {selected.size} selected
              </span>
              <div className="h-4 w-px bg-zinc-700" />
              <span className="text-xs text-zinc-500">Set status:</span>
              {(['draft', 'sent', 'done'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => handleBatchUpdate(status)}
                  disabled={batchSubmitting}
                  className="flex items-center gap-1.5"
                >
                  <Badge value={status} variant="status" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <NewRequirementDialog
        open={dialogOpen}
        projectId={projectId}
        branches={project.branches}
        onClose={() => setDialogOpen(false)}
        onCreated={load}
      />

      <NewRequirementDialog
        open={!!editingReq}
        projectId={projectId}
        branches={project.branches}
        onClose={() => setEditingReq(null)}
        onCreated={load}
        requirement={editingReq ?? undefined}
      />
    </div>
  );
}
