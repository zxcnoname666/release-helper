/**
 * Commit parsing and analysis module
 */

import type { CommitInfo, ParsedCommit } from './types.js';

/**
 * Conventional commit types
 */
const COMMIT_TYPES = [
  'feat', 'fix', 'docs', 'chore', 'refactor',
  'style', 'perf', 'test', 'build', 'ci', 'revert'
] as const;

type CommitType = typeof COMMIT_TYPES[number];

/**
 * Parse a single commit message according to Conventional Commits
 * Supports multiple types in one commit (e.g., "feat: add X\n\nchore: update Y")
 */
export function parseCommitMessage(commit: CommitInfo): ParsedCommit[] {
  const lines = commit.message.split('\n').filter(line => line.trim());
  const parsed: ParsedCommit[] = [];

  for (const line of lines) {
    const match = line.match(/^(feat|fix|docs|chore|refactor|style|perf|test|build|ci|revert)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i);

    if (match) {
      const [, type, scope, breaking, subject] = match;
      parsed.push({
        type: type.toLowerCase() as CommitType,
        scope: scope?.trim(),
        subject: subject.trim(),
        breaking: !!breaking,
        raw: line,
        commit,
      });
    }
  }

  // If no conventional commits found, treat the first line as unknown type
  if (parsed.length === 0) {
    const firstLine = lines[0] || commit.message;
    parsed.push({
      type: 'unknown',
      subject: firstLine.trim(),
      breaking: false,
      raw: firstLine,
      commit,
    });
  }

  return parsed;
}

/**
 * Parse multiple commits
 */
export function parseCommits(commits: CommitInfo[]): ParsedCommit[] {
  const result: ParsedCommit[] = [];

  for (const commit of commits) {
    result.push(...parseCommitMessage(commit));
  }

  return result;
}

/**
 * Group commits by type
 */
export function groupCommitsByType(commits: ParsedCommit[]): Map<string, ParsedCommit[]> {
  const groups = new Map<string, ParsedCommit[]>();

  for (const commit of commits) {
    const type = commit.type;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(commit);
  }

  return groups;
}

/**
 * Get unique contributors from commits
 */
export function getContributors(commits: CommitInfo[]): string[] {
  const contributors = new Set<string>();

  for (const commit of commits) {
    const name = commit.author.login || commit.author.name;
    contributors.add(name);
  }

  return Array.from(contributors);
}

/**
 * Format commit for display
 */
export function formatCommit(parsed: ParsedCommit, includeType = true): string {
  const { type, scope, subject, commit } = parsed;
  const shortSha = commit.shortSha;
  const author = commit.author.login || commit.author.name;

  const scopeStr = scope ? `(${scope})` : '';
  const typeStr = includeType ? `**${type}${scopeStr}**: ` : '';

  return `${typeStr}${subject} [${shortSha}] by @${author}`;
}

/**
 * Validate if commits follow conventional commits format
 */
export function validateConventionalCommits(commits: CommitInfo[]): {
  valid: boolean;
  invalid: CommitInfo[];
} {
  const invalid: CommitInfo[] = [];

  for (const commit of commits) {
    const firstLine = commit.message.split('\n')[0];
    const isConventional = /^(feat|fix|docs|chore|refactor|style|perf|test|build|ci|revert)(\(.+\))?:/.test(firstLine);

    if (!isConventional) {
      invalid.push(commit);
    }
  }

  return {
    valid: invalid.length === 0,
    invalid,
  };
}

/**
 * Type labels for changelog sections
 */
export const TYPE_LABELS: Record<string, string> = {
  feat: '✨ Features',
  fix: '🐛 Bug Fixes',
  docs: '📝 Documentation',
  chore: '🔧 Chores',
  refactor: '♻️ Refactoring',
  style: '💄 Styling',
  perf: '⚡ Performance',
  test: '✅ Tests',
  build: '📦 Build',
  ci: '👷 CI',
  revert: '⏪ Reverts',
  unknown: '📌 Other Changes',
};

/**
 * Sort order for commit types (higher = more important)
 */
const TYPE_PRIORITY: Record<string, number> = {
  feat: 100,
  fix: 90,
  perf: 80,
  refactor: 70,
  docs: 60,
  test: 50,
  build: 40,
  ci: 30,
  style: 20,
  chore: 10,
  revert: 5,
  unknown: 0,
};

/**
 * Sort commit types by priority
 */
export function sortCommitTypes(types: string[]): string[] {
  return types.sort((a, b) => {
    const priorityA = TYPE_PRIORITY[a] ?? 0;
    const priorityB = TYPE_PRIORITY[b] ?? 0;
    return priorityB - priorityA;
  });
}
