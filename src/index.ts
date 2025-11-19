/**
 * Auto Release Action - Main entry point
 * A sophisticated GitHub Action for automated releases with AI-powered changelogs
 */

import { getInput, info, setFailed, warning } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import type { ActionConfig, AIContext, ReleaseStats, VersionInfo } from './types.js';
import { parseReleaseType, createVersionInfo } from './version.js';
import { assertCleanWorkingDir, assertOnBranch, getCommitsBetween as getLocalCommits, getRangeStats, getCommitDate } from './git.js';
import { parseCommits, validateConventionalCommits, getContributors } from './commits.js';
import { getLatestReleaseTag, createTag, getCommitsBetween, createRelease, uploadReleaseAsset, sendDiscordNotification } from './github.js';
import { generateChangelog } from './ai.js';
import { runCommand, getAssetPaths, daysBetween } from './utils.js';
import { generateStatsSection } from './prompts.js';

/**
 * Main action execution
 */
async function run(): Promise<void> {
  try {
    // ====== 1. Parse configuration ======
    const config: ActionConfig = {
      githubToken: getInput('GITHUB_TOKEN', { required: true }),
      lintAndTestsCommand: getInput('LINT_AND_TESTS_COMMAND') || undefined,
      buildCommand: getInput('BUILD_COMMAND') || undefined,
      assetPatterns: (getInput('ASSET_PATTERNS') || '').split(/\s+/).filter(Boolean),
      openaiApiKey: getInput('OPENAI_API_KEY') || undefined,
      openaiApiModel: getInput('OPENAI_API_MODEL') || 'gpt-4',
      openaiApiBaseUrl: getInput('OPENAI_API_BASE_URL') || 'https://api.openai.com/v1',
      discordWebhook: getInput('DISCORD_WEBHOOK') || undefined,
      allowedBranch: getInput('ALLOWED_BRANCH') || 'main',
      draftRelease: getInput('DRAFT_RELEASE') === 'true',
      prerelease: getInput('PRERELEASE') === 'true',
      language: getInput('LANGUAGE') || 'en',
    };

    const octokit = getOctokit(config.githubToken);
    const { owner, repo } = context.repo;
    const sha = context.sha;

    info('🚀 Starting Auto Release Action');
    info(`Repository: ${owner}/${repo}`);
    info(`Commit: ${sha}`);

    // ====== 2. Check for release command ======
    const commitMessage = context.payload.head_commit?.message || '';
    const releaseType = parseReleaseType(commitMessage);

    if (!releaseType) {
      if (commitMessage.includes('!release')) {
        throw new Error(
          'Release command found but invalid format. Use: !release: major/minor/patch'
        );
      }
      info('No release command found in commit message. Exiting.');
      return;
    }

    info(`📦 Release type: ${releaseType.toUpperCase()}`);

    // ====== 3. Validate environment ======
    info('Validating environment...');
    await assertCleanWorkingDir();
    await assertOnBranch(config.allowedBranch);

    // ====== 4. Get version information ======
    info('Fetching version information...');
    const lastTag = await getLatestReleaseTag(octokit, owner, repo);
    info(lastTag ? `Previous version: ${lastTag}` : 'This is the first release');

    const versionInfo: VersionInfo = createVersionInfo(lastTag, releaseType);
    info(`New version: ${versionInfo.current}`);

    // ====== 5. Get commits and parse them ======
    info('Analyzing commits...');
    const commits = await getCommitsBetween(octokit, owner, repo, lastTag, sha);
    info(`Found ${commits.length} commits`);

    const parsedCommits = parseCommits(commits);
    info(`Parsed ${parsedCommits.length} changes (some commits contain multiple types)`);

    // Validate conventional commits
    const validation = validateConventionalCommits(commits);
    if (!validation.valid) {
      warning(`Found ${validation.invalid.length} commits not following Conventional Commits format`);
      for (const commit of validation.invalid) {
        warning(`  - ${commit.shortSha}: ${commit.message.split('\n')[0]}`);
      }
    }

    // ====== 6. Calculate statistics ======
    info('Calculating release statistics...');
    const rangeStats = await getRangeStats(lastTag || null, sha);
    const contributors = getContributors(commits);

    let daysSinceLastRelease: number | null = null;
    if (lastTag) {
      const lastReleaseDate = await getCommitDate(lastTag);
      const now = new Date();
      daysSinceLastRelease = daysBetween(lastReleaseDate, now);
    }

    const stats: ReleaseStats = {
      filesChanged: rangeStats.filesChanged,
      additions: rangeStats.additions,
      deletions: rangeStats.deletions,
      daysSinceLastRelease,
      commitCount: commits.length,
      contributors,
    };

    info(`Statistics: ${stats.filesChanged} files, +${stats.additions}/-${stats.deletions} lines, ${stats.contributors.length} contributors`);

    // ====== 7. Create tag ======
    info(`Creating tag: ${versionInfo.current}...`);
    await createTag(octokit, owner, repo, versionInfo.current, sha);

    // ====== 8. Run tests and build ======
    if (config.lintAndTestsCommand) {
      info(`Running lint & tests: ${config.lintAndTestsCommand}`);
      await runCommand(config.lintAndTestsCommand);
      info('✅ Lint & tests passed');
    }

    if (config.buildCommand) {
      info(`Running build: ${config.buildCommand}`);
      await runCommand(config.buildCommand);
      info('✅ Build completed');
    }

    // ====== 9. Generate changelog ======
    info('Generating changelog...');
    const aiContext: AIContext = {
      versionInfo,
      commits: parsedCommits,
      stats,
      repository: { owner, repo },
      language: config.language,
    };

    const aiConfig = config.openaiApiKey
      ? {
          apiKey: config.openaiApiKey,
          model: config.openaiApiModel,
          baseUrl: config.openaiApiBaseUrl,
        }
      : undefined;

    let changelog = await generateChangelog(aiContext, aiConfig);

    // Add statistics section (AI is instructed not to add it)
    changelog += '\n\n' + generateStatsSection(stats, versionInfo, { owner, repo });

    // ====== 10. Create release ======
    info('Creating GitHub release...');
    const release = await createRelease(
      octokit,
      owner,
      repo,
      versionInfo.current,
      changelog,
      {
        draft: config.draftRelease,
        prerelease: config.prerelease,
      }
    );

    info(`Release created: ${release.htmlUrl}`);

    // ====== 11. Upload assets ======
    if (config.assetPatterns.length > 0) {
      info('Finding assets to upload...');
      const assetPaths = await getAssetPaths(config.assetPatterns);
      info(`Found ${assetPaths.length} assets`);

      for (const assetPath of assetPaths) {
        info(`Uploading: ${assetPath}`);
        await uploadReleaseAsset(octokit, release.uploadUrl, assetPath);
      }

      info('✅ All assets uploaded');
    }

    // ====== 12. Send Discord notification ======
    if (config.discordWebhook) {
      info('Sending Discord notification...');

      const breaking = parsedCommits.filter(c => c.breaking);
      const color = breaking.length > 0 ? 0xff0000 : config.prerelease ? 0xffa500 : 0x00ff00;

      await sendDiscordNotification(
        config.discordWebhook,
        '',
        {
          title: `🚀 Release ${versionInfo.current}`,
          description: `New ${config.prerelease ? 'pre-' : ''}release published for **${owner}/${repo}**`,
          url: release.htmlUrl,
          color,
          fields: [
            { name: 'Version', value: versionInfo.current, inline: true },
            { name: 'Type', value: versionInfo.releaseType.toUpperCase(), inline: true },
            { name: 'Commits', value: stats.commitCount.toString(), inline: true },
            { name: 'Files Changed', value: stats.filesChanged.toString(), inline: true },
            { name: 'Contributors', value: stats.contributors.join(', '), inline: false },
            ...(breaking.length > 0
              ? [{ name: '⚠️ Breaking Changes', value: breaking.length.toString(), inline: true }]
              : []
            ),
          ],
        }
      );

      info('✅ Discord notification sent');
    }

    // ====== 13. Success ======
    info('');
    info('═══════════════════════════════════════');
    info('✅ Release completed successfully!');
    info(`📦 Version: ${versionInfo.current}`);
    info(`🔗 Release URL: ${release.htmlUrl}`);
    info('═══════════════════════════════════════');

  } catch (error: any) {
    setFailed(`Action failed: ${error.message}`);
    if (error.stack) {
      info('Stack trace:');
      info(error.stack);
    }
  }
}

// Run the action
run();
