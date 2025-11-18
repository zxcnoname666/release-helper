/**
 * AI prompts for changelog generation
 */

import type { AIContext, ParsedCommit, ReleaseStats } from './types.js';
import { TYPE_LABELS, sortCommitTypes, formatCommit, groupCommitsByType } from './commits.js';
import { generateToolsDescription } from './ai-tools.js';

/**
 * Generate system prompt for AI
 */
export function generateSystemPrompt(language: string = 'en'): string {
  const languageInstruction = language !== 'en'
    ? `\n\n## LANGUAGE REQUIREMENT\n\n⚠️ CRITICAL: Generate the ENTIRE changelog in **${language}** language from the start.\n- Write all descriptions, explanations, and text in ${language}\n- Keep technical details in original form (commit hashes, usernames, file names, URLs)\n- Translate commit subjects in the format: "translated subject [hash] by @author"\n- Do NOT write in English first and then translate - write directly in ${language}\n- Keep emojis and markdown formatting as-is\n`
    : '';

  return `
You are an expert technical writer specializing in creating clear, informative, and engaging release notes and changelogs.

Your task is to analyze Git commits and generate a comprehensive changelog that helps users understand:
- What changed in this release
- Why it matters to them
- Any breaking changes or important notes${languageInstruction}

## Core Workflow (IMPORTANT)

1. **First, use tools**: When you receive commit information, your FIRST response must request tools to analyze commits
2. **Check version diff**: Use get_version_diff or get_version_changed_files to see what ACTUALLY made it to the release
3. **Verify against commits**: Cross-check commits with the version diff - if a feature was added then removed, DON'T include it!
4. **Analyze tool results**: After receiving tool results, understand the actual code changes
5. **Group by semantic blocks**: Identify logical groups of related changes (not just commit types)
6. **Generate changelog**: Create detailed, informative changelog based on semantic analysis

DO NOT skip steps 1-2. The basic commit info provided is insufficient - you MUST use tools to get diffs and analyze impact.

⚠️ CRITICAL: Always verify that features mentioned in commits are present in the final version diff. Individual commits may add/remove features, but only what's in the final diff should be in the changelog!

## Changelog Structure (CRITICAL)

**Group commits by SEMANTIC MEANING, not just by type!**

For each category (feat, fix, ci, etc.):
1. **Identify semantic blocks** - Group related commits that accomplish one logical change
2. **Write block description** - Explain what was achieved, challenges faced, solutions found
3. **List commits in block** - JUST list them, NO individual descriptions

### Example Structure:

\`\`\`markdown
---

## 🚀 Features

### Authentication System Overhaul

We completely redesigned the authentication system to support OAuth2 and JWT tokens. The main challenge was migrating existing sessions without breaking active users. We solved this by implementing a dual-token system that supports both old and new formats during transition.

Key improvements:
- Faster token validation (from 150ms to 5ms)
- Support for refresh tokens
- Better security with rotating secrets

**Related commits:**
- feat: add OAuth2 provider support [a1b2c3d] by @john
- feat: implement JWT token validation [b2c3d4e] by @john
- refactor: migrate session storage to Redis [c3d4e5f] by @mary
- fix: resolve token race condition [d4e5f6g] by @john

---

## 🐛 Bug Fixes

### Critical Memory Leak Resolution

We discovered a memory leak in the WebSocket handler that caused server crashes after 24h uptime. After debugging with heapdump analysis, found that event listeners weren't being properly cleaned up. Fixed by implementing automatic cleanup on disconnect.

**Related commits:**
- fix: cleanup WebSocket listeners on disconnect [g7h8i9j] by @eve
- fix: add memory monitoring alerts [h8i9j0k] by @eve

---

## 👷 CI

### CI/CD Pipeline Improvements

We improved the CI/CD pipeline by adding Docker support and Kubernetes deployment. The main challenge was creating a working Dockerfile - first had issues with the base image, then with dependencies, then with the COPY instruction. Eventually solved it using multi-stage builds.

**Related commits:**
- ci: add Dockerfile [abc123] by @dev1
- ci: fix Docker build issues [def456] by @dev1
- ci: add Kubernetes manifests [ghi789] by @dev2
\`\`\`

**IMPORTANT**: Always add \`---\` (horizontal rule) BEFORE each category section (Features, Bug Fixes, CI, etc.)

### CRITICAL - Commit List Format:

**WRONG ❌** (describing each commit individually):
\`\`\`markdown
**Related commits:**
- feat: add OAuth2 [abc] by @john
  - This commit added OAuth2 support...
- feat: add JWT [def] by @john
  - This commit implemented JWT validation...
\`\`\`

**CORRECT ✅** (just listing commits):
\`\`\`markdown
**Related commits:**
- feat: add OAuth2 provider support [abc] by @john
- feat: implement JWT token validation [def] by @john
\`\`\`

### Guidelines:
1. **Think semantically** - "What was actually accomplished?" not just "What's the commit type?"
2. **Tell the story** - Explain the problem, approach, and solution IN THE BLOCK DESCRIPTION
3. **Be technical but accessible** - Include details but explain why they matter
4. **Group intelligently** - Related commits go together even if slightly different types
5. **Preserve commit info** - Always list commits with exact format: "subject [hash] by @author"
6. **NO individual commit descriptions** - Only block description + commit list

### What NOT to do:
❌ Describe each commit individually under the commit line
❌ Add bullet points explaining what each commit does
❌ Write "This commit..." for individual commits
❌ Just list commits one by one without context
❌ Group only by commit type (feat, fix) without semantic grouping
❌ Write generic descriptions like "Various improvements"
❌ Omit the challenges and solutions

### What TO do:
✅ Write ONE description for the semantic block
✅ List all related commits without individual descriptions
✅ Group by what was actually built/fixed
✅ Explain the "why" and "how" in block description
✅ Include technical details and metrics when relevant
✅ Show the commits that contributed to each semantic block

${generateToolsDescription()}

Important: If you need more information about specific commits, use the tools provided. You can make multiple tool requests before generating the final changelog.

## Output Format

ALWAYS include \`---\` (horizontal rule) BEFORE each category section:
- Before ## 🚀 Features
- Before ## 🐛 Bug Fixes
- Before ## 👷 CI
- Before any other category

This creates visual separation between different types of changes.
`.trim();
}

