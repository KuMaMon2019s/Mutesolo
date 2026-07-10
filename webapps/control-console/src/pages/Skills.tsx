import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
import type { AppContextType } from '../App';
import {
  fetchClawHubSkills,
  fetchClawHubSkillDetail,
} from '../api/projects';
import { fetchConfig, type Config } from '../api/config';
import { PuzzlePieceIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

interface Props { ctx: AppContextType }

interface SkillFile {
  path: string;
  content?: string;
}

interface Skill {
  id: string;
  name?: string;
  capabilities?: string[];
  version?: string;
  description?: string;
  runtime?: string;
  entrypoint?: string;
  tags?: Record<string, string>;
  stats?: {
    comments: number;
    downloads: number;
    installsAllTime: number;
    installsCurrent: number;
    stars: number;
    versions: number;
  };
  created_at?: number;
  updated_at?: number;
  markdown?: string;
  files?: SkillFile[];
}

const SKILLS_CACHE_KEY = 'mutesolo.console.skills-cache.v1';
const SKILLS_CACHE_TTL_MS = 15 * 60 * 1000;

type SkillsCache = {
  ts: number;
  skills: Skill[];
  selectedSkillId?: string;
  selectedSkill?: Skill;
  detailTab?: 'skillmd' | 'files' | 'versions';
  selectedFilePath?: string;
};

function loadSkillsCache(): SkillsCache | null {
  try {
    const raw = localStorage.getItem(SKILLS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SkillsCache;
    if (!parsed?.ts || Date.now() - parsed.ts > SKILLS_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSkillsCache(payload: Omit<SkillsCache, 'ts'> & { selectedSkill?: Skill | null }) {
  try {
    localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify({ ts: Date.now(), ...payload }));
  } catch {
    // ignore storage failures
  }
}

function timeAgo(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 0) return 'just now';
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function skillLabel(skill?: Skill | null) {
  if (!skill) return '';
  return skill.name || skill.id;
}

function renderMarkdown(md: string) {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactElement[] = [];
  let key = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      nodes.push(<div key={`sp-${key++}`} className="skillsMdSpacer" />);
      continue;
    }
    if (line === '---') {
      nodes.push(<hr key={`hr-${key++}`} className="skillsMdRule" />);
      continue;
    }
    const image = line.match(/^!\[(.*?)\]\((.+?)\)$/);
    if (image) {
      nodes.push(
        <figure key={`img-${key++}`} className="skillsMdFigure">
          <img src={image[2]} alt={image[1] || ''} className="skillsMdImage" />
          {image[1] ? <figcaption>{image[1]}</figcaption> : null}
        </figure>
      );
      continue;
    }
    if (/^###\s+/.test(line)) {
      nodes.push(<h3 key={`h3-${key++}`} className="skillsMdH3">{line.replace(/^###\s+/, '')}</h3>);
      continue;
    }
    if (/^##\s+/.test(line)) {
      nodes.push(<h2 key={`h2-${key++}`} className="skillsMdH2">{line.replace(/^##\s+/, '')}</h2>);
      continue;
    }
    if (/^#\s+/.test(line)) {
      nodes.push(<h1 key={`h1-${key++}`} className="skillsMdH1">{line.replace(/^#\s+/, '')}</h1>);
      continue;
    }
    if (/^-\s+/.test(line)) {
      nodes.push(<div key={`li-${key++}`} className="skillsMdLi">• {line.replace(/^-\s+/, '')}</div>);
      continue;
    }
    if (/^```/.test(line)) {
      nodes.push(<pre key={`code-${key++}`} className="skillsMdCodeFence">{line}</pre>);
      continue;
    }
    nodes.push(<p key={`p-${key++}`} className="skillsMdP">{line}</p>);
  }

  return <div className="skillsMdContent">{nodes}</div>;
}

export default function Skills({ ctx }: Props) {
  const cached = loadSkillsCache();
  const [skills, setSkills] = useState<Skill[]>(cached?.skills ?? []);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [config, setConfig] = useState<Config | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState(cached?.selectedSkillId ?? '');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(cached?.selectedSkill ?? null);
  const [detailTab, setDetailTab] = useState<'skillmd' | 'files' | 'versions'>(cached?.detailTab ?? 'skillmd');
  const [selectedFilePath, setSelectedFilePath] = useState(cached?.selectedFilePath ?? '');
  const isDetailView = ctx.currentView === 'skillDetailView';

  useEffect(() => {
    fetchConfig().then(c => setConfig(c)).catch(() => {});
  }, []);

  useEffect(() => {
    saveSkillsCache({
      skills,
      selectedSkillId,
      selectedSkill: selectedSkill ?? undefined,
      detailTab,
      selectedFilePath,
    });
  }, [skills, selectedSkillId, selectedSkill, detailTab, selectedFilePath]);

  useEffect(() => {
    if (!selectedSkill?.files?.length) {
      if (selectedSkill?.markdown) setSelectedFilePath('SKILL.md');
      return;
    }
    const exists = selectedSkill.files.some(f => f.path === selectedFilePath);
    if (!exists) setSelectedFilePath(selectedSkill.files[0].path);
  }, [selectedSkill, selectedFilePath]);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchClawHubSkills();
      setSkills(data);
      if (data.length === 0 && config && !config.clawhub_base_url) {
        setError('Please configure ClawHub URL and API Key in Connections first.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [config]);

  const openSkillDetail = useCallback(async (skill: Skill) => {
    setSelectedSkillId(skill.id);
    setSelectedSkill(skill);
    setDetailError('');
    setDetailLoading(true);
    setDetailTab('skillmd');
    setSelectedFilePath('SKILL.md');
    ctx.setView('skillDetailView');
    try {
      const detail = await fetchClawHubSkillDetail(skill.id);
      const merged = {
        ...skill,
        ...detail,
      };
      setSelectedSkill(merged);
      setSelectedFilePath(merged.files?.[0]?.path || 'SKILL.md');
      saveSkillsCache({
        skills,
        selectedSkillId: skill.id,
        selectedSkill: merged,
        detailTab: 'skillmd',
        selectedFilePath: merged.files?.[0]?.path || 'SKILL.md',
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load skill detail');
    } finally {
      setDetailLoading(false);
    }
  }, [ctx, skills]);

  useEffect(() => {
    if (!isDetailView) return;
    if (!selectedSkillId || selectedSkill) return;
    const cachedSkill = skills.find(s => s.id === selectedSkillId);
    if (cachedSkill) {
      setSelectedSkill(cachedSkill);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchClawHubSkillDetail(selectedSkillId)
      .then(detail => {
        if (cancelled) return;
        setSelectedSkill(detail);
        setSelectedFilePath(detail.files?.[0]?.path || 'SKILL.md');
      })
      .catch(e => {
        if (cancelled) return;
        setDetailError(e instanceof Error ? e.message : 'Failed to load skill detail');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [isDetailView, selectedSkill, selectedSkillId, skills]);

  const needsConfig = config && !config.clawhub_base_url;
  const currentVersion = selectedSkill?.tags?.latest || selectedSkill?.version || '1.0.0';
  const skillCommand = selectedSkill ? `openclaw skills install ${selectedSkill.id}` : '';
  const skillFiles = selectedSkill?.files && selectedSkill.files.length > 0
    ? selectedSkill.files
    : selectedSkill
      ? [{ path: 'SKILL.md', content: selectedSkill.markdown || selectedSkill.description || '' }]
      : [];
  const activeFile = skillFiles.find(f => f.path === selectedFilePath) || skillFiles[0] || null;

  const markdownBody = selectedSkill?.markdown || selectedSkill?.description || '';
  const selectedFileContent = activeFile?.content || '';

  const renderSkillMdTab = () => {
    return (
      <div className="skillsTabPanel blueFrame">
        {markdownBody ? renderMarkdown(markdownBody) : <div className="skillsEmptyState">No markdown content from ClawHub.</div>}
      </div>
    );
  };

  const renderFilesTab = () => {
    return (
      <div className="skillsFilesLayout blueFrame">
        <aside className="skillsFilesNav">
          <div className="skillsFilesHeading">Files</div>
          <div className="skillsFilesCount">{skillFiles.length} total</div>
          <div className="skillsFilesList">
            {skillFiles.map(file => (
              <button
                key={file.path}
                type="button"
                className={`skillsFileItem${activeFile?.path === file.path ? ' isActive' : ''}`}
                onClick={() => setSelectedFilePath(file.path)}
              >
                <span className="skillsFileName">{file.path.split('/').pop()}</span>
                <span className="skillsFilePath">{file.path}</span>
              </button>
            ))}
          </div>
        </aside>
        <div className="skillsFileReader">
          <div className="skillsFileReaderHeader">
            <strong>{activeFile?.path || 'File'}</strong>
            <span>{selectedFileContent ? `${selectedFileContent.length} chars` : '0 chars'}</span>
          </div>
          <pre className="skillsFileContent">{selectedFileContent || 'Select a file to read its content.'}</pre>
        </div>
      </div>
    );
  };

  const renderVersionsTab = () => {
    return (
      <div className="skillsVersionsWrap">
        <div className="skillsVersionsIntro">
          Download older releases or scan the changelog.
        </div>
        <div className="skillsVersionList">
          <div className="skillsVersionRow">
            <div>
              <div className="skillsVersionLabel">{`v${selectedSkill?.version || currentVersion}`} · {selectedSkill?.updated_at ? timeAgo(selectedSkill.updated_at) : 'latest'}</div>
              <div className="skillsVersionSummary">{selectedSkill?.description || 'Initial publish'}</div>
            </div>
          </div>
          <div className="skillsVersionRow">
            <div>
              <div className="skillsVersionLabel">Initial publish</div>
              <div className="skillsVersionSummary">Current version is the only visible release in this view.</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isDetailView) {
    return (
      <section id="skillsView" className="view activeView">
        <div className="skillsDetailPage">
          <div className="skillsDetailShell">
            <div className="skillsDetailHero blueFrame">
              <div className="sectionHeaderWithNav">
                <div className="sectionHeaderMain">
                  <div className="skillsDetailBreadcrumb">skills / kumamon2019s / {selectedSkill?.id || 'skill'}</div>
                  <h1 className="skillsDetailPageTitle">{skillLabel(selectedSkill) || 'Private ClawHub Skills'}</h1>
                  <p className="skillsDetailDescriptionHeader">
                    {selectedSkill?.description || 'Browse and install skills from your private ClawHub instance.'}
                  </p>
                </div>
                <span className="skillsDetailCategory">{selectedSkill?.tags?.category || 'OTHER'}</span>
              </div>
            </div>

            {detailError && <div className="skillsInlineError">{detailError}</div>}
            {detailLoading && !selectedSkill && (
              <div className="skillsLoadingBox">
                <div className="skillsSpinner">
                  <div className="skillsSpinnerDot" />
                  <div className="skillsSpinnerDot" />
                  <div className="skillsSpinnerDot" />
                </div>
              </div>
            )}

            {selectedSkill && (
              <>
                <div className="skillsDetailControlCard blueFrame">
                  <div className="skillsInstallHeader">
                    <div className="skillsSectionTitle">Install</div>
                  </div>
                  <div className="skillsCommandBlock">
                    <code>{skillCommand}</code>
                    <button
                      type="button"
                      className="skillsCopyOnlyButton"
                      title="Copy install command"
                      onClick={() => navigator.clipboard.writeText(skillCommand).catch(() => {})}
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="skillsTabsRow">
                    <button
                      className={`skillsTabButton${detailTab === 'skillmd' ? ' isActive' : ''}`}
                      onClick={() => setDetailTab('skillmd')}
                      type="button"
                    >
                      SKILL.md
                    </button>
                    <button
                      className={`skillsTabButton${detailTab === 'files' ? ' isActive' : ''}`}
                      onClick={() => setDetailTab('files')}
                      type="button"
                    >
                      Files
                    </button>
                    <button
                      className={`skillsTabButton${detailTab === 'versions' ? ' isActive' : ''}`}
                      onClick={() => setDetailTab('versions')}
                      type="button"
                    >
                      Versions
                    </button>
                  </div>
                </div>

                {detailLoading ? (
                  <div className="skillsLoadingBox">
                    <div className="skillsSpinner">
                      <div className="skillsSpinnerDot" />
                      <div className="skillsSpinnerDot" />
                      <div className="skillsSpinnerDot" />
                    </div>
                  </div>
                ) : (
                  <>
                    {detailTab === 'skillmd' && renderSkillMdTab()}
                    {detailTab === 'files' && renderFilesTab()}
                    {detailTab === 'versions' && renderVersionsTab()}
                  </>
                )}
              </>
            )}

            {!selectedSkill && !detailLoading && !detailError && (
              <div className="skillsLoadingBox">No skill selected.</div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="skillsView" className="view activeView">
      <div className="max-w-[1040px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-[#f2f5f8]">Private ClawHub Skills</h1>
            <p className="muted">
              Browse and install skills from your private ClawHub instance.
            </p>
          </div>
          <button
            onClick={handleLoad}
            disabled={loading}
            className="rounded-full bg-[#5b8def] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4f82d8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="skillsSpinner">
                <span className="skillsSpinnerDot" />
                <span className="skillsSpinnerDot" />
                <span className="skillsSpinnerDot" />
                <span>Loading...</span>
              </span>
            ) : (
              'Load Skills'
            )}
          </button>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
            {error}
          </div>
        )}

        {needsConfig && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-yellow-900/20 border border-yellow-800/50 text-yellow-400 text-sm flex items-center gap-3">
            <PuzzlePieceIcon className="w-5 h-5 flex-shrink-0" />
            <span>
              ClawHub URL not configured. Go to <strong>Connections</strong> to set your private ClawHub instance URL and API Key.
            </span>
          </div>
        )}

        {skills.length === 0 && !loading && !error && !needsConfig && (
          <div className="px-4 py-12 text-center text-[#8b95a5] text-sm border border-dashed border-white/10 rounded-xl">
            Click <strong>"Load Skills"</strong> to fetch skills from your ClawHub instance.
          </div>
        )}

        <div className="masonryGrid">
          {skills.map(skill => {
            const isSelected = selectedSkillId === skill.id;
            const latest = skill.tags?.latest || skill.version || '1.0.0';
            const timeLabel = skill.created_at ? timeAgo(skill.created_at) : '—';
            return (
              <button
                key={skill.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`toolsCard toolsMasonryCard text-left${isSelected ? ' isSelected' : ''}`}
                onClick={() => openSkillDetail(skill)}
              >
                <div className="toolsCardBody toolsSketchCard">
                  <div className="toolsSketchTopRow">
                    <span className="toolsSketchLatest">latest: {latest}</span>
                    <span className="toolsSketchVersion">v{skill.version || latest}</span>
                  </div>

                  <div className="toolsSketchTitleRow">
                    <strong className="toolsCardName">{skill.name || skill.id}</strong>
                  </div>

                  <div className="toolsSketchDivider" />

                  <p className="toolsCardDesc toolsSketchSummary">
                    {skill.description || 'No description'}
                  </p>

                  <div className="toolsSketchFooter">
                    <span className="toolsSketchTime">time {timeLabel}</span>
                    <span className="toolsSketchMore">+ more</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
