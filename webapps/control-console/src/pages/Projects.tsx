import { useState } from 'react';
import type { AppContextType } from '../App';
import { createProject } from '../api/projects';

interface Props { ctx: AppContextType }

export default function Projects({ ctx }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState('');
  const [docs, setDocs] = useState('');

  const handleCreate = async () => {
    try {
      const project = await createProject({ name, description, plan, docs });
      ctx.selectProject(project.id);
      ctx.setView('boardView');
      await ctx.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <section id="projectsView" className="view activeView">
      <div className="viewHead">
        <div>
          <h2>Project List</h2>
          <p className="muted">Create a project, then enter its board to coordinate requirements.</p>
        </div>
        <button onClick={handleCreate}>Create Project</button>
      </div>
      <div className="panel">
        <div className="formGrid">
          <input placeholder="Project name" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
          <textarea placeholder="Planning map" value={plan} onChange={e => setPlan(e.target.value)} />
          <textarea placeholder="Requirement document" value={docs} onChange={e => setDocs(e.target.value)} />
        </div>
      </div>
      <div className={`cardsGrid ${ctx.state?.projects.length === 0 ? 'empty' : ''}`}>
        {ctx.state?.projects.length === 0
          ? 'No projects yet'
          : ctx.state?.projects.map(project => (
              <button
                key={project.id}
                className="card"
                onClick={() => {
                  ctx.selectProject(project.id);
                  ctx.setView('boardView');
                }}
              >
                <strong>{project.name}</strong>
                <span>{project.description || ''}</span>
                <p className="muted">{(project.requirements || []).length} requirement point(s)</p>
              </button>
            ))
        }
      </div>
    </section>
  );
}
