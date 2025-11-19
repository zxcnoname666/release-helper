/**
 * Git operations module
 */

import { exec } from '@actions/exec';
import type { CommitInfo } from './types.js';

/**
 * Execute git command and capture output
 */
async function execGit(args: string[]): Promise<string> {
  let output = '';
  await exec('git', args, {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
    silent: true,
  });
  return output.trim();
}

/**
 * Get latest semantic version tag from git (fallback for getLatestReleaseTag)
 */
export async function getLatestVersionTag(): Promise<string | undefined> {
  try {
    // Get all tags sorted by version
    const output = await execGit(['tag', '--sort=-version:refname', '--list', 'v*.*.*']);
    if (!output) {
      return undefined;
    }

    const tags = output.split('\n').filter(Boolean);
    return tags[0]; // First tag is the latest version
  } catch {
    return undefined;
  }
}

/**
 * Check if working directory is clean
 */
export async function assertCleanWorkingDir(): Promise<void> {
  const output = await execGit(['status', '--porcelain']);
  if (output) {
    throw new Error('Working directory is not clean. Commit or stash your changes.');
  }
}

/**
 * Assert current branch matches expected
 */
export async function assertOnBranch(expected: string): Promise<void> {
  const branch = await execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== expected) {
    throw new Error(
      `Releases are only allowed from '${expected}' branch. Current branch: '${branch}'`
    );
  }
}

/**
 * Get list of commits between two refs
 */
export async function getCommitsBetween(from: string | null, to: string): Promise<CommitInfo[]> {
  const range = from ? `${from}..${to}` : to;
  const format = '%H%n%h%n%an%n%ae%n%aI%n%s%n%b%n--END-COMMIT--';
  const output = await execGit(['log', range, `--format=${format}`]);

  if (!output) {
    return [];
  }

  const commits: CommitInfo[] = [];
  const blocks = output.split('--END-COMMIT--').filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 6) continue;

    const [sha, shortSha, authorName, authorEmail, date, subject, ...bodyLines] = lines;
    const body = bodyLines.join('\n').trim();
    const message = body ? `${subject}\n\n${body}` : subject;

    commits.push({
      sha,
      shortSha,
      message,
      author: {
        name: authorName,
        login: authorEmail.split('@')[0], // Fallback, will be enriched by GitHub API
        date,
      },
    });
  }

  return commits;
}

/**
 * Get commit diff stats
 */
export async function getCommitStats(sha: string): Promise<{
  additions: number;
  deletions: number;
  total: number;
}> {
  const output = await execGit(['show', '--numstat', '--format=', sha]);
  let additions = 0;
  let deletions = 0;

  for (const line of output.split('\n')) {
    const match = line.match(/^(\d+)\s+(\d+)/);
    if (match) {
      additions += parseInt(match[1], 10);
      deletions += parseInt(match[2], 10);
    }
  }

  return {
    additions,
    deletions,
    total: additions + deletions,
  };
}

/**
 * Get changed files in a commit
 */
export async function getChangedFiles(sha: string): Promise<string[]> {
  const output = await execGit(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
  return output.split('\n').filter(Boolean);
}

/**
 * Get full diff for a commit
 */
export async function getCommitDiff(sha: string, maxLines?: number): Promise<string> {
  const output = await execGit(['show', sha]);

  if (maxLines) {
    const lines = output.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (truncated, ${lines.length - maxLines} more lines)`;
    }
  }

  return output;
}

/**
 * Get range stats (all commits between refs)
 */
export async function getRangeStats(from: string | null, to: string): Promise<{
  filesChanged: number;
  additions: number;
  deletions: number;
}> {
  const range = from ? `${from}..${to}` : to;
  const output = await execGit(['diff', '--shortstat', from || `${to}^`, to]);

  const match = output.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

  if (!match) {
    return { filesChanged: 0, additions: 0, deletions: 0 };
  }

  return {
    filesChanged: parseInt(match[1], 10) || 0,
    additions: parseInt(match[2], 10) || 0,
    deletions: parseInt(match[3], 10) || 0,
  };
}

/**
 * Get commit date
 */
export async function getCommitDate(ref: string): Promise<Date> {
  const timestamp = await execGit(['log', '-1', '--format=%aI', ref]);
  return new Date(timestamp);
}

/**
 * Get overall diff between two versions (what actually changed in the final result)
 * This shows the net changes, ignoring intermediate commits
 */
export async function getVersionDiff(from: string | null, to: string, maxLines?: number): Promise<string> {
  const range = from ? `${from}..${to}` : `${to}^..${to}`;
  const output = await execGit(['diff', range]);

  if (maxLines) {
    const lines = output.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (truncated, ${lines.length - maxLines} more lines)`;
    }
  }

  return output;
}

/**
 * Get list of files that actually changed between versions (net result)
 */
export async function getVersionChangedFiles(from: string | null, to: string): Promise<{
  added: string[];
  modified: string[];
  deleted: string[];
  all: string[];
}> {
  const range = from ? `${from}..${to}` : `${to}^..${to}`;
  const output = await execGit(['diff', '--name-status', range]);

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const line of output.split('\n').filter(Boolean)) {
    const match = line.match(/^([AMD])\s+(.+)$/);
    if (match) {
      const [, status, file] = match;
      if (status === 'A') added.push(file);
      else if (status === 'M') modified.push(file);
      else if (status === 'D') deleted.push(file);
    }
  }

  return {
    added,
    modified,
    deleted,
    all: [...added, ...modified, ...deleted],
  };
}
