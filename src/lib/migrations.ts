import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { pathExists } from './fs-utils';
import type { ToolId } from './detect-tools';

/**
 * A migration step bridging two alphaspec versions.
 *
 * Migrations are responsible only for *cleaning up* obsolete on-disk artifacts
 * left by older versions. They do not write new files — the caller (upgrade
 * command) re-applies IDE writers afterwards, which produces the current layout.
 *
 * Migrations MUST be idempotent: running the same one twice on the same tree
 * must be a no-op the second time. Use `rm --force` semantics throughout.
 */
export interface Migration {
  /** Inclusive lower bound: applies when installed version > `from`. */
  from: string;
  /** Inclusive upper bound: applies when installed version <= `to` AND target version >= `to`. */
  to: string;
  /** One-line user-facing description, printed when the migration runs. */
  summary: string;
  /** Cleanup work scoped to the configured tools. */
  run(dir: string, configuredTools: readonly ToolId[]): Promise<void>;
}

/**
 * Slug set as it existed in 0.2.0, used to scrub the dot-prefix layout
 * (`alphaspec.<slug>`) introduced before 0.3.0.
 */
const SLUGS_V0_2_0 = [
  'create-story',           // removed entirely in 0.3.0 (replaced by create-stories)
  'complete-story',
  'implement-story',
  'verify-story',
  'define-principles',
  'bootstrap-from-research',
] as const;

/**
 * Per-tool layout of where a prompt slug landed in 0.2.0 — used for cleanup.
 * `kind: 'dir'` means each slug got its own folder; `kind: 'file'` means a flat file.
 */
const LEGACY_TOOL_PATHS: Record<ToolId, { kind: 'dir' | 'file'; base: string; ext: string }> = {
  'claude-code':    { kind: 'dir',  base: '.claude/skills',     ext: '' },
  'codex':          { kind: 'dir',  base: '.codex/skills',      ext: '' },
  'github-copilot': { kind: 'dir',  base: '.github/skills',     ext: '' },
  'cursor':         { kind: 'file', base: '.cursor/commands',   ext: '.md' },
  'windsurf':       { kind: 'file', base: '.windsurf/workflows', ext: '.md' },
  'cline':          { kind: 'file', base: '.clinerules/prompts', ext: '.md' },
};

async function rmIfExists(target: string): Promise<boolean> {
  if (await pathExists(target)) {
    await rm(target, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Returns the migrations that bridge `installed` → `current`, in order.
 *
 * A migration is selected when:
 *   `installed` is strictly less than `mig.to`  AND  `current` is at or above `mig.to`.
 *
 * Versions are compared as semver-ish dot-tuples (no prerelease handling needed
 * for current scope). Missing/unparseable versions are treated as `0.0.0`.
 */
export function planMigrations(installed: string, current: string): Migration[] {
  const inst = parseVersion(installed);
  const curr = parseVersion(current);
  return MIGRATIONS.filter(m => {
    const to = parseVersion(m.to);
    return cmp(inst, to) < 0 && cmp(curr, to) >= 0;
  });
}

function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.').map(p => Number.parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Registry of all migrations. Keep ordered by `to` ascending.
 */
export const MIGRATIONS: Migration[] = [
  {
    from: '0.0.0',
    to: '0.3.0',
    summary:
      'Rename prompt slugs from `alphaspec.<slug>` to `alphaspec-<slug>`, ' +
      'drop the obsolete `create-story` prompt, and remove the unused ' +
      '`.alphaspec/prompts/` source-of-truth folder.',
    async run(dir, configuredTools) {
      // 1. Per configured tool, remove dot-prefix legacy artifacts for the 0.2.0 slug set.
      for (const tool of configuredTools) {
        const layout = LEGACY_TOOL_PATHS[tool];
        if (!layout) continue;
        for (const slug of SLUGS_V0_2_0) {
          // dot-form (0.2.0): alphaspec.<slug>
          await rmIfExists(join(dir, layout.base, `alphaspec.${slug}${layout.ext}`));
        }
        // 2. Also nuke `create-story` under the new hyphen-form, in case any pre-0.3.0
        //    snapshot wrote it that way. The slug is gone for good in 0.3.0.
        await rmIfExists(join(dir, layout.base, `alphaspec-create-story${layout.ext}`));
        await rmIfExists(join(dir, layout.base, `create-story${layout.ext}`));
      }

      // 3. github-copilot wrote a legacy `.github/prompts/<slug>.prompt.md` shape
      //    pre-0.2.0. The current writer cleans these for current PROMPT_NAMES,
      //    but `create-story` is no longer in that list, so handle it here.
      if (configuredTools.includes('github-copilot')) {
        await rmIfExists(join(dir, '.github', 'prompts', 'create-story.prompt.md'));
      }

      // 4. Drop the orphaned `.alphaspec/prompts/` folder (0.2.0 source-of-truth model).
      await rmIfExists(join(dir, '.alphaspec', 'prompts'));
    },
  },
];
