import { useState, useEffect, useRef } from 'react';
import type { AppContextType } from '../App';
import { updateRequirement, fetchAIAgentScreenshotMembers } from '../api/projects';
import { buttonVariants } from '../variants';
import mergeTW from '../utils/mergeTW';
import { toast } from '../components/toastStore';

interface Props { ctx: AppContextType }

export default function TaskDetail({ ctx }: Props) {
  const project = ctx.currentProject();
  const requirement = ctx.currentRequirement();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('low');
  const [assignedMember, setAssignedMember] = useState('');
  const [promptText, setPromptText] = useState('');
  const [generating] = useState(false);
  const [progress] = useState(0);
  const [agentMembers, setAgentMembers] = useState<Array<{ username: string; status: string }>>([]);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (requirement) {
      setTitle(requirement.title || '');
      setPriority(requirement.priority || 'low');
      setAssignedMember(requirement.assigned_member || '');
      setPromptText(requirement.prompt || '');
    }
  }, [requirement]);

  useEffect(() => {
    fetchAIAgentScreenshotMembers().then(data => {
      setAgentMembers((data.members || []).filter(m => m.username.toLowerCase() !== 'doraemon'));
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!project || !requirement) return;
    setSaving(true);
    try {
      await updateRequirement(project.id, requirement.id, {
        title,
        priority,
        assigned_member: assignedMember,
      });
      toast('success', 'Requirement saved');
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const iframeSrc = project && requirement
    ? `/apps/requirement-editor/?embed=1&project=${project.id}&requirement=${requirement.id}&title=${encodeURIComponent(requirement.title || '')}&description=${encodeURIComponent(requirement.description || '')}`
    : '';

  return (
    <section id="taskView" className="view activeView">
      <div className="viewHead">
        <div className="flex items-center gap-3">
          <button
            onClick={() => ctx.setView('boardView')}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[#8b95a5] hover:text-white transition-colors"
            title="Back to Board"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <p className="breadcrumb">Project board / Requirement</p>
            <h2>Task Detail</h2>
            <p className="muted">Edit the selected requirement and generate a controlled AI agent prompt.</p>
          </div>
        </div>
        <div className="buttonRow">
          <button className={mergeTW(buttonVariants.default)} disabled={generating}>Generate Prompt</button>
          <button className={mergeTW(buttonVariants.secondary)} disabled={!promptText}>Copy</button>
        </div>
      </div>
      <div className="taskSplit">
        <section className="panel taskDetailPanel">
          <div className="panelHead">
            <h2>Requirement</h2>
            <button
              className={mergeTW(buttonVariants.secondary)}
              disabled={saving}
              onClick={handleSave}
            >{saving ? 'Saving...' : 'Save'}</button>
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
            <select className="select-native"
              value={assignedMember}
              onChange={e => setAssignedMember(e.target.value)}
            >
              <option value="">Unassigned</option>
              {agentMembers.map(m => (
                <option key={m.username} value={m.username}>{m.username}</option>
              ))}
            </select>
          </div>
          {iframeSrc && (
            <iframe
              ref={iframeRef}
              className="requirementEditorFrame"
              title="Requirement editor"
              src={iframeSrc}
              scrolling="auto"
            />
          )}
        </section>
        <section className="panel promptPanel">
          <div className="panelHead">
            <h2>Prompt</h2>
            <p className="muted"></p>
          </div>
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
