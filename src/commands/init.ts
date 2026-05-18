import { join, resolve } from 'node:path';
import { rename as fsRename } from 'node:fs/promises';
import * as clack from '@clack/prompts';
import { ensureDir, safeWrite, readIfExists, readTemplate, pathExists } from '../lib/fs-utils';
import { detectTools, ALL_TOOLS, TOOL_LABELS, type ToolId } from '../lib/detect-tools';
import { buildTemplateVars, type TemplateVars } from '../lib/templates';
import { planMigrations } from '../lib/migrations';
import * as claudeCode from '../lib/ide-writers/claude-code';
import * as codex from '../lib/ide-writers/codex';
import * as cursor from '../lib/ide-writers/cursor';
import * as windsurf from '../lib/ide-writers/windsurf';
import * as githubCopilot from '../lib/ide-writers/github-copilot';
import * as cline from '../lib/ide-writers/cline';
import * as universalAgents from '../lib/ide-writers/universal-agents';

const WRITERS: Record<ToolId, { apply: (dir: string, vars?: TemplateVars) => Promise<void>; remove: (dir: string) => Promise<void> }> = {
  'claude-code': claudeCode,
  'codex': codex,
  'cursor': cursor,
  'windsurf': windsurf,
  'github-copilot': githubCopilot,
  'cline': cline,
};

const DEFAULT_STORIES_DIR = 'stories';

export interface InitOptions {
  dir?: string;
  tools?: string;
  storiesDir?: string;
  force?: boolean;
  yes?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const dir = options.dir ? resolve(options.dir) : process.cwd();

  clack.intro('alphaspec init');

  // Check for existing config
  const configPath = join(dir, '.alphaspec', 'config.json');
  const existingConfigRaw = await readIfExists(configPath);
  let existingTools: ToolId[] = [];
  let existingStoriesDir: string | undefined;
  let isExtendMode = false;

  if (existingConfigRaw && !options.force) {
    try {
      const config = JSON.parse(existingConfigRaw) as { tools?: ToolId[]; storiesDir?: string; version?: string };

      // Drift detection: if the install is on an older version, route to `upgrade`.
      const installedVersion = config.version ?? '0.0.0';
      const currentVersion = process.env.ALPHASPEC_VERSION ?? '0.0.0';
      const pendingMigrations = planMigrations(installedVersion, currentVersion);
      if (pendingMigrations.length > 0) {
        clack.log.warn(
          `This project is on alphaspec ${installedVersion}; current version is ${currentVersion}.`,
        );
        clack.outro('Run `alphaspec upgrade` to migrate, then re-run init if you want to add tools.');
        return;
      }

      existingTools = config.tools ?? [];
      existingStoriesDir = config.storiesDir;
      isExtendMode = true;
      clack.log.info(
        `Already initialized (extend mode). Use --force to overwrite everything.`,
      );
    } catch {
      clack.log.warn('Could not parse .alphaspec/config.json — treating as fresh init.');
    }
  }

  // Resolve selected tools
  let selectedTools: ToolId[];

  if (options.tools) {
    if (options.tools === 'all') {
      selectedTools = [...ALL_TOOLS];
    } else if (options.tools === 'none') {
      selectedTools = [];
    } else {
      selectedTools = options.tools.split(',').map(t => t.trim()) as ToolId[];
    }
  } else {
    // Interactive multi-select with auto-detection
    const detected = await detectTools(dir);
    const choices = ALL_TOOLS.map(tool => ({
      value: tool,
      label: TOOL_LABELS[tool],
      hint: detected.includes(tool) ? 'detected' : undefined,
    }));

    const result = await clack.multiselect({
      message: 'Which AI tools should alphaspec configure?',
      options: choices,
      initialValues: detected,
    });

    if (clack.isCancel(result)) {
      clack.cancel('Cancelled.');
      process.exit(0);
    }

    selectedTools = result as ToolId[];
  }

  // In extend mode: only configure newly-added tools
  let toolsToApply: ToolId[];
  let toolsForConfig: ToolId[];

  if (isExtendMode) {
    toolsToApply = selectedTools.filter(t => !existingTools.includes(t));
    toolsForConfig = [...new Set([...existingTools, ...selectedTools])];
  } else {
    toolsToApply = selectedTools;
    toolsForConfig = selectedTools;
  }

  // Resolve storiesDir: CLI flag → existing config → default
  // Existing configs without storiesDir field default to "." (backward compat)
  const storiesDir = options.storiesDir
    ?? (isExtendMode ? (existingStoriesDir ?? '.') : DEFAULT_STORIES_DIR);
  const templateVars = buildTemplateVars(storiesDir);

  // Detect if storiesDir is changing (relocation needed)
  const storiesDirChanging = isExtendMode
    && options.storiesDir !== undefined
    && (existingStoriesDir ?? '.') !== storiesDir;

