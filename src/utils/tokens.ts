/**
 * Token estimation and management utilities
 */

/**
 * Estimate token count for text (rough approximation)
 * GPT tokenization: ~4 chars per token for English, ~2-3 for code
 */
export function estimateTokens(text: string): number {
  // For code, use a more conservative estimate
  const codeIndicators = ['{', '}', '(', ')', ';', 'function', 'class', 'const', 'let'];
  const isCode = codeIndicators.some(indicator => text.includes(indicator));

  const charsPerToken = isCode ? 2.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for a diff
 */
export function estimateDiffTokens(diff: string): number {
  const lines = diff.split('\n');
  // Diff lines with context need more tokens
  const tokenCount = lines.reduce((sum, line) => {
    if (line.startsWith('+') || line.startsWith('-')) {
      return sum + estimateTokens(line) * 1.2; // Changed lines get more weight
    }
    return sum + estimateTokens(line);
  }, 0);

  return Math.ceil(tokenCount);
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);

  if (estimatedTokens <= maxTokens) {
    return text;
  }

  const ratio = maxTokens / estimatedTokens;
  const targetLength = Math.floor(text.length * ratio * 0.9); // 10% buffer

  const truncated = text.substring(0, targetLength);
  return truncated + '\n\n... (truncated)';
}

/**
 * Split text into chunks by token limit
 */
export function splitByTokens(text: string, maxTokens: number): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line) + 1; // +1 for newline

    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [line];
      currentTokens = lineTokens;
    } else {
      currentChunk.push(line);
      currentTokens += lineTokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}

/**
 * Get summary of token usage
 */
export function getTokenSummary(texts: string[]): {
  total: number;
  average: number;
  max: number;
  min: number;
} {
  const counts = texts.map(estimateTokens);

  return {
    total: counts.reduce((sum, count) => sum + count, 0),
    average: Math.round(counts.reduce((sum, count) => sum + count, 0) / counts.length),
    max: Math.max(...counts),
    min: Math.min(...counts),
  };
}
