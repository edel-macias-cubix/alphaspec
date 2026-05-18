import { join, resolve } from 'node:path';
import * as clack from '@clack/prompts';
import { readIfExists, safeWrite } from '../lib/fs-utils';
import { buildTemplateVars, type TemplateVars } from '../lib/templates';
import { type ToolId } from '../lib/detect-tools';
import { planMigrations } from '../lib/migrations';
import * as claudeCode from '../lib/ide-writers/claude-code';
import * as codex from '../lib/ide-writers/codex';
import * as cursor from '../lib/ide-writers/cursor';
import * as windsurf from '../lib/ide-writers/windsurf';
import * as githubCopilot from '../lib/ide-writers/github-copilot';
import * as cline from '../lib/ide-writers/cline';
import * as universalAgents from '../lib/ide-writers/universal-agents';

const WRITERS: Record<ToolId, { apply: (dir: string, vars?: TemplateVars) => Promise<void> }> = {
  'claude-code': claudeCode,
  'codex': codex,
  'cursor': cursor,
  'windsurf': windsurf,
  'github-copilot': githubCopilot,
  'cline': cline,
};

const CURRENT_VERSION = process.env.ALPHASPEC_VERSION ?? '0.0.0';

export interface UpgradeOptions {
  dir?: string;
  yes?: boolean;
}

interface AlphaspecConfig {
  version?: string;
  tools?: ToolId[];
  storiesDir?: string;
  initializedAt?: string;
  updatedAt?: string;
}

export async function runUpgrade(options: UpgradeOptions = {}): Promise<void> {
  const dir = options.dir ? resolve(options.dir) : process.cwd();

  clack.intro('alphaspec upgrade');

  const configPath = join(dir, '.alphaspec', 'config.json');
  const configRaw = await readIfExists(configPath);

  if (!configRaw) {
    clack.log.error('No alphaspec install found here (`.alphaspec/config.json` is missing).');
    clack.outro('Run `alphaspec init` to set up alphaspec in this project.');
    return;
  }

  let config: AlphaspecConfig;
  try {
    config = JSON.parse(configRaw) as AlphaspecConfig;
  } catch {
    clack.log.error('Could not parse `.alphaspec/config.json`. Refusing to upgrade.');
    clack.outro('Fix or delete the config file, then re-run.');
    return;
  }

  const installedVersion = config.version ?? '0.0.0';
  const tools = config.tools ?? [];
  const storiesDir = config.storiesDir ?? '.';

  // Plan migrations
  const pending = planMigrations(installedVersion, CURRENT_VERSION);

  if (pending.length === 0 && installedVersion === CURRENT_VERSION) {
    clack.outro(`Already up to date (${CURRENT_VERSION}).`);
    return;
  }

  // Show plan
  clack.log.info(`Installed: ${installedVersion}  →  Current: ${CURRENT_VERSION}`);
  if (pending.length > 0) {
    clack.log.message('Migrations to run:');
    for (const m of pending) {
      clack.log.message(`  • ${m.to}: ${m.summary}`);
    }
  } else {
    clack.log.message('No migrations needed; will refresh templates only.');
  }
  if (tools.length > 0) {
    clack.log.message(`Will re-apply writers for: ${tools.join(', ')}`);
  }

  // Confirm
  if (!options.yes) {
    const confirm = await clack.confirm({
      message: 'Proceed with upgrade?',
      initialValue: true,
    });
    if (clack.isCancel(confirm) || !confirm) {
      clack.cancel('Upgrade cancelled.');
      return;
    }
  }

  const spinner = clack.spinner();
  spinner.start('Upgrading…');

  try {
    // Run migrations in order
    for (const m of pending) {
      spinner.message(`Running migration → ${m.to}`);
      await m.run(dir, tools);
    }

    // Re-apply writers so the current layout lands
    const templateVars = buildTemplateVars(storiesDir);
    spinner.message('Re-applying IDE writers…');
    for (const tool of tools) {
      await WRITERS[tool].apply(dir, templateVars);
    }
    // Universal AGENTS.md is always applied
    await universalAgents.apply(dir, templateVars);

    // Bump config version + updatedAt
    const updatedConfig: AlphaspecConfig = {
      ...config,
      version: CURRENT_VERSION,
      updatedAt: new Date().toISOString(),
    };
    await safeWrite(configPath, JSON.stringify(updatedConfig, null, 2) + '\n');

    spinner.stop('Done.');
  } catch (err) {
    spinner.stop('Failed.');
    throw err;
  }

  clack.log.success(`Upgraded to ${CURRENT_VERSION}.`);
  clack.outro('Your AI assistant should pick up the new prompts on next reload.');
}
