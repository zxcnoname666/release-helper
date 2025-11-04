/**
 * AI Tools system - provides structured tools for AI to gather context
 */

import type { AITool, CommitInfo, ParsedCommit } from './types.js';
import { getCommitDiff, getChangedFiles, getCommitStats } from './git.js';
import { parseCommitMessage, formatCommit } from './commits.js';

/**
 * Maximum number of lines for diff output to avoid token limits
 */
const MAX_DIFF_LINES = 300;

/**
 * Tool registry for AI
 */
export const AI_TOOLS: AITool[] = [
  {
    name: 'get_commit_details',
    description: 'Get detailed information about a specific commit by its hash. Returns commit message, author, date, and stats.',
    parameters: {
      type: 'object',
      properties: {
        sha: {
          type: 'string',
          description: 'The commit SHA (can be short or full hash)',
        },
      },
      required: ['sha'],
    },
  },
  {
    name: 'get_commit_diff',
    description: 'Get the diff (changes) for a specific commit. Returns file changes with additions and deletions. Automatically truncates large diffs to stay within token limits.',
    parameters: {
      type: 'object',
      properties: {
        sha: {
          type: 'string',
          description: 'The commit SHA to get diff for',
        },
        max_lines: {
          type: 'string',
          description: 'Maximum number of lines to return (default: 300)',
        },
      },
      required: ['sha'],
    },
  },
  {
    name: 'get_changed_files',
    description: 'Get list of files changed in a commit. Useful for understanding the scope of changes without seeing full diff.',
    parameters: {
      type: 'object',
      properties: {
        sha: {
          type: 'string',
          description: 'The commit SHA',
        },
      },
      required: ['sha'],
    },
  },
  {
    name: 'get_commits_by_type',
    description: 'Filter and group commits by conventional commit type (feat, fix, chore, etc.). Helps organize changelog sections.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Commit type to filter by',
          enum: ['feat', 'fix', 'docs', 'chore', 'refactor', 'style', 'perf', 'test', 'build', 'ci', 'revert', 'all'],
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'analyze_commit_impact',
    description: 'Analyze the impact of a commit based on file changes and stats. Returns categorization (minor, moderate, major) and affected areas.',
    parameters: {
      type: 'object',
      properties: {
        sha: {
          type: 'string',
          description: 'The commit SHA to analyze',
        },
      },
      required: ['sha'],
    },
  },
];

/**
 * Tool execution context
 */
interface ToolContext {
  commits: CommitInfo[];
  parsedCommits: ParsedCommit[];
}

/**
 * Execute a tool call
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context: ToolContext
): Promise<string> {
  switch (toolName) {
    case 'get_commit_details':
      return await getCommitDetails(args.sha, context);

    case 'get_commit_diff':
      return await getCommitDiffTool(args.sha, args.max_lines, context);

    case 'get_changed_files':
      return await getChangedFilesTool(args.sha, context);

    case 'get_commits_by_type':
      return getCommitsByType(args.type, context);

    case 'analyze_commit_impact':
      return await analyzeCommitImpact(args.sha, context);

    default:
      return `Unknown tool: ${toolName}`;
  }
}

/**
 * Tool: Get commit details
 */
async function getCommitDetails(sha: string, context: ToolContext): Promise<string> {
  const commit = findCommit(sha, context.commits);
  if (!commit) {
    return `Commit not found: ${sha}`;
  }

  const parsed = parseCommitMessage(commit);
  const stats = await getCommitStats(commit.sha);

  const types = parsed.map(p => p.type).join(', ');
  const breaking = parsed.some(p => p.breaking) ? '⚠️ BREAKING CHANGE' : '';

  return `
📋 **Commit Details**

- **SHA**: ${commit.sha} (${commit.shortSha})
- **Types**: ${types} ${breaking}
- **Author**: ${commit.author.name} (@${commit.author.login})
- **Date**: ${commit.author.date}
- **Changes**: +${stats.additions} -${stats.deletions} (~${stats.total} lines)

**Message**:
${commit.message}

**Parsed Changes**:
${parsed.map(p => `- ${formatCommit(p, true)}`).join('\n')}
`.trim();
}

/**
 * Tool: Get commit diff
 */
async function getCommitDiffTool(
  sha: string,
  maxLines: string | undefined,
  context: ToolContext
): Promise<string> {
  const commit = findCommit(sha, context.commits);
  if (!commit) {
    return `Commit not found: ${sha}`;
  }

  const limit = maxLines ? parseInt(maxLines, 10) : MAX_DIFF_LINES;
  const diff = await getCommitDiff(commit.sha, limit);

  return `
📝 **Diff for ${commit.shortSha}**

\`\`\`diff
${diff}
\`\`\`

${diff.includes('truncated') ? '⚠️ Diff was truncated to fit token limits. Use get_changed_files to see all affected files.' : ''}
`.trim();
}

/**
 * Tool: Get changed files
 */
