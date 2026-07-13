import { api } from './client';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  language: string;
  private: boolean;
  fork: boolean;
  parent_full_name: string;
  stargazers_count: number;
  forks_count: number;
  license: string;
  pushed_at: string;
  updated_at: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export interface GitHubReleasesResponse {
  releases: GitHubRelease[];
  latest_publish_at: string;
}

export async function fetchGitHubRepos(username?: string): Promise<GitHubRepo[]> {
  const params = username ? `?username=${encodeURIComponent(username)}` : '';
  return api<GitHubRepo[]>(`/api/github/repos${params}`);
}

export async function fetchGitHubReleases(
  owner: string,
  repo: string,
  perPage = 5
): Promise<GitHubReleasesResponse> {
  return api<GitHubReleasesResponse>(
    `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=${perPage}`
  );
}
