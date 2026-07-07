import { useState, type JSX } from 'react';
import Sidebar, { type Page } from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Connections from './pages/Connections';
import Agents from './pages/Agents';
import Board from './pages/Board';

type Route =
  | { page: 'dashboard' }
  | { page: 'projects' }
  | { page: 'connections' }
  | { page: 'agents' }
  | { page: 'board'; projectId: string };

const simplePages: Record<'dashboard' | 'connections' | 'agents', () => JSX.Element> = {
  dashboard: Dashboard,
  connections: Connections,
  agents: Agents,
};

export default function App() {
  const [route, setRoute] = useState<Route>({ page: 'projects' });
  const [dark, setDark] = useState(true);

  const sidebarPage: Page = route.page === 'board' ? 'projects' : route.page;

  const renderPage = () => {
    if (route.page === 'board') {
      return (
        <Board
          projectId={route.projectId}
          onBack={() => setRoute({ page: 'projects' })}
        />
      );
    }
    if (route.page === 'projects') {
      return (
        <Projects onOpenBoard={(projectId) => setRoute({ page: 'board', projectId })} />
      );
    }
    const Component = simplePages[route.page];
    return <Component />;
  };

  return (
    <div className={dark ? 'dark' : ''}>
      <div className={`min-h-screen ${dark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
        <Sidebar
          current={sidebarPage}
          onNavigate={(page) => setRoute({ page })}
          dark={dark}
          onToggleDark={() => setDark(!dark)}
        />
        <main className="ml-[64px] p-8 min-h-screen">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
