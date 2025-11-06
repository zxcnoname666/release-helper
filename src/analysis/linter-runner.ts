/**
 * Linter integration for various programming languages
 */

import type { LintResult } from '../types/index.js';
import { exec } from '@actions/exec';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Run appropriate linter for a file
 */
export async function lintFile(filename: string, workdir: string = process.cwd()): Promise<LintResult[]> {
  const language = detectLanguageFromFile(filename);

  try {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return await lintJavaScript(filename, workdir);

      case 'python':
        return await lintPython(filename, workdir);

      default:
        return [];
    }
  } catch (error) {
    console.warn(`Linting failed for ${filename}:`, error);
    return [];
  }
}

/**
 * Lint JavaScript/TypeScript files
 */
async function lintJavaScript(filename: string, workdir: string): Promise<LintResult[]> {
  const results: LintResult[] = [];

  // Check if ESLint is available in the project
  const eslintConfigFiles = [
    '.eslintrc.js',
    '.eslintrc.json',
    '.eslintrc.yml',
    '.eslintrc.yaml',
    'eslint.config.js',
  ];

  const hasEslintConfig = eslintConfigFiles.some(config =>
    existsSync(join(workdir, config))
  );

  if (!hasEslintConfig) {
    // No ESLint config found, skip linting
    return results;
  }

  try {
    let output = '';
    let errorOutput = '';

    const exitCode = await exec(
      'npx',
      ['eslint', '--format', 'json', filename],
      {
        cwd: workdir,
        ignoreReturnCode: true,
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString();
          },
          stderr: (data: Buffer) => {
            errorOutput += data.toString();
          },
        },
      }
    );

    if (output) {
      const eslintResults = JSON.parse(output);

      for (const fileResult of eslintResults) {
        for (const message of fileResult.messages || []) {
          results.push({
            file: filename,
            line: message.line,
            column: message.column,
            severity: mapESLintSeverity(message.severity),
            message: message.message,
            ruleId: message.ruleId || 'unknown',
            source: message.source,
          });
        }
      }
    }
  } catch (error) {
    // ESLint not available or failed, return empty results
    console.warn(`ESLint execution failed for ${filename}`);
  }

  return results;
}

/**
 * Lint Python files
 */
async function lintPython(filename: string, workdir: string): Promise<LintResult[]> {
  const results: LintResult[] = [];

  try {
    let output = '';

    await exec('pylint', ['--output-format=json', filename], {
      cwd: workdir,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });

    if (output) {
      const pylintResults = JSON.parse(output);

      for (const message of pylintResults) {
        results.push({
          file: filename,
          line: message.line,
          column: message.column,
          severity: mapPylintSeverity(message.type),
          message: message.message,
          ruleId: message['message-id'] || message.symbol || 'unknown',
        });
      }
    }
  } catch (error) {
    // Pylint not available, return empty results
  }

  return results;
}

/**
 * Detect language from file extension
 */
function detectLanguageFromFile(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
  };

  return langMap[ext || ''] || 'unknown';
}

/**
 * Map ESLint severity to our format
 */
function mapESLintSeverity(severity: number): 'error' | 'warning' | 'info' {
  switch (severity) {
    case 2:
      return 'error';
    case 1:
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Map Pylint severity to our format
 */
function mapPylintSeverity(type: string): 'error' | 'warning' | 'info' {
  switch (type.toLowerCase()) {
    case 'error':
    case 'fatal':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Aggregate lint results
 */
export function aggregateLintResults(results: LintResult[]): {
  total: number;
  errors: number;
  warnings: number;
  info: number;
  byRule: Record<string, number>;
} {
  const byRule: Record<string, number> = {};

  for (const result of results) {
    byRule[result.ruleId] = (byRule[result.ruleId] || 0) + 1;
  }

  return {
    total: results.length,
    errors: results.filter(r => r.severity === 'error').length,
    warnings: results.filter(r => r.severity === 'warning').length,
    info: results.filter(r => r.severity === 'info').length,
    byRule,
  };
}
