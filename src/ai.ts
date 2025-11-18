/**
 * AI integration module for changelog generation
 */

import { warning, info } from '@actions/core';
import type { AIContext, CommitInfo, ParsedCommit } from './types.js';
import { generateSystemPrompt, generateUserPrompt } from './prompts.js';
import { executeTool, AI_TOOLS } from './ai-tools.js';

/**
 * OpenAI API configuration
 */
interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

/**
 * OpenAI message types
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIResponse {
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

/**
 * Maximum iterations for tool use loop
 * Increased to handle repositories with many commits
 */
const MAX_ITERATIONS = 15;

/**
 * Convert AI_TOOLS to OpenAI tools format
 */
function convertToolsToOpenAIFormat() {
  return AI_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Generate changelog using AI with tool support
 */
export async function generateAIChangelog(
  context: AIContext,
  config: OpenAIConfig
): Promise<string> {
  const systemPrompt = generateSystemPrompt(context.language);
  const userPrompt = generateUserPrompt(context);

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const tools = convertToolsToOpenAIFormat();
  let iteration = 0;
  let finalResponse = '';

  // Tool use loop
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    info(`AI iteration ${iteration}/${MAX_ITERATIONS}`);

    const response = await callOpenAI(messages, config, tools);

    // If AI wants to use tools
    if (response.tool_calls && response.tool_calls.length > 0) {
      info(`AI requested ${response.tool_calls.length} tool call(s): ${response.tool_calls.map(tc => tc.function.name).join(', ')}`);

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });

      // Execute each tool and add results
      for (const toolCall of response.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeTool(
            toolCall.function.name,
            args,
            {
              commits: context.commits.map(c => c.commit),
              parsedCommits: context.commits,
              versionInfo: context.versionInfo,
            }
          );

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: result,
          });
        } catch (error) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: `Error: ${error}`,
          });
        }
      }

      continue;
    }

    // No tool calls - this is the final response
    if (response.content) {
      info('AI provided final response');
      finalResponse = response.content.trim();
      break;
    }

    // Empty response
    warning(`AI returned empty response at iteration ${iteration}`);
    if (iteration > 1) {
      messages.push({
        role: 'user',
        content: 'Please provide the complete changelog now based on the tool results you received.',
      });
    } else {
      throw new Error('AI returned empty response on first iteration');
    }
  }

  if (!finalResponse) {
    throw new Error('AI did not provide a final response after tool use');
  }

  // Log before cleanup for debugging
  info(`Final response length before cleanup: ${finalResponse.length} chars`);

  // Clean up the response
  const cleaned = cleanupResponse(finalResponse);

  // Validate that cleanup didn't remove all content
  if (!cleaned || cleaned.trim().length === 0) {
    warning('Cleanup removed all content from AI response, returning original');
    info(`Original response length: ${finalResponse.length} chars`);
    info(`Response preview: ${finalResponse.substring(0, 200)}...`);
    // Return original if cleanup was too aggressive
    return finalResponse.trim();
  }

  info(`Final response length after cleanup: ${cleaned.length} chars`);
  return cleaned;
}

/**
 * Call OpenAI API with tools support
 */
async function callOpenAI(
  messages: OpenAIMessage[],
  config: OpenAIConfig,
  tools?: any[]
): Promise<OpenAIResponse> {
  const url = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl}/chat/completions`.replace(/\/+/g, '/');

  try {
    // Use globalThis.fetch to ensure compatibility with bundled code
    const fetchFn = globalThis.fetch || fetch;

    const requestBody: any = {
      model: config.model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    return {
      content: message?.content || null,
      tool_calls: message?.tool_calls,
    };
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
  let cleaned = response;

  // Remove thinking blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');

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
  return formatSimpleChangelog(context.commits, context.stats, context.versionInfo, context.repository, context.language);
}
