import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid';
import type { AppContextType } from '../App';
import { fetchGitHubRepos, fetchGitHubReleases, type GitHubRepo, type GitHubRelease } from '../api/github';
import { toast } from '../components/toastStore';

interface Props {
  ctx: AppContextType;
}

// Language colors for the dot indicator
const LANG_COLORS: Record<string, string> = {
  Go: '#00ADD8',
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Shell: '#89E051',
  Python: '#3572A5',
  Rust: '#DEA584',
  Java: '#B07219',
  Ruby: '#701516',
  C: '#555555',
  'C++': '#F34B7D',
  'C#': '#178600',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  PHP: '#4F5D95',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Vue: '#41B883',
  Dart: '#00B4AB',
};

function langColor(lang: string): string {
  return LANG_COLORS[lang] || '#8b95a5';
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} min${m > 1 ? 's' : ''} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} hour${h > 1 ? 's' : ''} ago`;
  }
  if (diff < 2592000) {
    const d = Math.floor(diff / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  if (diff < 31536000) {
    const m = Math.floor(diff / 2592000);
    return `${m} month${m > 1 ? 's' : ''} ago`;
  }
  const y = Math.floor(diff / 31536000);
  return `${y} year${y > 1 ? 's' : ''} ago`;
}

function RepoCard({
  repo,
  isExpanded,
  onToggle,
}: {
  repo: GitHubRepo;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [releases, setReleases] = useState<GitHubRelease[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    if (isExpanded) {
      onToggle();
      return;
    }
    onToggle();
    if (releases) return; // Already loaded

    setLoading(true);
    try {
      const [owner, name] = repo.full_name.split('/');
      const data = await fetchGitHubReleases(owner, name);
      setReleases(data.releases);
    } catch {
      toast('error', 'Failed to load releases');
    } finally {
      setLoading(false);
    }
  }, [isExpanded, releases, repo.full_name, onToggle]);

  return (
    <div className={`ghRepoCard ${isExpanded ? 'expanded' : ''}`}>
      {/* Card Body */}
      <div className="ghRepoBody">
        {/* Name + visibility badge */}
        <div className="ghRepoNameRow">
          <span className="ghRepoName">{repo.name}</span>
          <span className="ghRepoBadge">{repo.private ? 'Private' : 'Public'}</span>
        </div>

        {/* Fork badge */}
        {repo.fork && repo.parent_full_name && (
          <div className="ghRepoForkBadge">
            (forked) from {repo.parent_full_name}
          </div>
        )}

        {/* Description */}
        {repo.description && (
          <p className="ghRepoDesc">{repo.description}</p>
        )}

        {/* Divider */}
        <div className="ghRepoDivider" />

        {/* Stats row */}
        <div className="ghRepoStatsRow">
          <span className="ghRepoStat">
            {repo.language && (
              <>
                <span
                  className="ghRepoLangDot"
                  style={{ background: langColor(repo.language) }}
                />
                <span>{repo.language}</span>
              </>
            )}
          </span>

          {repo.license && (
            <span className="ghRepoStat">{repo.license}</span>
          )}

          {repo.stargazers_count > 0 && (
            <span className="ghRepoStat">★ {repo.stargazers_count}</span>
          )}

          {repo.forks_count > 0 && (
            <span className="ghRepoStat">⑂ {repo.forks_count}</span>
          )}

          <span className="ghRepoUpdated">
            Updated {relativeTime(repo.pushed_at)}
          </span>
        </div>

        {/* Changes button + Target link */}
        <div className="ghRepoActions">
          <button
            type="button"
            className="ghRepoChangesBtn"
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
          >
            {isExpanded
              ? <ChevronUpIcon className="w-4 h-4" />
              : <ChevronDownIcon className="w-4 h-4" />
            }
            changes
          </button>
          <a
            href={`https://github.com/${repo.full_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ghRepoTargetBtn"
            onClick={(e) => e.stopPropagation()}
            title="Open on GitHub"
          >
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            target
          </a>
        </div>
      </div>

      {/* Expanded commit overlay */}
      {isExpanded && (
        <div className="ghRepoCommitsOverlay">
          {loading ? (
            <div className="ghRepoCommitsLoading">Loading releases...</div>
          ) : releases && releases.length > 0 ? (
            <div className="ghRepoCommitsList">
              {releases.map((r) => (
                <a
                  key={r.tag_name}
                  href={r.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ghRepoReleaseItem"
                >
                  <span className="ghRepoReleaseTag">{r.tag_name}</span>
                  <span className="ghRepoReleaseName">{r.name}</span>
                  <span className="ghRepoCommitTime">{relativeTime(r.published_at)}</span>
                  {r.body && <span className="ghRepoReleaseBody">{r.body}</span>}
                </a>
              ))}
            </div>
          ) : (
            <div className="ghRepoCommitsEmpty">No releases yet</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GitHubRepos(_props: Props) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRepoId, setExpandedRepoId] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (user: string) => {
    setLoading(true);
    try {
      const data = await fetchGitHubRepos(user || undefined);
      setRepos(data);
      setSearched(true);
    } catch {
      toast('error', 'Failed to load GitHub repos');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount (no network in dev, will show empty gracefully)
  useEffect(() => {
    load('');
  }, [load]);

  const handleSearch = () => {
    const user = username.trim();
    if (!user) return;
    setExpandedRepoId(null);
    load(user);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="ghReposPage">
      {/* Header */}
      <div className="ghReposHeader">
        <h1 className="ghReposTitle">GitHub Repositories</h1>
        <div className="ghReposSearchRow">
          <input
            ref={inputRef}
            type="text"
            className="ghReposSearchInput"
            placeholder="GitHub username (default: KuMaMon2019s)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="secondary" onClick={handleSearch}>
            Search
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="ghReposLoading">
          <p>Loading repositories...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && repos.length === 0 && (
        <div className="ghReposEmpty">
          <p>No repositories found{username ? ` for "${username}"` : ''}.</p>
        </div>
      )}

      {/* Waterfall grid */}
      {repos.length > 0 && (
        <div className="ghReposGrid">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              isExpanded={expandedRepoId === repo.id}
              onToggle={() => {
                setExpandedRepoId((prev) => (prev === repo.id ? null : repo.id));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