async function getChangedFilesTool(sha: string, context: ToolContext): Promise<string> {
  const commit = findCommit(sha, context.commits);
  if (!commit) {
    return `Commit not found: ${sha}`;
  }

  const files = await getChangedFiles(commit.sha);

  // Group by directory
  const grouped = new Map<string, string[]>();
  for (const file of files) {
    const dir = file.includes('/') ? file.split('/')[0] : '.';
    if (!grouped.has(dir)) {
      grouped.set(dir, []);
    }
    grouped.get(dir)!.push(file);
  }

  let output = `📁 **Files changed in ${commit.shortSha}** (${files.length} total)\n\n`;

  for (const [dir, dirFiles] of grouped) {
    output += `**${dir}/**\n`;
    for (const file of dirFiles) {
      output += `  - ${file}\n`;
    }
    output += '\n';
  }

  return output.trim();
}

/**
 * Tool: Get commits by type
 */
function getCommitsByType(type: string, context: ToolContext): string {
  const filtered = type === 'all'
    ? context.parsedCommits
    : context.parsedCommits.filter(c => c.type === type);

  if (filtered.length === 0) {
    return `No commits found with type: ${type}`;
  }

  let output = `📊 **${type === 'all' ? 'All commits' : `${type.toUpperCase()} commits`}** (${filtered.length} total)\n\n`;

  for (const commit of filtered) {
    output += `- ${formatCommit(commit, type === 'all')}\n`;
  }

  return output.trim();
}

/**
 * Tool: Analyze commit impact
 */
async function analyzeCommitImpact(sha: string, context: ToolContext): Promise<string> {
  const commit = findCommit(sha, context.commits);
  if (!commit) {
    return `Commit not found: ${sha}`;
  }

  const stats = await getCommitStats(commit.sha);
  const files = await getChangedFiles(commit.sha);
  const parsed = parseCommitMessage(commit);

  // Categorize impact
  let impact: 'minor' | 'moderate' | 'major';
  if (stats.total > 500 || files.length > 10 || parsed.some(p => p.breaking)) {
    impact = 'major';
  } else if (stats.total > 100 || files.length > 3) {
    impact = 'moderate';
  } else {
    impact = 'minor';
  }

  // Detect affected areas
  const areas = new Set<string>();
  for (const file of files) {
    if (file.includes('test')) areas.add('tests');
    if (file.includes('doc')) areas.add('documentation');
    if (file.match(/\.(ts|js|tsx|jsx)$/)) areas.add('code');
    if (file.match(/\.(css|scss|sass)$/)) areas.add('styles');
    if (file.includes('config') || file.includes('.json')) areas.add('configuration');
  }

  const impactEmoji = impact === 'major' ? '🔴' : impact === 'moderate' ? '🟡' : '🟢';
  const breaking = parsed.some(p => p.breaking) ? '\n⚠️ **BREAKING CHANGE**' : '';

  return `
🎯 **Impact Analysis for ${commit.shortSha}**

${impactEmoji} **Impact Level**: ${impact.toUpperCase()}${breaking}

**Statistics**:
- Files changed: ${files.length}
- Lines added: +${stats.additions}
- Lines deleted: -${stats.deletions}
- Total changes: ~${stats.total} lines

**Affected Areas**:
${Array.from(areas).map(area => `- ${area}`).join('\n')}

**Commit Types**:
${parsed.map(p => `- ${p.type}${p.scope ? ` (${p.scope})` : ''}: ${p.subject}`).join('\n')}
`.trim();
}

/**
 * Helper: Find commit by SHA (supports short SHA)
 */
function findCommit(sha: string, commits: CommitInfo[]): CommitInfo | undefined {
  return commits.find(c => c.sha.startsWith(sha) || c.shortSha === sha);
}

/**
 * Generate tools description for AI prompt
 */
export function generateToolsDescription(): string {
  return `
## Available Tools

You MUST use these tools to gather detailed information before generating the final changelog:

${AI_TOOLS.map((tool, i) => `
${i + 1}. **${tool.name}**
   ${tool.description}
   Parameters: ${JSON.stringify(tool.parameters.properties, null, 2)}
`).join('\n')}

## How to Use Tools

To use a tool, respond with a JSON code block containing either:

Single tool request:
\`\`\`json
{
  "tool": "tool_name",
  "arguments": { "param": "value" }
}
\`\`\`

Multiple tool requests (preferred for efficiency):
\`\`\`json
[
  { "tool": "tool_name_1", "arguments": { "param": "value" } },
  { "tool": "tool_name_2", "arguments": { "param": "value" } }
]
\`\`\`

## Required Workflow

1. **First Response**: Use tools to gather details about key commits (get_commit_diff, analyze_commit_impact)
2. **Wait for Tool Results**: System will provide results
3. **Generate Changelog**: Use gathered information to create detailed, informative changelog

DO NOT skip the tool usage step. The basic commit info provided is minimal - you need to use tools to get diffs and analyze impact.
`.trim();
}
