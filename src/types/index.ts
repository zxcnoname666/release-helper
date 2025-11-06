/**
 * Core types for AI Code Review Tool
 */

// ============== Configuration ==============

export interface ReviewConfig {
  githubToken: string;
  openaiApiKey?: string;
  openaiApiModel?: string;
  openaiApiBaseUrl?: string;
  reviewLanguage: string;
  silentMode: boolean;
  maxChunkSize: number;
  enableLinters: boolean;
  enableAST: boolean;
  enableDependencyAnalysis: boolean;
  severityThreshold: 'info' | 'warning' | 'error';
}

// ============== GitHub Types ==============

export interface PullRequestInfo {
  number: number;
  title: string;
  body: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
  blob_url: string;
  language?: string;
}

export interface ReviewComment {
  path: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  startLine?: number;
  startSide?: 'LEFT' | 'RIGHT';
}

// ============== AI Types ==============

export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  name: string;
  result: string | object;
  error?: string;
}

// ============== Code Analysis Types ==============

export interface ASTNode {
  type: string;
  name?: string;
  start: number;
  end: number;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  children?: ASTNode[];
  metadata?: Record<string, any>;
}

export interface FunctionInfo {
  name: string;
  line: number;
  column: number;
  params: string[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  complexity?: number;
  calls?: string[];
}

export interface DependencyInfo {
  type: 'import' | 'require' | 'dynamic';
  source: string;
  specifiers: string[];
  line: number;
  isExternal: boolean;
}

export interface CallGraphNode {
  name: string;
  file: string;
  line: number;
  callers: CallGraphEdge[];
  callees: CallGraphEdge[];
}

export interface CallGraphEdge {
  from: string;
  to: string;
  file: string;
  line: number;
}

export interface LintResult {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  ruleId: string;
  source?: string;
}

// ============== Analysis Results ==============

export interface FileAnalysis {
  filename: string;
  language: string;
  ast?: ASTNode;
  functions: FunctionInfo[];
  dependencies: DependencyInfo[];
  lintResults: LintResult[];
  metrics: CodeMetrics;
  callGraph?: CallGraphNode[];
}

export interface CodeMetrics {
  linesOfCode: number;
  complexity: number;
  maintainabilityIndex: number;
  commentRatio: number;
  functionCount: number;
  classCount: number;
}

export interface ChunkAnalysis {
  files: FileChange[];
  totalSize: number;
  analysis: FileAnalysis[];
}

// ============== Review Results ==============

export interface ReviewIssue {
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'bug' | 'security' | 'performance' | 'style' | 'best-practice' | 'maintainability';
  file: string;
  line?: number;
  title: string;
  description: string;
  suggestion?: string;
  code?: string;
}

export interface ReviewSummary {
  overall: 'approved' | 'needs-changes' | 'rejected';
  issues: ReviewIssue[];
  strengths: string[];
  improvements: string[];
  securityConcerns: string[];
  performanceConcerns: string[];
}

export interface ReviewStatistics {
  totalFiles: number;
  totalLines: number;
  additions: number;
  deletions: number;
  issuesFound: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  filesWithIssues: number;
  averageComplexity: number;
  reviewTime: number;
  tokensUsed: number;
  categoryCounts: Record<string, number>;
  languageDistribution: Record<string, number>;
}

// ============== Chunking ==============

export interface Chunk {
  id: string;
  files: FileChange[];
  totalChanges: number;
  estimatedTokens: number;
  reason: string;
}

export interface ChunkStrategy {
  name: string;
  maxTokensPerChunk: number;
  groupByModule: boolean;
  groupByType: boolean;
}