  // If nothing to do in extend mode (no new tools, no storiesDir change), bail early
  if (isExtendMode && toolsToApply.length === 0 && !storiesDirChanging && !options.force) {
    clack.outro('Nothing to add — all selected tools are already configured.');
    return;
  }

  // Force-apply all templates + IDE writers when storiesDir changes
  const forceTemplates = options.force || storiesDirChanging;

  const spinner = clack.spinner();
  spinner.start('Setting up alphaspec…');

  try {
    // Handle relocation if storiesDir is changing
    if (storiesDirChanging) {
      const oldStoriesDir = existingStoriesDir ?? '.';
      const oldPending = join(dir, oldStoriesDir, 'pending');
      const oldDone = join(dir, oldStoriesDir, 'done');
      const newPending = join(dir, storiesDir, 'pending');
      const newDone = join(dir, storiesDir, 'done');

      const oldPendingExists = await pathExists(oldPending);
      const oldDoneExists = await pathExists(oldDone);

      if (oldPendingExists || oldDoneExists) {
        spinner.stop('Stories directory is changing.');

        let doMove = options.yes;
        if (!doMove) {
          const confirmMove = await clack.confirm({
            message: `Move stories from ${oldStoriesDir === '.' ? '(project root)' : oldStoriesDir + '/'} to ${storiesDir}/?`,
            initialValue: true,
          });
          doMove = !clack.isCancel(confirmMove) && confirmMove;
        }

        if (doMove) {
          await ensureDir(join(dir, storiesDir));
          if (oldPendingExists) await fsRename(oldPending, newPending);
          if (oldDoneExists) await fsRename(oldDone, newDone);
          clack.log.success(`Moved stories to ${storiesDir}/`);
        } else {
          clack.log.warn(
            `Stories directory updated to ${storiesDir}/ in config, but old files remain at ${oldStoriesDir === '.' ? 'project root' : oldStoriesDir + '/'}.`,
          );
        }

        spinner.start('Setting up alphaspec…');
      }
    }

    // Create folder structure
    await ensureDir(join(dir, '.alphaspec'));
    await ensureDir(join(dir, storiesDir, 'pending'));
    await ensureDir(join(dir, storiesDir, 'done'));

    // Write README files for pending/ and done/ (skip if they already exist, unless forced)
    const pendingReadmePath = join(dir, storiesDir, 'pending', 'README.md');
    const doneReadmePath = join(dir, storiesDir, 'done', 'README.md');

    if (forceTemplates || !(await readIfExists(pendingReadmePath))) {
      await safeWrite(pendingReadmePath, await readTemplate('readmes/pending.md', templateVars));
    }
    if (forceTemplates || !(await readIfExists(doneReadmePath))) {
      await safeWrite(doneReadmePath, await readTemplate('readmes/done.md', templateVars));
    }

    // Apply IDE writers — new tools, or all tools when storiesDir changes
    const writersToApply = forceTemplates ? toolsForConfig : toolsToApply;
    for (const tool of writersToApply) {
      await WRITERS[tool].apply(dir, templateVars);
    }

    // Always apply universal AGENTS.md writer
    await universalAgents.apply(dir, templateVars);

    // Write config
    const config = {
      version: process.env.ALPHASPEC_VERSION ?? '0.0.0',
      tools: toolsForConfig,
      storiesDir,
      initializedAt: existingConfigRaw
        ? JSON.parse(existingConfigRaw).initializedAt ?? new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await safeWrite(configPath, JSON.stringify(config, null, 2) + '\n');

    spinner.stop('Done.');
  } catch (err) {
    spinner.stop('Failed.');
    throw err;
  }

  // Summary
  const pendingLabel = templateVars.pendingDir + '/';
  const doneLabel = templateVars.doneDir + '/';

  clack.log.success('Created:');
  clack.log.message(`  ${pendingLabel.padEnd(18)}— active epics and stories`);
  clack.log.message(`  ${doneLabel.padEnd(18)}— completed work (historical reference)`);
  clack.log.message('  .alphaspec/      — config');

  if (toolsToApply.length > 0) {
    clack.log.success('Configured:');
    for (const tool of toolsToApply) {
      clack.log.message(`  ${TOOL_LABELS[tool]}`);
    }
  }

  clack.log.message('');
  clack.log.info(
    'alphaspec does not modify your .gitignore. ' +
    `Add ${pendingLabel} and ${doneLabel} yourself if you want them to stay local.`,
  );

  clack.outro(
    isExtendMode
      ? `Extended. Try a prompt like /alphaspec-create-stories in your AI assistant.`
      : `Ready. Try /alphaspec-create-stories to add your first story, or /alphaspec-bootstrap-from-research if you have a research doc.`,
  );
}
