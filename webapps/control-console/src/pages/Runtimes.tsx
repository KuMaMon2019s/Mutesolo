import { useState } from 'react';
import type { AppContextType } from '../App';
import { fetchPluginRuntimes } from '../api/projects';

interface Props { ctx: AppContextType }

interface Runtime {
  name: string;
  extensions?: string[];
  command_hint?: string;
}

export default function Runtimes({ ctx: _ctx }: Props) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);

  const handleLoad = async () => {
    try {
      const data = await fetchPluginRuntimes();
      setRuntimes(data);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    }
  };

  // Auto-load on mount
  useState(() => { handleLoad(); });

  return (
    <section id="runtimesView" className="view activeView">
      <div className="viewHead">
        <div>
          <h2>Plugin Runtimes</h2>
          <p className="muted">Compatibility descriptors only. Mutesolo does not execute arbitrary plugin code.</p>
        </div>
      </div>
      <div className={`cardsGrid ${runtimes.length === 0 ? 'empty' : ''}`}>
        {runtimes.length === 0
          ? 'No runtimes loaded'
          : runtimes.map(rt => (
              <div key={rt.name} className="card">
                <strong>{rt.name}</strong>
                <span>{(rt.extensions || []).join(', ')}</span>
                <p className="muted">{rt.command_hint || ''}</p>
              </div>
            ))
        }
      </div>
    </section>
  );
}
