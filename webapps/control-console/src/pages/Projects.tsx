import { useState } from 'react';
import type { AppContextType } from '../App';
import { createProject, deleteProject } from '../api/projects';
import { buttonVariants } from '../variants';
import mergeTW from '../utils/mergeTW';
import { toast } from '../components/toastStore';
interface Props { ctx: AppContextType }

export default function Projects({ ctx }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState('');
  const [docs, setDocs] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    try {
      const project = await createProject({ name, description, plan, docs });
      ctx.selectProject(project.id);
      ctx.setView('boardView');
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <section id="projectsView" className="view activeView">
      <div className="viewHead">
        <div>
          <h2>Project List</h2>
          <p className="muted">Create a project, then enter its board to coordinate requirements.</p>
        </div>
        <button
          className={mergeTW(buttonVariants.primary)}
          onClick={() => { setName(''); setDescription(''); setPlan(''); setDocs(''); setShowForm(true); }}
        >
          Create Project
        </button>
      </div>

      {/* Project Cards — waterfall layout */}
      {ctx.state?.projects.length === 0 ? (
        <div className="empty" style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ color: '#8b95a5', fontSize: '15px', marginBottom: '12px' }}>No projects yet</p>
          <button className={mergeTW(buttonVariants.secondary)} onClick={() => setShowForm(true)}>
            Create your first project
          </button>
        </div>
      ) : (
        <div className="waterfallGrid">
          {ctx.state?.projects.map(project => (
            <div key={project.id} className="waterfallCard">
              <div className="waterfallCardInner">
                <img
                  className="waterfallCover"
                  src={`/api/projects/${project.id}/image`}
                  alt={project.name}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${project.id}/400/240`;
                  }}
                />
                <div className="waterfallBody">
                  <strong className="waterfallTitle">{project.name}</strong>
                  {project.description && (
                    <p className="waterfallDesc">{project.description}</p>
                  )}
                  <p className="waterfallMeta">
                    {(project.requirements || []).length} requirement point(s)
                  </p>
                </div>
                <div className="waterfallOverlay">
                  <button
                    className="waterfallOverlayBtn comeOn"
                    onClick={() => {
                      ctx.selectProject(project.id);
                      ctx.setView('boardView');
                    }}
                  >
                    Come on
                  </button>
                  <button
                    className="waterfallOverlayBtn delete"
                    onClick={() => setDeleteConfirm({ id: project.id, name: project.name })}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showForm && (
        <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <section className="modal">
            <div className="modalHead">
              <h2>Create Project</h2>
              <button className={mergeTW(buttonVariants.secondary)} onClick={() => setShowForm(false)}>Close</button>
            </div>
            <div className="formStack">
              <div className="inputWithCounter">
                <input
                  placeholder="Project name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
                <span className="charCounter">{name.length}/100</span>
              </div>
              <input
                placeholder="Description"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
              <textarea
                placeholder="Planning map"
                value={plan}
                onChange={e => setPlan(e.target.value)}
              />
              <textarea
                placeholder="Requirement document"
                value={docs}
                onChange={e => setDocs(e.target.value)}
              />
            </div>
            <button
              className={mergeTW(buttonVariants.primary, 'wide')}
              disabled={!name.trim()}
              onClick={handleCreate}
            >
              Create Project
            </button>
          </section>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget && !deleting) setDeleteConfirm(null); }}>
          <section className="modal">
            <div className="modalHead">
              <h2>Delete Project</h2>
              <button className={mergeTW(buttonVariants.secondary)} onClick={() => setDeleteConfirm(null)} disabled={deleting}>Close</button>
            </div>
            <div className="formStack">
              <p style={{ color: '#cdd5df', fontSize: '14px', lineHeight: 1.6 }}>
                Are you sure you want to delete <strong style={{ color: '#f2f5f8' }}>{deleteConfirm.name}</strong>?
                This action cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className={mergeTW(buttonVariants.secondary)}
                style={{ flex: 1 }}
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                style={{ flex: 1, background: '#dc3545', color: '#fff', border: 0, borderRadius: '10px', padding: '10px 16px', fontWeight: 650, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await deleteProject(deleteConfirm.id);
                    await ctx.reload();
                    setDeleteConfirm(null);
                  } catch (e) {
                    toast('error', e instanceof Error ? e.message : 'Failed to delete');
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
