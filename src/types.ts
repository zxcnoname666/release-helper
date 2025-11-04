/**
 * Core type definitions for the release helper
 */

import type { ReleaseType } from 'semver';

/**
 * Configuration for the GitHub Action
 */
export interface ActionConfig {
  githubToken: string;
  lintAndTestsCommand?: string;
  buildCommand?: string;
  assetPatterns: string[];
  openaiApiKey?: string;
  openaiApiModel: string;
  openaiApiBaseUrl: string;
  discordWebhook?: string;
  allowedBranch: string;
  draftRelease: boolean;
  prerelease: boolean;
  language: string;
}

/**
 * Git commit information
 */
export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: {
    name: string;
    login?: string;
    date: string;
  };
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

/**
 * Parsed commit type from conventional commits
 */
export interface ParsedCommit {
  type: 'feat' | 'fix' | 'docs' | 'chore' | 'refactor' | 'style' | 'perf' | 'test' | 'build' | 'ci' | 'revert' | 'unknown';
  scope?: string;
  subject: string;
  breaking: boolean;
  raw: string;
  commit: CommitInfo;
}

/**
 * Release statistics
 */
export interface ReleaseStats {
  filesChanged: number;
  additions: number;
  deletions: number;
  daysSinceLastRelease: number | null;
  commitCount: number;
  contributors: string[];
}

/**
 * Version information
 */
export interface VersionInfo {
  previous?: string;
  current: string;
  releaseType: ReleaseType;
}

/**
 * Tool definition for AI
 */
export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Tool result from AI call
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * Response from AI API
 */
export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * Context provided to AI for changelog generation
 */
export interface AIContext {
  versionInfo: VersionInfo;
  commits: ParsedCommit[];
  stats: ReleaseStats;
  repository: {
    owner: string;
    repo: string;
  };
  language: string;
}
