/**
 * GitHub API operations module
 */

import { getOctokit } from '@actions/github';
import { info, warning } from '@actions/core';
import type { CommitInfo } from './types.js';
import { readFileSync } from 'fs';
import { lookup } from 'mime-types';
import { getLatestVersionTag } from './git.js';

type Octokit = ReturnType<typeof getOctokit>;

/**
 * Get the latest release tag
 */
export async function getLatestReleaseTag(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string | undefined> {
  try {
    const release = await octokit.rest.repos.getLatestRelease({ owner, repo });
    return release.data.tag_name;
  } catch (error: any) {
    if (error.status === 404) {
      // No "latest" release found, try to get latest tag from git
      warning('No latest release found via GitHub API, trying to get latest tag from git...');
      const gitTag = await getLatestVersionTag();
      if (gitTag) {
        info(`Found latest tag from git: ${gitTag}`);
        return gitTag;
      }
      return undefined; // No releases or tags yet
    }
    throw error;
  }
}

/**
 * Create a git tag
 */
export async function createTag(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
  sha: string
): Promise<void> {
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/tags/${tag}`,
    sha,
  });
  info(`Created tag: ${tag}`);
}

/**
 * Get commits between two refs (enriched with GitHub data)
 */
export async function getCommitsBetween(
  octokit: Octokit,
  owner: string,
  repo: string,
  from: string | undefined,
  to: string
): Promise<CommitInfo[]> {
  if (from) {
    // Compare commits
    const comparison = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: from,
      head: to,
    });

    return comparison.data.commits.map(commit => ({
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      message: commit.commit.message,
      author: {
        name: commit.commit.author?.name || 'Unknown',
        login: commit.author?.login,
        date: commit.commit.author?.date || new Date().toISOString(),
      },
    }));
  } else {
    // Get all commits (first release)
    const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
      owner,
      repo,
      per_page: 100,
    });

    return commits.map(commit => ({
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      message: commit.commit.message,
      author: {
        name: commit.commit.author?.name || 'Unknown',
        login: commit.author?.login,
        date: commit.commit.author?.date || new Date().toISOString(),
      },
    }));
  }
}

/**
 * Create a GitHub release
 */
export async function createRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
  body: string,
  options: {
    draft?: boolean;
    prerelease?: boolean;
  } = {}
): Promise<{ id: number; uploadUrl: string; htmlUrl: string }> {
  const release = await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: tag,
    name: `Release ${tag}`,
    body,
    draft: options.draft || false,
    prerelease: options.prerelease || false,
  });

  info(`Created release: ${release.data.html_url}`);

  return {
    id: release.data.id,
    uploadUrl: release.data.upload_url,
    htmlUrl: release.data.html_url,
  };
}

/**
 * Upload release asset
 */
export async function uploadReleaseAsset(
  octokit: Octokit,
  uploadUrl: string,
  filePath: string
): Promise<void> {
  const data = readFileSync(filePath);
  const name = filePath.split('/').pop()!;
  const contentType = lookup(name) || 'application/octet-stream';

  await octokit.rest.repos.uploadReleaseAsset({
    url: uploadUrl,
    headers: {
      'content-type': contentType,
      'content-length': data.byteLength.toString(),
    },
    name,
    data: data as any,
  });

  info(`Uploaded asset: ${name}`);
}

/**
 * Send Discord notification
 */
export async function sendDiscordNotification(
  webhookUrl: string,
  message: string,
  embedOptions?: {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }
): Promise<void> {
  const payload: any = {
    content: embedOptions ? undefined : message,
  };

  if (embedOptions) {
    payload.embeds = [
      {
        title: embedOptions.title,
        description: embedOptions.description,
        url: embedOptions.url,
        color: embedOptions.color || 0x00ff00,
        fields: embedOptions.fields,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }

  info('Discord notification sent');
}
