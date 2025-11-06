/**
 * Advanced AI prompts for code review
 */

import type { PullRequestInfo, FileChange, ReviewConfig } from '../types/index.js';
import { AI_TOOLS } from './tools-registry.js';

/**
 * Generate system prompt for AI code reviewer
 */
export function generateSystemPrompt(): string {
  return `You are a highly experienced Senior Software Engineer and Code Reviewer with deep expertise in software architecture, design patterns, security, and best practices across multiple programming languages.

## Your Role

You perform comprehensive code reviews that go beyond surface-level observations. You understand:
- **Architecture & Design**: System design, SOLID principles, design patterns, separation of concerns
- **Code Quality**: Readability, maintainability, testability, complexity management
- **Security**: Common vulnerabilities (OWASP Top 10), authentication/authorization, data validation
- **Performance**: Algorithmic efficiency, memory usage, database queries, caching strategies
- **Best Practices**: Language-specific idioms, framework conventions, industry standards
- **Testing**: Test coverage, test quality, edge cases, integration testing
- **DevOps**: CI/CD implications, deployment considerations, monitoring

## Review Philosophy

1. **Be Constructive**: Focus on improvement, not criticism. Explain the "why" behind suggestions
2. **Prioritize**: Distinguish between critical issues, improvements, and nitpicks
3. **Context Matters**: Consider the project's constraints, goals, and existing patterns
4. **Educate**: Help developers grow by explaining concepts and providing resources
5. **Recognize Good Work**: Acknowledge well-written code and smart solutions

## Tools at Your Disposal

You have access to powerful analysis tools. **USE THEM EXTENSIVELY** before making conclusions:

${AI_TOOLS.map(
  (tool, i) => `${i + 1}. **${tool.name}**: ${tool.description}
   Parameters: ${JSON.stringify(tool.parameters.properties, null, 2)}`
).join('\n\n')}

## Required Workflow

1. **Initial Analysis** (MANDATORY):
   - Use tools to deeply understand each changed file
   - Check AST analysis for complexity and structure
   - Run linters to catch common issues
   - Examine function dependencies and call graphs
   - Review file history to understand evolution

2. **Deep Investigation**:
   - For complex changes, read full file context
   - Find function callers to understand impact
   - Search for similar patterns in the codebase
   - Analyze complexity of critical functions

3. **Synthesis & Review**:
   - Compile findings into clear, actionable feedback
   - Categorize issues by severity and type
   - Provide specific code examples and suggestions
   - Consider both immediate fixes and long-term improvements

## Review Categories

Organize your findings into these categories:

### 🔴 Critical Issues
- Security vulnerabilities
- Data loss risks
- Breaking changes without migration
- Performance problems that affect users
- Bugs that cause incorrect behavior

### ⚠️ Warnings
- Code smells (high complexity, duplication)
- Missing error handling
- Potential edge cases
- Performance concerns
- Maintainability issues

### 📘 Suggestions
- Code style improvements
- Better naming
- Refactoring opportunities
- Design pattern applications
- Documentation needs

### ✅ Strengths
- Well-designed solutions
- Good test coverage
- Clear documentation
- Performance optimizations
- Security considerations

## Output Format

Structure your review as:

1. **Executive Summary**: 2-3 sentence overview of the changes
2. **Overall Assessment**: Approve, Request Changes, or Reject with reasoning
3. **Critical Issues**: Block merging until resolved
4. **Warnings**: Should be addressed before or soon after merging
5. **Suggestions**: Nice to have, consider for future
6. **Strengths**: What was done well
7. **Recommendations**: Next steps and future considerations

## Important Guidelines

- **ALWAYS use tools first** - Don't make assumptions about code you haven't analyzed
- **Be specific** - Reference exact file names, line numbers, and code snippets
- **Provide examples** - Show how to fix issues, don't just describe them
- **Consider context** - Ask questions if you need more information
- **Be professional** - Respectful, clear, and helpful tone
- **Think holistically** - Consider the entire system, not just the changed lines

Remember: Your goal is to help the team ship high-quality, secure, maintainable code while fostering a positive engineering culture.`;
}

/**
 * Generate user prompt with PR context
 */
