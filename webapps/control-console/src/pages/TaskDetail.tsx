import { useState, useEffect, useRef, useMemo } from 'react';
import type { AppContextType } from '../App';
import { updateRequirement } from '../api/projects';
import { fetchAgents } from '../api/agents';
import { api } from '../api/client';
import { buttonVariants } from '../variants';
import mergeTW from '../utils/mergeTW';
import { toast } from '../components/toastStore';

interface Props { ctx: AppContextType }

type EditorContext = {
  schemaVersion: number;
  source: string;
  blocks: unknown[];
  plainText: string;
  tencentDocs: unknown[];
  attachments: unknown[];
} | null;

// Read editor context from localStorage (shared origin with iframe)
function readEditorContext(projectId: string, requirementId: string): EditorContext {
  try {
    const key = `Mutesolo.requirementEditor.${projectId}.${requirementId}.v1.context`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as EditorContext;
  } catch {
    return null;
  }
}

// Fallback: request editor context via postMessage when localStorage is empty
// (e.g. iframe loaded but user hasn't edited yet → onChange never fired → no draft persisted)
function requestEditorContextViaPostMessage(
  iframe: HTMLIFrameElement,
  timeoutMs = 3000
): Promise<EditorContext> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'Mutesolo.requirementEditor.context') return;
      if (event.data?.requestId !== requestId) return;
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      resolve((event.data.context as EditorContext) ?? null);
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Editor postMessage timeout'));
    }, timeoutMs);
    window.addEventListener('message', handler);
    iframe.contentWindow?.postMessage(
      { type: 'Mutesolo.requirementEditor.requestContext', requestId },
      window.location.origin
    );
  });
}

async function getEditorContext(
  projectId: string,
  requirementId: string,
  iframe: HTMLIFrameElement | null
): Promise<EditorContext> {
  // Primary: read from localStorage (fast, synchronous, works for most cases)
  const cached = readEditorContext(projectId, requirementId);
  if (cached) return cached;

  // Fallback: request via postMessage (iframe may not have fired onChange yet)
  if (iframe?.contentWindow) {
    try {
      return await requestEditorContextViaPostMessage(iframe);
    } catch {
      // iframe not loaded or timed out — proceed without editor content
    }
  }

  return null;
}

// Simple markdown → HTML
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="md-code-block"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^#### (.+)$/gm, '<h5 class="md-h5">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    // Process lists paragraph-by-paragraph to avoid merging separate groups
    .replace(/((?:<li class="md-li">[\s\S]*?<\/li>\s*)+)/g, (match) => {
      // Wrap each paragraph's list items in <ul>, stripping trailing breaks between paras
      const items = match.replace(/<br\/>/g, '');
      return '<ul class="md-ul">' + items + '</ul>';
    })
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/<\/(h[2-5])><br\/><br\/>/g, '</$1>');
  return html;
}

export default function TaskDetail({ ctx }: Props) {
  const project = ctx.currentProject();
  const requirement = ctx.currentRequirement();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('low');
  const [assignedMember, setAssignedMember] = useState('');
  const [promptText, setPromptText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [agentMembers, setAgentMembers] = useState<Array<{ id?: string; username: string; status: string }>>([]);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (requirement) {
      setTitle(requirement.title || '');
      setPriority(requirement.priority || 'low');
      const memberId = requirement.assigned_member_id || '';
      const memberName = requirement.assigned_member || '';
      setAssignedMember(memberName ? `${memberName}|${memberId}` : '');
      setPromptText(requirement.prompt || '');
    }
  }, [requirement]);

  useEffect(() => {
    fetchAgents().then(data => {
      setAgentMembers(data);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!project || !requirement) return;
    setSaving(true);
    try {
      // Read editor content: localStorage primary, postMessage fallback
      const editorCtx = await getEditorContext(project.id, requirement.id, iframeRef.current);
      // Parse "username|id" from select value
      const [memberName, memberId] = assignedMember.split('|');
      const payload: Record<string, unknown> = {
        title,
        priority,
        assigned_member: memberName || '',
        assigned_member_id: memberId || '',
      };
      if (editorCtx) {
        payload.editor_content = editorCtx.blocks;
        payload.attachments = editorCtx.attachments;
      }
      await updateRequirement(project.id, requirement.id, payload);
      toast('success', 'Requirement saved');
      await ctx.reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!project || !requirement) return;
    setGenerating(true);
    setPromptText('');
    try {
      // Read editor content: localStorage primary, postMessage fallback
      const editorCtx = await getEditorContext(project.id, requirement.id, iframeRef.current);
      const res = await api<{ prompt: string }>('/api/generate-prompt', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          requirementId: requirement.id,
          plainText: editorCtx?.plainText || requirement.description || requirement.title || '',
          blocks: editorCtx?.blocks || [],
          tencentDocs: editorCtx?.tencentDocs || [],
          attachments: editorCtx?.attachments || [],
        }),
      });
      setPromptText(res.prompt || '');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to generate prompt');
    } finally {
      setGenerating(false);
    }
  };

  const formattedPrompt = useMemo(() => promptText ? renderMarkdown(promptText) : '', [promptText]);

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
          <button
            className={mergeTW(buttonVariants.default)}
            disabled={generating}
            onClick={handleGenerate}
          >
            {generating ? 'Generating...' : 'Generate Prompt'}
          </button>
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
            <div className="inputWithCounter">
              <input placeholder="Requirement title" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
              <span className="charCounter">{title.length}/100</span>
            </div>
            <div className="priorityChoices">
              {['no_priority', 'low', 'medium', 'high', 'urgent'].map(p => (
                <label key={p}>
                  <input type="radio" name="taskPriority" value={p} checked={priority === p} onChange={() => setPriority(p)} />
                  {p === 'no_priority' ? 'No priority' : p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
            <select className="select-native" value={assignedMember} onChange={e => setAssignedMember(e.target.value)}>
              <option value="">Unassigned</option>
              {agentMembers.map(m => (
                <option key={m.username} value={`${m.username}|${m.id || ''}`}>{m.username}</option>
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
          </div>
          {generating && (
            <div className="promptProgress">
              <span className="progressMeta">Generating with Ark AI</span>
              <div className="progressTrack"><span className="animate-pulse" style={{ width: '100%' }} /></div>
            </div>
          )}
          <div className={`segments ${!promptText ? 'empty' : ''}`}>
            {generating ? 'Generating...' :
              promptText ? <div className="md-content" dangerouslySetInnerHTML={{ __html: formattedPrompt }} /> :
                'Click Generate Prompt to start'}
          </div>
        </section>
      </div>
    </section>
  );
}
