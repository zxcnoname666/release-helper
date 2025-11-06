/**
 * Beautiful statistics and visualization for code review
 */

import type { ReviewStatistics, ReviewIssue } from '../types/index.js';

/**
 * Generate beautiful statistics report
 */
export function generateStatisticsReport(stats: ReviewStatistics, issues: ReviewIssue[]): string {
  const sections: string[] = [];

  sections.push(generateHeader());
  sections.push(generateOverviewSection(stats));
  sections.push(generateIssuesChart(stats));
  sections.push(generateCategoryDistribution(stats));
  sections.push(generateLanguageDistribution(stats));
  sections.push(generateComplexityGauge(stats.averageComplexity));
  sections.push(generatePerformanceMetrics(stats));
  sections.push(generateTopIssues(issues));

  return sections.join('\n\n');
}

/**
 * Generate header with logo
 */
function generateHeader(): string {
  return `
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║        🤖  AI CODE REVIEW - ANALYSIS COMPLETE  🤖                    ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * Generate overview section
 */
function generateOverviewSection(stats: ReviewStatistics): string {
  const lines: string[] = [];

  lines.push('## 📊 Review Overview\n');
  lines.push('```');
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push(`│  Files Reviewed      │ ${padRight(stats.totalFiles.toString(), 40)} │`);
  lines.push(`│  Total Lines Changed │ ${padRight(stats.totalLines.toString(), 40)} │`);
  lines.push(`│  Lines Added         │ ${padRight(`+${stats.additions}`, 40)} │`);
  lines.push(`│  Lines Deleted       │ ${padRight(`-${stats.deletions}`, 40)} │`);
  lines.push(`│  Review Time         │ ${padRight(formatDuration(stats.reviewTime), 40)} │`);
  lines.push(`│  Tokens Used         │ ${padRight(stats.tokensUsed.toLocaleString(), 40)} │`);
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate issues chart
 */
function generateIssuesChart(stats: ReviewStatistics): string {
  const lines: string[] = [];

  lines.push('## 🎯 Issues Found\n');

  const maxIssues = Math.max(
    stats.criticalIssues,
    stats.warningIssues,
    stats.infoIssues,
    1
  );

  const criticalBar = generateBar(stats.criticalIssues, maxIssues, 40, '🔴');
  const warningBar = generateBar(stats.warningIssues, maxIssues, 40, '⚠️');
  const infoBar = generateBar(stats.infoIssues, maxIssues, 40, '📘');

  lines.push('```');
  lines.push(`Critical  ${criticalBar} ${stats.criticalIssues}`);
  lines.push(`Warnings  ${warningBar} ${stats.warningIssues}`);
  lines.push(`Info      ${infoBar} ${stats.infoIssues}`);
  lines.push('                                              ');
  lines.push(`Total Issues: ${stats.issuesFound}`);
  lines.push(`Files with Issues: ${stats.filesWithIssues}/${stats.totalFiles}`);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate category distribution pie chart
 */
function generateCategoryDistribution(stats: ReviewStatistics): string {
  if (Object.keys(stats.categoryCounts).length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## 📁 Issues by Category\n');
  lines.push('```');

  const total = Object.values(stats.categoryCounts).reduce((sum, count) => sum + count, 0);

  const sortedCategories = Object.entries(stats.categoryCounts).sort((a, b) => b[1] - a[1]);

  for (const [category, count] of sortedCategories) {
    const percentage = Math.round((count / total) * 100);
    const bar = generateBar(count, total, 30, '█');
    const icon = getCategoryIcon(category);

    lines.push(`${icon} ${padRight(category, 15)} ${bar} ${count} (${percentage}%)`);
  }

  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate language distribution
 */
function generateLanguageDistribution(stats: ReviewStatistics): string {
  if (Object.keys(stats.languageDistribution).length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## 🗣️ Language Distribution\n');
  lines.push('```');

  const total = Object.values(stats.languageDistribution).reduce((sum, count) => sum + count, 0);

  const sortedLangs = Object.entries(stats.languageDistribution).sort((a, b) => b[1] - a[1]);

  for (const [lang, count] of sortedLangs) {
    const percentage = Math.round((count / total) * 100);
    const bar = generateBar(count, total, 25, '▓');

    lines.push(`${padRight(lang, 12)} ${bar} ${percentage}%`);
  }

  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate complexity gauge
 */
function generateComplexityGauge(complexity: number): string {
  const lines: string[] = [];

  lines.push('## 🎚️ Average Complexity\n');

  // Complexity levels
  let level: string;
  let color: string;
  let icon: string;

  if (complexity <= 5) {
    level = 'LOW';
    color = 'GREEN';
    icon = '✅';
  } else if (complexity <= 10) {
    level = 'MODERATE';
    color = 'YELLOW';
    icon = '⚠️';
  } else if (complexity <= 20) {
    level = 'HIGH';
    color = 'ORANGE';
    icon = '🟠';
  } else {
    level = 'VERY HIGH';
    color = 'RED';
    icon = '🔴';
  }

  lines.push('```');
  lines.push('┌─────────────────────────────────────────┐');
  lines.push('│  Complexity Gauge                       │');
  lines.push('├─────────────────────────────────────────┤');
  lines.push('│                                         │');
  lines.push(`│      ${icon} ${padRight(level, 15)} ${padRight(complexity.toFixed(1), 10)}  │`);
  lines.push('│                                         │');

  // Draw gauge
  const gaugePos = Math.min(Math.floor((complexity / 30) * 35), 35);
  const gauge = '│  ' + '░'.repeat(gaugePos) + '█' + '░'.repeat(35 - gaugePos) + '  │';
  lines.push(gauge);

  lines.push('│  0                                  30+ │');
  lines.push('└─────────────────────────────────────────┘');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate performance metrics
 */
function generatePerformanceMetrics(stats: ReviewStatistics): string {
  const linesPerSecond = Math.round(stats.totalLines / (stats.reviewTime / 1000));
  const filesPerMinute = Math.round((stats.totalFiles / stats.reviewTime) * 60000);

  const lines: string[] = [];

  lines.push('## ⚡ Performance Metrics\n');
  lines.push('```');
  lines.push(`⏱️  Review Time:       ${formatDuration(stats.reviewTime)}`);
  lines.push(`📄 Files/Minute:      ${filesPerMinute}`);
  lines.push(`📝 Lines/Second:      ${linesPerSecond}`);
  lines.push(`🤖 Tokens Used:       ${stats.tokensUsed.toLocaleString()}`);
  lines.push(`💰 Approx Cost:       $${estimateCost(stats.tokensUsed)}`);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate top issues table
 */
function generateTopIssues(issues: ReviewIssue[]): string {
  if (issues.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## 🔝 Top Issues to Address\n');

  // Sort by severity and take top 10
  const sortOrder = { critical: 0, error: 1, warning: 2, info: 3 };
  const topIssues = issues
    .sort((a, b) => sortOrder[a.severity] - sortOrder[b.severity])
    .slice(0, 10);

  for (let i = 0; i < topIssues.length; i++) {
    const issue = topIssues[i];
    const icon = getSeverityIcon(issue.severity);
    const categoryIcon = getCategoryIcon(issue.category);

    lines.push(`### ${i + 1}. ${icon} ${issue.title}`);
    lines.push('');
    lines.push(`**File**: \`${issue.file}${issue.line ? `:${issue.line}` : ''}\``);
    lines.push(`**Category**: ${categoryIcon} ${issue.category}`);
    lines.push(`**Severity**: ${issue.severity}`);
    lines.push('');
    lines.push(issue.description);

    if (issue.suggestion) {
      lines.push('');
      lines.push('**Suggested Fix**:');
      lines.push(issue.suggestion);
    }

    if (issue.code) {
      lines.push('');
      lines.push('```');
      lines.push(issue.code);
      lines.push('```');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Helper functions
 */

function generateBar(value: number, max: number, width: number, char: string): string {
  const filledWidth = Math.round((value / max) * width);
  return char.repeat(filledWidth) + '░'.repeat(width - filledWidth);
}

function padRight(str: string, width: number): string {
  return str + ' '.repeat(Math.max(0, width - str.length));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function estimateCost(tokens: number): string {
  // Rough estimate based on GPT-4 pricing (~$0.03 per 1K tokens)
  const cost = (tokens / 1000) * 0.03;
  return cost.toFixed(4);
}

function getSeverityIcon(severity: string): string {
  const icons: Record<string, string> = {
    critical: '🔴',
    error: '❌',
    warning: '⚠️',
    info: '📘',
  };
  return icons[severity] || '❓';
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    bug: '🐛',
    security: '🔒',
    performance: '⚡',
    style: '🎨',
    'best-practice': '⭐',
    maintainability: '🔧',
  };
  return icons[category] || '📝';
}

/**
 * Generate summary badge
 */
export function generateSummaryBadge(stats: ReviewStatistics): string {
  const status = stats.criticalIssues > 0 ? '🔴 NEEDS ATTENTION' : stats.warningIssues > 0 ? '⚠️ REVIEW NEEDED' : '✅ LOOKS GOOD';

  return `
╔════════════════════════════════════════╗
║                                        ║
║  ${status.padEnd(38)}║
║                                        ║
║  Issues: ${String(stats.issuesFound).padEnd(30)}║
║  Critical: ${String(stats.criticalIssues).padEnd(28)}║
║  Warnings: ${String(stats.warningIssues).padEnd(28)}║
║                                        ║
╚════════════════════════════════════════╝
`;
}
