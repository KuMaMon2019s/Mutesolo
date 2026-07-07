import { useState } from 'react';
import type { AppContextType } from '../App';
import { fetchClawHubSkills, fetchClawHubSkillDetail, installSkill } from '../api/projects';

interface Props { ctx: AppContextType }

interface Skill {
  id: string;
  name?: string;
  capabilities?: string[];
  version?: string;
  description?: string;
  runtime?: string;
  entrypoint?: string;
}

export default function Skills({ ctx: _ctx }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [agentId, setAgentId] = useState('');

  const handleLoad = async () => {
    try {
      const data = await fetchClawHubSkills();
      setSkills(data);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleSelect = async (skillId: string) => {
    try {
      const detail = await fetchClawHubSkillDetail(skillId);
      setSelectedSkill(detail);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleInstall = async () => {
    if (!selectedSkill) return;
    try {
      const result = await installSkill(selectedSkill.id, agentId);
      alert(result.result.sent ? 'Install instruction sent to AI Agent' : result.result.message || 'Instruction not sent');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <section id="skillsView" className="view activeView">
      <div className="viewHead">
        <div>
          <h2>Private ClawHub Skills</h2>
          <p className="muted">Connect to your private ClawHub, inspect skills, then ask a selected AI agent to install one through Tailscale.</p>
        </div>
        <button onClick={handleLoad}>Load Skills</button>
      </div>
      <div className="split">
        <div className={`cardsGrid ${skills.length === 0 ? 'empty' : ''}`}>
          {skills.length === 0
            ? 'No skills loaded'
            : skills.map(skill => (
                <button key={skill.id} className="card" onClick={() => handleSelect(skill.id)}>
                  <strong>{skill.name || skill.id}</strong>
                  <span>{(skill.capabilities || []).join(', ')}</span>
                  <p className="muted">{skill.version || ''}</p>
                </button>
              ))
          }
        </div>
        <div className="panel detailPanel">
          <h2>Skill Detail</h2>
          {selectedSkill ? (
            <div>
              <strong>{selectedSkill.name || selectedSkill.id}</strong>
              <p>{selectedSkill.description || 'No description'}</p>
              <p className="muted">{(selectedSkill.capabilities || []).join(', ')}</p>
              <p className="muted">{selectedSkill.runtime} {selectedSkill.entrypoint}</p>
            </div>
          ) : (
            <div className="empty">Select a skill</div>
          )}
          <input
            placeholder="Target AI agent id (optional)"
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
          />
          <button className="wide" onClick={handleInstall}>Install on AI Agent</button>
        </div>
      </div>
    </section>
  );
}
