import { useState } from 'react';
import type { AppContextType } from '../App';

interface Props { ctx: AppContextType }

interface Tool {
  name: string;
  icon: string;
  description: string;
  status: 'active' | 'configured' | 'available';
}

// Tools deployed in the Mutesolo stack
const tools: Tool[] = [
  {
    name: 'Discord',
    icon: '💬',
    description: 'Community monitoring via Discord Widget. Chromedp captures member list from the widget.',
    status: 'active',
  },
  {
    name: 'AI Agent (Tailscale)',
    icon: '🤖',
    description: 'Agent communication backbone via Tailscale. Requirements dispatched to agents through the private network.',
    status: 'active',
  },
  {
    name: 'LLM (DeepSeek)',
    icon: '🧠',
    description: 'Large Language Model via DeepSeek API. Drives prompt generation and AI agent reasoning.',
    status: 'active',
  },
  {
    name: 'MinIO',
    icon: '🪣',
    description: 'Local S3-compatible object storage at 127.0.0.1:9000. Holds project cover images with presigned URLs.',
    status: 'active',
  },
  {
    name: 'GitHub',
    icon: '🔀',
    description: 'Code repository integration target. Project artifacts and releases tracked via GitHub repo config.',
    status: 'configured',
  },
  {
    name: 'SearXNG',
    icon: '🔍',
    description: 'Self-hosted privacy-respecting metasearch engine at 127.0.0.1:8088. Powers web search capabilities.',
    status: 'active',
  },
  {
    name: 'Honcho',
    icon: '🧩',
    description: 'Memory backend at 127.0.0.1:8000. Stores conversation context and user profiles across sessions.',
    status: 'active',
  },
  {
    name: 'Chrome / Chromedp',
    icon: '🖥️',
    description: 'Headless browser automation. Captures Discord Widget screenshots and extracts member data.',
    status: 'active',
  },
  {
    name: 'ClawHub',
    icon: '🦾',
    description: 'Private ClawHub instance for AI agent skill distribution and management.',
    status: 'configured',
  },
];

const statusLabel: Record<string, string> = {
  active: 'Active',
  configured: 'Configured',
  available: 'Available',
};

const statusDot: Record<string, string> = {
  active: '#4dc89a',
  configured: '#5b8def',
  available: '#8b95a5',
};

export default function Runtimes({ ctx: _ctx }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section id="runtimesView" className="view activeView">
      <div className="viewHead">
        <div>
          <h2>Plugin Runtimes</h2>
          <p className="muted">Tools and services deployed in the Mutesolo stack. Select a runtime to view its configuration.</p>
        </div>
      </div>

      <div className="runtimeGrid">
        {tools.map(tool => {
          const isSelected = selected === tool.name;
          return (
            <button
              key={tool.name}
              type="button"
              className={`runtimeCard${isSelected ? ' isSelected' : ''}`}
              onClick={() => setSelected(tool.name)}
            >
              <div className="runtimeCardTop">
                <div className="runtimeIcon">{tool.icon}</div>
                <div className="runtimeHeaderBody">
                  <div className="runtimeHeaderLine">
                    <strong className="runtimeName">{tool.name}</strong>
                    <span className="runtimeState">
                      <span className="runtimeStateDot" style={{ backgroundColor: statusDot[tool.status] }} />
                      {statusLabel[tool.status]}
                    </span>
                  </div>
                  <p className="runtimeDesc">{tool.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
