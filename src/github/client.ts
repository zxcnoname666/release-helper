/**
 * GitHub API client for code review integration
 */

import type { PullRequestInfo, FileChange, ReviewComment } from '../types/index.js';
import { getOctokit } from '@actions/github';
import { context } from '@actions/github';
import { info, warning } from '@actions/core';

/**
 * Get pull request information
 */
export async function getPullRequestInfo(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequestInfo> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body || '',
    author: pr.user?.login || 'unknown',
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    filesChanged: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
  };
}

/**
 * Get changed files in pull request
 */
export async function getChangedFiles(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<FileChange[]> {
  const files: FileChange[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: perPage,
      page,
    });

    if (data.length === 0) break;

    for (const file of data) {
      files.push({
        filename: file.filename,
        status: file.status as any,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        previousFilename: file.previous_filename,
        blob_url: file.blob_url,
        language: detectLanguage(file.filename),
      });
    }

    if (data.length < perPage) break;
    page++;
  }

  return files;
}

/**
 * Post review comment on pull request
 */
export async function postReviewComment(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT',
  comments: ReviewComment[] = []
): Promise<void> {
  try {
    // Create review with inline comments
    const reviewComments = comments
      .filter(c => c.path && c.line)
      .map(c => ({
        path: c.path,
        line: c.line!,
        side: c.side || 'RIGHT',
        body: formatInlineComment(c),
      }));

    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event,
      body,
      comments: reviewComments.length > 0 ? reviewComments : undefined,
    });

    info(`✅ Posted review with ${reviewComments.length} inline comments`);
  } catch (error: any) {
    warning(`Failed to post review: ${error.message}`);
    throw error;
  }
}

/**
 * Post silent comment (minimize notifications)
 */
export async function postSilentComment(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
): Promise<void> {
  try {
    // GitHub doesn't have a true "silent" mode, but we can:
    // 1. Use a bot account if possible
    // 2. Add a minimize marker in the comment
    // 3. Post as a review comment instead of issue comment

    const wrappedBody = `<!-- ai-review-silent -->

${body}

---
<sub>🤖 This is an automated review. To reduce noise, consider muting notifications for this bot.</sub>`;

    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: 'COMMENT',
      body: wrappedBody,
    });

    info('✅ Posted silent review comment');
  } catch (error: any) {
    warning(`Failed to post silent comment: ${error.message}`);

    // Fallback to regular comment
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  }
}

/**
 * Update existing review comment
 */
export async function updateReviewComment(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<void> {
  try {
    await octokit.rest.pulls.updateReviewComment({
      owner,
      repo,
      comment_id: commentId,
      body,
    });

    info(`✅ Updated review comment ${commentId}`);
  } catch (error: any) {
    warning(`Failed to update comment: ${error.message}`);
    throw error;
  }
}

/**
 * Find existing AI review comments
 */
export async function findExistingReviews(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<Array<{ id: number; body: string }>> {
  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
    });

    // Look for comments from this bot
    const botLogin = context.actor; // Current GitHub Actions bot
    const aiReviews = comments
      .filter(
        comment =>
          comment.user?.login === botLogin &&
          (comment.body?.includes('🤖') || comment.body?.includes('ai-review'))
      )
      .map(comment => ({
        id: comment.id,
        body: comment.body || '',
      }));

    return aiReviews;
  } catch (error: any) {
    warning(`Failed to fetch existing reviews: ${error.message}`);
    return [];
  }
}

/**
 * Add labels to pull request
 */
export async function addLabels(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  labels: string[]
): Promise<void> {
  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pullNumber,
      labels,
    });

    info(`✅ Added labels: ${labels.join(', ')}`);
  } catch (error: any) {
    warning(`Failed to add labels: ${error.message}`);
  }
}

/**
 * Remove labels from pull request
 */
export async function removeLabel(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  label: string
): Promise<void> {
  try {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: pullNumber,
      name: label,
    });

    info(`✅ Removed label: ${label}`);
  } catch (error: any) {
    // Ignore if label doesn't exist
    if (error.status !== 404) {
      warning(`Failed to remove label: ${error.message}`);
    }
  }
}

/**
 * Request reviewers
 */
export async function requestReviewers(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewers: string[]
): Promise<void> {
  try {
    await octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers,
    });

    info(`✅ Requested reviewers: ${reviewers.join(', ')}`);
  } catch (error: any) {
    warning(`Failed to request reviewers: ${error.message}`);
  }
}

/**
 * Helper functions
 */

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const langMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    mjs: 'JavaScript',
    cjs: 'JavaScript',
    py: 'Python',
    rb: 'Ruby',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    cs: 'C#',
    php: 'PHP',
    swift: 'Swift',
    kt: 'Kotlin',
    scala: 'Scala',
    md: 'Markdown',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    toml: 'TOML',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    vue: 'Vue',
    svelte: 'Svelte',
  };

  return langMap[ext || ''] || 'Unknown';
}

function formatInlineComment(comment: ReviewComment): string {
  const severityIcon = {
    critical: '🔴',
    error: '❌',
    warning: '⚠️',
    info: '📘',
  }[comment.severity];

  const categoryIcon = {
    bug: '🐛',
    security: '🔒',
    performance: '⚡',
    style: '🎨',
    'best-practice': '⭐',
    maintainability: '🔧',
  }[comment.category];

  return `${severityIcon} **${comment.category}** ${categoryIcon}

${comment.body}`;
}

/**
 * Get review event based on issues
 */
export function getReviewEvent(
  hasCritical: boolean,
  hasWarnings: boolean
): 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' {
  if (hasCritical) {
    return 'REQUEST_CHANGES';
  }

  if (hasWarnings) {
    return 'COMMENT';
  }

  return 'APPROVE';
}
