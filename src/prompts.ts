/**
 * AI prompts for changelog generation
 */

import type { AIContext, ParsedCommit, ReleaseStats } from './types.js';
import { TYPE_LABELS, sortCommitTypes, formatCommit, groupCommitsByType } from './commits.js';
import { generateToolsDescription } from './ai-tools.js';

/**
 * Generate system prompt for AI
 */
export function generateSystemPrompt(): string {
  return `
You are an expert technical writer specializing in creating clear, informative, and engaging release notes and changelogs.

Your task is to analyze Git commits and generate a comprehensive changelog that helps users understand:
- What changed in this release
- Why it matters to them
- Any breaking changes or important notes

Guidelines:
1. **Be clear and concise** - Users should quickly understand changes
2. **Use proper categorization** - Group changes by type (features, fixes, etc.)
3. **Highlight breaking changes** - Make them prominent and explain migration if needed
4. **Focus on user impact** - Explain what users can do now or what's fixed
5. **Use proper markdown** - Make it readable and well-structured
6. **Be professional yet friendly** - Strike a balance in tone

Output format:
- Start with a brief summary (2-3 sentences) highlighting key changes
- Group changes by category with emoji headers
- List breaking changes prominently if any
- When listing individual commits, you MUST preserve the exact format: "subject [hash] by @author"
- Example: "Add new feature [a1b2c3d] by @username"
- DO NOT omit the author attribution or change the commit format
- DO NOT add statistics section - it will be added automatically
- Use markdown formatting for links, code, emphasis

${generateToolsDescription()}

Important: If you need more information about specific commits, use the tools provided. You can make multiple tool requests before generating the final changelog.
`.trim();
}

/**
 * Generate user prompt with context
 */
export function generateUserPrompt(context: AIContext): string {
  const { versionInfo, commits, stats, repository } = context;

  // Group commits
  const grouped = groupCommitsByType(commits);
  const types = sortCommitTypes(Array.from(grouped.keys()));

  // Breaking changes
  const breaking = commits.filter(c => c.breaking);

  // Format commits by type
  const commitsByType = types.map(type => {
    const typeCommits = grouped.get(type) || [];
    const label = TYPE_LABELS[type] || type;
    return `
### ${label}
${typeCommits.map(c => `- ${formatCommit(c, false)}`).join('\n')}
`;
  }).join('\n');

  return `
# Release Context

## Version Information
${versionInfo.previous ? `- **Previous version**: ${versionInfo.previous}` : '- **First release**'}
- **New version**: ${versionInfo.current}
- **Release type**: ${versionInfo.releaseType.toUpperCase()}

## Repository
- **Owner**: ${repository.owner}
- **Repo**: ${repository.repo}
${versionInfo.previous ? `- **Full changes**: https://github.com/${repository.owner}/${repository.repo}/compare/${versionInfo.previous}...${versionInfo.current}` : ''}

## Statistics
- **Commits**: ${stats.commitCount}
- **Files changed**: ${stats.filesChanged}
- **Additions**: +${stats.additions}
- **Deletions**: -${stats.deletions}
${stats.daysSinceLastRelease !== null ? `- **Days since last release**: ${stats.daysSinceLastRelease}` : ''}
- **Contributors**: ${stats.contributors.join(', ')}

${breaking.length > 0 ? `
## ⚠️ Breaking Changes Detected
${breaking.map(c => `- ${formatCommit(c, true)}`).join('\n')}
` : ''}

## All Commits

${commitsByType}

---

**Task**: Generate a professional, user-friendly changelog for this release.

Requirements:
- When listing commits, you MUST use the exact format shown above: "subject [hash] by @author"
- DO NOT rewrite commits in a different format or omit the author information
- You can add descriptions and context, but preserve the commit entries as provided
- DO NOT add a statistics section at the end (it will be added automatically)

If you need more details about any commit (like viewing diffs, file changes, or impact analysis), use the provided tools first. After gathering all necessary information, create the final changelog.

The changelog should be in markdown format and ready to be published as a GitHub release.
`.trim();
}

/**
 * Generate statistics section for release notes
 */
export function generateStatsSection(
  stats: ReleaseStats,
  versionInfo: { previous?: string; current: string },
  repository: { owner: string; repo: string }
): string {
  const compareLink = versionInfo.previous
    ? `\n\n**Full changes**: https://github.com/${repository.owner}/${repository.repo}/compare/${versionInfo.previous}...${versionInfo.current}`
    : '';

  return `
---

###### **📊 Release Statistics**

\`\`\`
Files changed: ${stats.filesChanged} | Additions: ${stats.additions} | Deletions: ${stats.deletions}${stats.daysSinceLastRelease !== null ? ` | Days since last release: ${stats.daysSinceLastRelease}` : ''}
Contributors: ${stats.contributors.length} | Commits: ${stats.commitCount}
\`\`\`${compareLink}
`.trim();
}

/**
 * Format simple changelog (fallback when no AI)
 */
export function formatSimpleChangelog(
  commits: ParsedCommit[],
  stats: ReleaseStats,
  versionInfo: { previous?: string; current: string },
  repository: { owner: string; repo: string }
): string {
  const grouped = groupCommitsByType(commits);
  const types = sortCommitTypes(Array.from(grouped.keys()));

  let changelog = '## What\'s Changed\n\n';

  for (const type of types) {
    const typeCommits = grouped.get(type) || [];
    const label = TYPE_LABELS[type] || type;

    changelog += `### ${label}\n\n`;
    for (const commit of typeCommits) {
      changelog += `- ${formatCommit(commit, false)}\n`;
    }
    changelog += '\n';
  }

  changelog += generateStatsSection(stats, versionInfo, repository);

  return changelog;
}

/**
 * Parse tool requests from AI response
 */
export function parseToolRequests(response: string): Array<{ tool: string; arguments: Record<string, any> }> {
  const requests: Array<{ tool: string; arguments: Record<string, any> }> = [];

  // Try to find JSON blocks
  const jsonMatches = response.matchAll(/```json\s*(\{[\s\S]*?\})\s*```/g);

  for (const match of jsonMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool) {
        requests.push({
          tool: parsed.tool,
          arguments: parsed.arguments || {},
        });
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return requests;
}