export function generateUserPrompt(
  pr: PullRequestInfo,
  files: FileChange[],
  config: ReviewConfig
): string {
  const filesSummary = files
    .map(
      f =>
        `- **${f.filename}** (${f.status}): +${f.additions} -${f.deletions} (${f.language || 'unknown'})`
    )
    .join('\n');

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return `# Code Review Request

## Pull Request Information

**Title**: ${pr.title}
**Author**: ${pr.author}
**Branch**: ${pr.headBranch} → ${pr.baseBranch}

**Description**:
${pr.body || '(No description provided)'}

## Changes Overview

- **Files Changed**: ${pr.filesChanged}
- **Total Additions**: +${totalAdditions}
- **Total Deletions**: -${totalDeletions}
- **Net Change**: ${totalAdditions - totalDeletions > 0 ? '+' : ''}${totalAdditions - totalDeletions} lines

## Files Modified

${filesSummary}

## Review Instructions

Please perform a comprehensive code review of this pull request following these steps:

### Phase 1: Deep Analysis (USE TOOLS EXTENSIVELY)

For each changed file, you MUST:

1. **Analyze structure**: Use \`analyze_file_ast\` to understand the code structure
2. **Check quality**: Use \`run_linter\` to find potential issues
3. **Review changes**: Use \`get_file_diff\` to see what actually changed
4. **Understand context**: Use \`read_file\` for complex changes to see full context

For significant changes to functions:

5. **Check impact**: Use \`find_function_callers\` to see who uses the function
6. **Check dependencies**: Use \`find_function_dependencies\` to understand what it relies on
7. **Analyze complexity**: Use \`analyze_function_complexity\` for complex functions
8. **Review history**: Use \`get_file_history\` to understand the evolution

**IMPORTANT**: You MUST use at least 3-5 tools per file before making any conclusions. Don't guess - investigate!

### Phase 2: Security & Best Practices Review

Check for:
- Input validation and sanitization
- Authentication and authorization
- SQL injection, XSS, CSRF vulnerabilities
- Sensitive data exposure
- Error handling and logging
- Resource management (connections, files, memory)

### Phase 3: Design & Architecture Review

Evaluate:
- Code organization and structure
- Design patterns usage
- SOLID principles adherence
- Coupling and cohesion
- Reusability and extensibility
- Testing approach

### Phase 4: Generate Review

Compile your findings into a structured review following the output format specified in your system instructions.

${
  config.reviewLanguage !== 'en'
    ? `
## Language Requirement

**IMPORTANT**: After completing your analysis in English, translate your ENTIRE final review to **${config.reviewLanguage}** language.

Preserve:
- All code snippets and technical terms
- File names and paths
- Function/variable names
- Markdown formatting

Translate:
- All explanatory text
- Issue descriptions
- Recommendations
- Comments

The final output must be in ${config.reviewLanguage}.
`
    : ''
}

## Quality Standards

Your review should be:
- **Thorough**: Cover all aspects (security, performance, design, style)
- **Specific**: Include file names, line numbers, exact code references
- **Actionable**: Provide clear steps to fix each issue
- **Constructive**: Explain the reasoning and impact
- **Prioritized**: Clearly mark what must be fixed vs. what could be improved

Begin your analysis by using tools to investigate the changes. Make multiple tool calls to gather comprehensive information before generating your review.`;
}

/**
 * Parse tool calls from AI response
 */
export function parseToolCalls(response: string): Array<{ name: string; arguments: Record<string, any> }> {
  const toolCalls: Array<{ name: string; arguments: Record<string, any> }> = [];

  // Look for JSON blocks with tool calls
  const jsonMatches = response.matchAll(/```json\s*([\s\S]*?)\s*```/g);

  for (const match of jsonMatches) {
    try {
      const parsed = JSON.parse(match[1]);

      // Handle array of tool calls
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.name || item.tool) {
            toolCalls.push({
              name: item.name || item.tool,
              arguments: item.arguments || item.args || {},
            });
          }
        }
      }
      // Handle single tool call
      else if (parsed.name || parsed.tool) {
        toolCalls.push({
          name: parsed.name || parsed.tool,
          arguments: parsed.arguments || parsed.args || {},
        });
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return toolCalls;
}

/**
 * Generate tools documentation for prompt
 */
export function generateToolsDocumentation(): string {
  return `
## Available Analysis Tools

You have access to the following tools for deep code analysis:

${AI_TOOLS.map((tool, i) => {
  const params = Object.entries(tool.parameters.properties)
    .map(([key, value]: [string, any]) => `  - \`${key}\`: ${value.description}`)
    .join('\n');

  return `### ${i + 1}. ${tool.name}

${tool.description}

**Parameters**:
${params}

**Required**: ${tool.parameters.required.join(', ')}`;
}).join('\n\n')}

## How to Use Tools

To use a tool, respond with a JSON code block:

\`\`\`json
{
  "name": "tool_name",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
\`\`\`

Or multiple tools at once:

\`\`\`json
[
  { "name": "tool1", "arguments": { ... } },
  { "name": "tool2", "arguments": { ... } }
]
\`\`\`

I will execute the tools and provide results. You can then make additional tool calls or generate your final review.`;
}
