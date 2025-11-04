/**
 * AI integration module for changelog generation
 */

import { warning, info } from '@actions/core';
import type { AIContext, CommitInfo, ParsedCommit } from './types.js';
import { generateSystemPrompt, generateUserPrompt, parseToolRequests } from './prompts.js';
import { executeTool } from './ai-tools.js';

/**
 * OpenAI API configuration
 */
interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

/**
 * Maximum iterations for tool use loop
 * Increased to handle repositories with many commits
 */
const MAX_ITERATIONS = 15;

/**
 * Generate changelog using AI with tool support
 */
export async function generateAIChangelog(
  context: AIContext,
  config: OpenAIConfig
): Promise<string> {
  const systemPrompt = generateSystemPrompt();
  const userPrompt = generateUserPrompt(context);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let iteration = 0;
  let finalResponse = '';

  // Tool use loop
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    info(`AI iteration ${iteration}/${MAX_ITERATIONS}`);

    const response = await callOpenAI(messages, config);
    info(`AI response length: ${response.length} chars`);

    const toolRequests = parseToolRequests(response);

    // If no tool requests, we have the final response
    if (toolRequests.length === 0) {
      info('No tool requests found, treating as final response');
      finalResponse = response;
      break;
    }

    // Execute tools
    info(`Found ${toolRequests.length} tool request(s): ${toolRequests.map(r => r.tool).join(', ')}`);
    const toolResults: string[] = [];

    for (const request of toolRequests) {
      try {
        const result = await executeTool(
          request.tool,
          request.arguments,
          {
            commits: context.commits.map(c => c.commit),
            parsedCommits: context.commits,
          }
        );
        toolResults.push(`**Tool**: ${request.tool}\n**Result**:\n${result}`);
      } catch (error) {
        toolResults.push(`**Tool**: ${request.tool}\n**Error**: ${error}`);
      }
    }

    // Add tool results to conversation
    messages.push(
      { role: 'assistant', content: response },
      { role: 'user', content: `Tool results:\n\n${toolResults.join('\n\n---\n\n')}` }
    );
  }

  if (!finalResponse) {
    throw new Error('AI did not provide a final response after tool use');
  }

  return cleanupResponse(finalResponse);
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  messages: Array<{ role: string; content: string }>,
  config: OpenAIConfig
): Promise<string> {
  const url = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl}/chat/completions`.replace(/\/+/g, '/');

  try {
    // Use globalThis.fetch to ensure compatibility with bundled code
    const fetchFn = globalThis.fetch || fetch;

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error: any) {
    // Provide more detailed error information
    if (error.cause) {
      throw new Error(`Network error calling OpenAI API: ${error.message} (${error.cause})`);
    }
    throw new Error(`Failed to call OpenAI API: ${error.message}`);
  }
}

/**
 * Clean up AI response (remove thinking blocks, extra formatting)
 */
function cleanupResponse(response: string): string {
  // Remove thinking blocks
  let cleaned = response.replace(/<think>[\s\S]*?<\/think>/g, '');

  // Remove tool request blocks
  cleaned = cleaned.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '');

  // Remove multiple consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Generate changelog (with or without AI)
 */
export async function generateChangelog(
  context: AIContext,
  aiConfig?: OpenAIConfig
): Promise<string> {
  if (aiConfig?.apiKey) {
    try {
      info('Generating changelog with AI...');
      return await generateAIChangelog(context, aiConfig);
    } catch (error) {
      warning(`AI changelog generation failed: ${error}. Falling back to simple format.`);
    }
  }

  // Fallback to simple format
  info('Generating simple changelog...');
  const { formatSimpleChangelog } = await import('./prompts.js');
  return formatSimpleChangelog(context.commits, context.stats, context.versionInfo, context.repository);
}