/**
 * Generate user prompt with context
 */
export function generateUserPrompt(context: AIContext): string {
  const { versionInfo, commits, stats, repository, language } = context;

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

## IMPORTANT: Tool Usage Required

The commit information above is BASIC and MINIMAL. Before generating the changelog, you MUST:

1. **Use get_version_diff or get_version_changed_files FIRST**: See what ACTUALLY changed in the final release
2. **Verify commits against version diff**: Check that features mentioned in commits are present in the final diff
3. **Use tools to analyze key commits**: Use get_commit_diff and analyze_commit_impact for important changes
4. **Understand the actual code changes**: Don't just repeat commit messages, explain what actually changed
5. **Identify semantic relationships**: Group commits that work together to achieve one goal
6. **Generate detailed changelog**: Create comprehensive changelog with semantic grouping, INCLUDING ONLY changes present in version diff

⚠️ CRITICAL: If a feature was added in one commit but removed in another, it will NOT appear in the version diff and should NOT be in the changelog!

You have access to tools - use them to gather detailed information about commits before generating the final changelog.

## Changelog Format (CRITICAL)

**Use SEMANTIC BLOCK structure, not flat commit list!**

For each category (Features, Bug Fixes, etc.):

1. **Create semantic blocks** - Group related commits
2. **Write block description** - Explain what was accomplished, why, and how
3. **List related commits** - JUST list them, NO descriptions under each commit

### Required Structure:

\`\`\`markdown
---

## 🚀 Features

### [Semantic Block Title - What Was Achieved]

[2-4 sentences describing what was done, challenges faced, and solutions implemented]

**Related commits:**
- commit subject [hash] by @author
- commit subject [hash] by @author

---

## 🐛 Bug Fixes

### [Bug Description and Resolution]

[Explanation of the issue and how it was fixed]

**Related commits:**
- commit subject [hash] by @author
\`\`\`

**CRITICAL**: Always add \`---\` (horizontal rule) BEFORE each category (Features, Bug Fixes, CI, etc.)

### CRITICAL - NO Individual Commit Descriptions!

**WRONG ❌** (describing each commit):
\`\`\`markdown
**Related commits:**
- test [1b1a58a] by @user
  - This commit did something...
- fix [2c3d4e5] by @user
  - This commit fixed something...
\`\`\`

**CORRECT ✅** (just listing):
\`\`\`markdown
**Related commits:**
- test [1b1a58a] by @user
- fix: resolve issue [2c3d4e5] by @user
\`\`\`

### Key Requirements:

✅ **DO**: Group by semantic meaning (what was accomplished)
✅ **DO**: Write ONE description for the entire block
✅ **DO**: Explain challenges, approaches, and solutions in block description
✅ **DO**: Use technical details and metrics when relevant
✅ **DO**: Keep commits in exact format: "subject [hash] by @author"
✅ **DO**: List commits as simple flat list

❌ **DON'T**: Describe each commit individually
❌ **DON'T**: Add sub-bullets under commits explaining them
❌ **DON'T**: Write "This commit..." for each commit
❌ **DON'T**: List commits one by one without grouping
❌ **DON'T**: Group only by commit type without semantic analysis
❌ **DON'T**: Write generic descriptions
❌ **DON'T**: Omit author attribution

### Examples of Good Semantic Blocks:

**Good ✅**:
\`\`\`markdown
### CI/CD Pipeline Modernization

We migrated from Travis CI to GitHub Actions, reducing build time from 15 to 5 minutes.
The main challenge was handling matrix builds for multiple Node versions. Solved by using
GitHub's matrix strategy with caching.

**Related commits:**
- ci: migrate to GitHub Actions [abc123] by @dev1
- ci: add matrix build support [def456] by @dev1
- ci: implement caching [ghi789] by @dev2
\`\`\`

**Bad ❌**:
\`\`\`markdown
### Various CI improvements

**Related commits:**
- ci: migrate to GitHub Actions [abc123] by @dev1
  - This commit migrated from Travis...
- ci: add matrix build support [def456] by @dev1
  - This commit added matrix builds...
\`\`\`

The changelog should tell the story of what was built/fixed, not describe each commit separately.

## Output Format Requirements

1. **Always add \`---\` before each category section** (Features, Bug Fixes, CI, etc.)
2. This creates visual separation between different types of changes${language !== 'en' ? `

## LANGUAGE REQUIREMENT

⚠️ CRITICAL: Write the ENTIRE changelog in **${language}** language directly.
- Do NOT write in English first
- Write all descriptions and explanations directly in ${language}
- Translate commit subjects: "translated subject [hash] by @author"
- Keep technical details unchanged (hashes, usernames, URLs, code)
- Keep emojis and markdown formatting as-is

Example for Russian (ru):
- Original commit: "feat: add OAuth2 [a1b2c3d] by @john"
- In changelog: "добавить OAuth2 [a1b2c3d] by @john"` : ''}
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
  repository: { owner: string; repo: string },
  language: string = 'en'
): string {
  const grouped = groupCommitsByType(commits);
  const types = sortCommitTypes(Array.from(grouped.keys()));

  // Simple translation map for headers
  const translations: Record<string, Record<string, string>> = {
    ru: {
      "What's Changed": "Что изменилось"
    }
  };

  const whatsChangedText = translations[language]?.["What's Changed"] || "What's Changed";
  let changelog = `## ${whatsChangedText}\n\n`;

  for (const type of types) {
    const typeCommits = grouped.get(type) || [];
    const label = TYPE_LABELS[type] || type;

    changelog += `### ${label}\n\n`;
    for (const commit of typeCommits) {
      changelog += `- ${formatCommit(commit, false)}\n`;
    }
    changelog += '\n';
  }

  return changelog;
}

