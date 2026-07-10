import type { AppContextType, ViewId } from '../App';
import type { Project } from '../api/state';

interface ModuleSidebarProps {
  ctx: AppContextType;
  projects: Project[];
}

export default function ModuleSidebar({ ctx, projects }: ModuleSidebarProps) {
  const normalizedBranches = (project: Project) =>
    project.branches?.length ? project.branches : [{ id: 'main', name: 'Main', created_at: '' }];

  const handleProjectClick = (project: Project) => {
    ctx.selectProject(project.id);
    ctx.setBoardTab('kanban');
    ctx.setView('boardView' as ViewId);
  };

  const handleBranchClick = (projectId: string, branchId: string) => {
    ctx.selectProject(projectId);
    ctx.selectBranch(branchId);
    ctx.setView('boardView' as ViewId);
  };

  const handleAllProjects = () => {
    ctx.selectProject('');
    ctx.selectBranch('');
    ctx.selectRequirement('');
    ctx.clearSelection();
    ctx.setView('projectsView');
  };

  return (
    <aside className="moduleSidebar">
      <h2>Mutesolo</h2>
      <input className="searchInput" placeholder="Search..." readOnly />
      <nav className="sideNav">
        <button
          className={`sideLink ${!ctx.selectedProject ? 'active' : ''}`}
          onClick={handleAllProjects}
        >
          All project
        </button>
      </nav>
      <div className="sideSection">
        <div className="sideTitle">Your Projects</div>
        {projects.length === 0 ? (
          <div className="sideProjectLinks empty">No projects</div>
        ) : (
          <div className="sideProjectLinks">
            {projects.map(project => (
              <div key={project.id} className="projectTree">
                <button
                  className={`sideLink projectLink ${project.id === ctx.selectedProject ? 'active' : ''}`}
                  onClick={() => handleProjectClick(project)}
                >
                  {project.name}
                </button>
                {project.id === ctx.selectedProject && (
                  <div className="branchTree">
                    {normalizedBranches(project).map(branch => (
                      <button
                        key={branch.id}
                        className={`sideLink branchLink ${branch.id === ctx.selectedBranch ? 'active' : ''}`}
                        onClick={() => handleBranchClick(project.id, branch.id)}
                      >
                        {branch.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
