/**
 * AI Tools Registry - Central registry for all AI tools
 */

import type { AITool, ToolCall, ToolResult, FileChange } from '../types/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { exec } from '@actions/exec';
import { parseFile } from '../analysis/ast-parser.js';
import { lintFile } from '../analysis/linter-runner.js';
import { buildCallGraph, visualizeCallGraph, getImpactAnalysis } from '../analysis/call-graph.js';

/**
 * Tool execution context
 */
export interface ToolContext {
  workdir: string;
  files: FileChange[];
  baseSha: string;
  headSha: string;
}

/**
 * All available tools for AI
 */
export const AI_TOOLS: AITool[] = [
  {
    name: 'read_file',
    description: 'Read the complete content of a file from the repository. Use this to see the full context of a file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to repository root',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_file_diff',
    description: 'Get the git diff for a specific file. Shows what was changed (additions/deletions).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file',
        },
        context_lines: {
          type: 'number',
          description: 'Number of context lines around changes (default: 3)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'analyze_file_ast',
    description: 'Perform deep AST (Abstract Syntax Tree) analysis on a file. Returns functions, classes, imports, and code metrics.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to analyze',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'find_function_callers',
    description: 'Find all places where a function is called. Useful for understanding the impact of changes.',
    parameters: {
      type: 'object',
      properties: {
        function_name: {
          type: 'string',
          description: 'Name of the function to find callers for',
        },
        file_path: {
          type: 'string',
          description: 'Path to the file containing the function',
        },
      },
      required: ['function_name', 'file_path'],
    },
  },
  {
    name: 'find_function_dependencies',
    description: 'Find all functions that a given function depends on (calls). Shows the dependency tree.',
    parameters: {
      type: 'object',
      properties: {
        function_name: {
          type: 'string',
          description: 'Name of the function',
        },
        file_path: {
          type: 'string',
          description: 'Path to the file containing the function',
        },
      },
      required: ['function_name', 'file_path'],
    },
  },
  {
    name: 'run_linter',
    description: 'Run linter on a file to find potential issues, style violations, and code quality problems.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to lint',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a pattern in the codebase using grep. Useful for finding similar patterns or usages.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Pattern to search for (supports regex)',
        },
        file_pattern: {
          type: 'string',
          description: 'File pattern to search in (e.g., "*.ts", "src/**/*.js")',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'get_commit_info',
    description: 'Get detailed information about a specific commit, including message, author, and files changed.',
    parameters: {
      type: 'object',
      properties: {
        sha: {
          type: 'string',
          description: 'Commit SHA (can be short or full)',
        },
      },
      required: ['sha'],
    },
  },
  {
    name: 'get_file_history',
    description: 'Get the recent commit history for a specific file. Useful for understanding the evolution of a file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of commits to return (default: 10)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'analyze_function_complexity',
    description: 'Analyze cyclomatic complexity and other metrics for a specific function.',
    parameters: {
      type: 'object',
      properties: {
        function_name: {
          type: 'string',
          description: 'Name of the function to analyze',
        },
        file_path: {
          type: 'string',
          description: 'Path to the file containing the function',
        },
      },
      required: ['function_name', 'file_path'],
    },
  },
];

/**
 * Execute a tool with given parameters
 */
export async function executeTool(
  tool: ToolCall,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const result = await executeToolInternal(tool, context);
    return {
      name: tool.name,
      result,
    };
  } catch (error: any) {
    return {
      name: tool.name,
      result: '',
      error: error.message || String(error),
    };
  }
}

/**
 * Internal tool execution logic
 */
