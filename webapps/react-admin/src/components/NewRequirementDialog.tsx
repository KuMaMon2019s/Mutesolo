import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react';
import { addRequirement, updateRequirement } from '../api/projects';
import type { ProjectBranch, Requirement } from '../api/state';

interface NewRequirementDialogProps {
  open: boolean;
  projectId: string;
  branches: ProjectBranch[];
  onClose: () => void;
  onCreated: () => void;
  requirement?: Requirement;
}

export default function NewRequirementDialog({
  open,
  projectId,
  branches,
  onClose,
  onCreated,
  requirement,
}: NewRequirementDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [branchId, setBranchId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!requirement;

  useEffect(() => {
    if (open && requirement) {
      setTitle(requirement.title);
      setDescription(requirement.description || '');
      setPriority(requirement.priority || 'medium');
      setBranchId(requirement.branch_id || '');
    } else if (open) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setBranchId('');
    }
    setError('');
  }, [open, requirement]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      if (isEditing && requirement) {
        await updateRequirement(projectId, requirement.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          branch_id: branchId || undefined,
        });
      } else {
        await addRequirement(projectId, {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          branch_id: branchId || undefined,
        });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditing ? 'Failed to update requirement' : 'Failed to create requirement');
    } finally {
      setSubmitting(false);
    }
  };

  const selectClass = `
    w-full px-3 py-2 rounded-lg text-sm
    bg-zinc-900 border border-zinc-700 text-white
    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
    transition-colors duration-150
  `;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/60" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-zinc-800 border border-zinc-700 shadow-xl">
          <form onSubmit={handleSubmit}>
            <div className="px-6 pt-6 pb-4">
              <DialogTitle className="text-lg font-semibold text-white">
                {isEditing ? 'Edit Requirement' : 'New Requirement'}
              </DialogTitle>
              <p className="text-sm text-zinc-500 mt-1">
                {isEditing ? 'Update the requirement details.' : 'Add a requirement to this project.'}
              </p>

              {error && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Requirement title"
                    className="
                      w-full px-3 py-2 rounded-lg text-sm
                      bg-zinc-900 border border-zinc-700 text-white
                      placeholder-zinc-600
                      focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                      transition-colors duration-150
                    "
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={3}
                    className="
                      w-full px-3 py-2 rounded-lg text-sm
                      bg-zinc-900 border border-zinc-700 text-white
                      placeholder-zinc-600
                      focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                      transition-colors duration-150 resize-none
                    "
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                {branches.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Branch</label>
                    <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectClass}>
                      <option value="">No branch</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || submitting}
                className="
                  px-4 py-2 rounded-lg text-sm font-medium
                  bg-blue-600 text-white
                  hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors duration-150
                "
              >
                {submitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save changes' : 'Create requirement')}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
