import { useState, useEffect } from 'react';
import type { AppContextType } from '../App';

interface Props { ctx: AppContextType }

export default function TaskDetail({ ctx }: Props) {
  const project = ctx.currentProject();
  const requirement = ctx.currentRequirement();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('low');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [promptText, setPromptText] = useState('');
  const [generating] = useState(false);
  const [progress] = useState(0);

  useEffect(() => {
    if (requirement) {
      setTitle(requirement.title || '');
      setPriority(requirement.priority || 'low');
      setPromptText(requirement.prompt || '');
    }
  }, [requirement]);

  const iframeSrc = project && requirement
    ? `/apps/requirement-editor/?embed=1&project=${project.id}&requirement=${requirement.id}&title=${encodeURIComponent(requirement.title || '')}&description=${encodeURIComponent(requirement.description || '')}`
    : '';

  return (
    <section id="taskView" className="view activeView">
      <div className="viewHead">
        <div>
          <p className="breadcrumb">Project board / Requirement</p>
          <h2>Task Detail</h2>
          <p className="muted">Edit the selected requirement and generate a controlled AI agent prompt.</p>
        </div>
        <div className="buttonRow">
          <button disabled={generating}>Generate Prompt</button>
          <button className="secondary">Copy</button>
        </div>
      </div>
      <div className="taskSplit">
        <section className="panel taskDetailPanel">
          <div className="panelHead">
            <h2>Requirement</h2>
            <button className="secondary">Save</button>
          </div>
          <div className="formStack taskMetaForm">
            <input
              placeholder="Requirement title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <div className="priorityChoices">
              {['no_priority', 'low', 'medium', 'high', 'urgent'].map(p => (
                <label key={p}>
                  <input
                    type="radio"
                    name="taskPriority"
                    value={p}
                    checked={priority === p}
                    onChange={() => setPriority(p)}
                  />
                  {p === 'no_priority' ? 'No priority' : p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
            <select>
              <option>Unassigned</option>
            </select>
          </div>
          {iframeSrc && (
            <iframe
              className="requirementEditorFrame"
              title="Requirement editor"
              src={iframeSrc}
            />
          )}
        </section>
        <section className="panel promptPanel">
          <div className="panelHead">
            <h2>Prompt</h2>
            <p className="muted"></p>
          </div>
          <div className="llmForm">
            <label>
              OpenCode API Key
              <input
                type="password"
                placeholder="opencode_..."
                value={llmApiKey}
                onChange={e => setLlmApiKey(e.target.value)}
              />
            </label>
            <button className="secondary" type="button">Test</button>
            <button className="secondary" type="button">Save</button>
          </div>
          <p className="llmTestStatus muted">LLM config not tested</p>
          {generating && (
            <div className="promptProgress">
              <div className="progressMeta">
                <span>Generating with OpenCode</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progressTrack">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <div className={`segments ${!promptText ? 'empty' : ''}`}>
            {promptText || 'No prompt generated'}
          </div>
        </section>
      </div>
    </section>
  );
}