async function executeToolInternal(tool: ToolCall, context: ToolContext): Promise<string> {
  const { name, arguments: args } = tool;

  switch (name) {
    case 'read_file':
      return await readFile(args.path, context);

    case 'get_file_diff':
      return await getFileDiff(args.path, args.context_lines || 3, context);

    case 'analyze_file_ast':
      return await analyzeFileAST(args.path, context);

    case 'find_function_callers':
      return await findFunctionCallers(args.function_name, args.file_path, context);

    case 'find_function_dependencies':
      return await findFunctionDependencies(args.function_name, args.file_path, context);

    case 'run_linter':
      return await runLinter(args.path, context);

    case 'search_code':
      return await searchCode(args.pattern, args.file_pattern, context);

    case 'get_commit_info':
      return await getCommitInfo(args.sha, context);

    case 'get_file_history':
      return await getFileHistory(args.path, args.limit || 10, context);

    case 'analyze_function_complexity':
      return await analyzeFunctionComplexity(args.function_name, args.file_path, context);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Tool implementations
 */

async function readFile(path: string, context: ToolContext): Promise<string> {
  try {
    const fullPath = join(context.workdir, path);
    const content = readFileSync(fullPath, 'utf-8');

    return `\`\`\`
File: ${path}
Lines: ${content.split('\n').length}

${content}
\`\`\``;
  } catch (error) {
    throw new Error(`Failed to read file: ${error}`);
  }
}

async function getFileDiff(path: string, contextLines: number, context: ToolContext): Promise<string> {
  let output = '';

  await exec(
    'git',
    ['diff', `-U${contextLines}`, context.baseSha, context.headSha, '--', path],
    {
      cwd: context.workdir,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    }
  );

  if (!output.trim()) {
    return `No changes in ${path}`;
  }

  return `\`\`\`diff
${output}
\`\`\``;
}

async function analyzeFileAST(path: string, context: ToolContext): Promise<string> {
  const fullPath = join(context.workdir, path);
  const content = readFileSync(fullPath, 'utf-8');

  const analysis = await parseFile(content, path);

  const lines: string[] = [];
  lines.push(`## AST Analysis: ${path}\n`);

  lines.push(`### Metrics`);
  lines.push(`- Lines of code: ${analysis.metrics.linesOfCode}`);
  lines.push(`- Complexity: ${analysis.metrics.complexity}`);
  lines.push(`- Maintainability: ${analysis.metrics.maintainabilityIndex}`);
  lines.push(`- Functions: ${analysis.metrics.functionCount}`);
  lines.push(`- Classes: ${analysis.metrics.classCount}`);
  lines.push(`- Comment ratio: ${(analysis.metrics.commentRatio * 100).toFixed(1)}%\n`);

  if (analysis.functions.length > 0) {
    lines.push(`### Functions (${analysis.functions.length})`);
    for (const func of analysis.functions) {
      lines.push(`- **${func.name}** (line ${func.line})`);
      lines.push(`  - Params: ${func.params.join(', ') || 'none'}`);
      lines.push(`  - Complexity: ${func.complexity}`);
      lines.push(`  - Async: ${func.isAsync ? 'yes' : 'no'}`);
      lines.push(`  - Exported: ${func.isExported ? 'yes' : 'no'}`);
      if (func.calls && func.calls.length > 0) {
        lines.push(`  - Calls: ${func.calls.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (analysis.dependencies.length > 0) {
    lines.push(`### Dependencies (${analysis.dependencies.length})`);
    for (const dep of analysis.dependencies) {
      const type = dep.isExternal ? '📦 external' : '📁 local';
      lines.push(`- ${type}: ${dep.source} (line ${dep.line})`);
      if (dep.specifiers.length > 0) {
        lines.push(`  - Imports: ${dep.specifiers.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
}

async function findFunctionCallers(funcName: string, filePath: string, context: ToolContext): Promise<string> {
  // For now, use grep to find callers
  // TODO: Integrate with call graph when analyzing all files
  let output = '';

  await exec(
    'git',
    ['grep', '-n', `${funcName}\\(`, context.headSha],
    {
      cwd: context.workdir,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    }
  );

  if (!output.trim()) {
    return `No callers found for ${funcName}`;
  }

  const lines = output.trim().split('\n');
  const result: string[] = [];
  result.push(`## Callers of ${funcName}\n`);
  result.push(`Found ${lines.length} potential call sites:\n`);

  for (const line of lines.slice(0, 20)) {
    // Limit to 20
    result.push(`- ${line}`);
  }

  if (lines.length > 20) {
    result.push(`\n... and ${lines.length - 20} more`);
  }

  return result.join('\n');
}

async function findFunctionDependencies(funcName: string, filePath: string, context: ToolContext): Promise<string> {
  const fullPath = join(context.workdir, filePath);
  const content = readFileSync(fullPath, 'utf-8');

  const analysis = await parseFile(content, filePath);
  const func = analysis.functions.find(f => f.name === funcName);

  if (!func) {
    return `Function ${funcName} not found in ${filePath}`;
  }

  const lines: string[] = [];
  lines.push(`## Dependencies of ${funcName}\n`);

  if (func.calls && func.calls.length > 0) {
    lines.push(`Directly calls ${func.calls.length} function(s):\n`);
    for (const call of func.calls) {
      lines.push(`- ${call}`);
    }
  } else {
    lines.push('This function does not call any other functions.');
  }

  return lines.join('\n');
}

async function runLinter(path: string, context: ToolContext): Promise<string> {
  const results = await lintFile(path, context.workdir);

  if (results.length === 0) {
    return `✅ No linter issues found in ${path}`;
  }

  const lines: string[] = [];
  lines.push(`## Linter Results: ${path}\n`);
  lines.push(`Found ${results.length} issue(s):\n`);

  const grouped = new Map<string, typeof results>();
  for (const result of results) {
    const severity = result.severity;
    if (!grouped.has(severity)) {
      grouped.set(severity, []);
    }
    grouped.get(severity)!.push(result);
  }

  for (const [severity, items] of grouped.entries()) {
    const icon = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
    lines.push(`### ${icon} ${severity.toUpperCase()} (${items.length})\n`);

    for (const item of items.slice(0, 10)) {
      lines.push(`- Line ${item.line}:${item.column} - ${item.message} (\`${item.ruleId}\`)`);
    }

    if (items.length > 10) {
      lines.push(`\n... and ${items.length - 10} more ${severity} issues`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function searchCode(pattern: string, filePattern: string | undefined, context: ToolContext): Promise<string> {
  let output = '';

  const args = ['grep', '-n', pattern];
  if (filePattern) {
    args.push('--', filePattern);
  }

  await exec('git', args, {
    cwd: context.workdir,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  });

  if (!output.trim()) {
    return `No matches found for pattern: ${pattern}`;
  }

  const lines = output.trim().split('\n');
  const result: string[] = [];
  result.push(`## Search Results for: ${pattern}\n`);
  result.push(`Found ${lines.length} match(es):\n`);

  for (const line of lines.slice(0, 30)) {
    result.push(`- ${line}`);
  }

  if (lines.length > 30) {
    result.push(`\n... and ${lines.length - 30} more matches`);
  }

  return result.join('\n');
}

async function getCommitInfo(sha: string, context: ToolContext): Promise<string> {
  let output = '';

  await exec('git', ['show', '--stat', '--pretty=format:%H%n%an%n%ae%n%at%n%s%n%b', sha], {
    cwd: context.workdir,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  });

  return `\`\`\`
${output}
\`\`\``;
}

async function getFileHistory(path: string, limit: number, context: ToolContext): Promise<string> {
  let output = '';

  await exec(
    'git',
    ['log', `--max-count=${limit}`, '--pretty=format:%h - %an, %ar : %s', '--', path],
    {
      cwd: context.workdir,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    }
  );

  if (!output.trim()) {
    return `No history found for ${path}`;
  }

  return `## File History: ${path}\n\n${output}`;
}

async function analyzeFunctionComplexity(funcName: string, filePath: string, context: ToolContext): Promise<string> {
  const fullPath = join(context.workdir, filePath);
  const content = readFileSync(fullPath, 'utf-8');

  const analysis = await parseFile(content, filePath);
  const func = analysis.functions.find(f => f.name === funcName);

  if (!func) {
    return `Function ${funcName} not found in ${filePath}`;
  }

  const lines: string[] = [];
  lines.push(`## Complexity Analysis: ${funcName}\n`);
  lines.push(`File: ${filePath}`);
  lines.push(`Line: ${func.line}\n`);
  lines.push(`### Metrics`);
  lines.push(`- Cyclomatic Complexity: ${func.complexity}`);
  lines.push(`- Parameters: ${func.params.length}`);
  lines.push(`- Async: ${func.isAsync ? 'Yes' : 'No'}`);
  lines.push(`- Exported: ${func.isExported ? 'Yes' : 'No'}`);

  if (func.calls) {
    lines.push(`- Function calls: ${func.calls.length}`);
  }

  lines.push('\n### Assessment');
  const complexity = func.complexity || 0;
  if (complexity <= 5) {
    lines.push('✅ Low complexity - Easy to understand and maintain');
  } else if (complexity <= 10) {
    lines.push('⚠️ Moderate complexity - Consider refactoring if it grows');
  } else if (complexity <= 20) {
    lines.push('❌ High complexity - Should be refactored');
  } else {
    lines.push('🔴 Very high complexity - Refactoring required');
  }

  return lines.join('\n');
}
