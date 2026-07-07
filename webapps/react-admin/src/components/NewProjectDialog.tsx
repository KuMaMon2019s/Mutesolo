import { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react';
import { createProject } from '../api/projects';

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        plan: plan.trim() || undefined,
      });
      setName('');
      setDescription('');
      setPlan('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/60" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-zinc-800 border border-zinc-700 shadow-xl">
          <form onSubmit={handleSubmit}>
            <div className="px-6 pt-6 pb-4">
              <DialogTitle className="text-lg font-semibold text-white">New Project</DialogTitle>
              <p className="text-sm text-zinc-500 mt-1">Create a new project to track requirements.</p>

              {error && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My project"
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
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Plan</label>
                  <textarea
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder="Optional plan or roadmap..."
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
                disabled={!name.trim() || submitting}
                className="
                  px-4 py-2 rounded-lg text-sm font-medium
                  bg-blue-600 text-white
                  hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors duration-150
                "
              >
                {submitting ? 'Creating...' : 'Create project'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
