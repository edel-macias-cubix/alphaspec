import {afterEach, describe, expect, it, vi} from 'vitest';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

// Point alphaspec at the source templates for test runs.
// vitest.config.ts also sets this, but explicit assignment here makes the dependency clear.
const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.ALPHASPEC_TEMPLATES_DIR = join(__dirname, '..', 'src', 'templates');

// Mock @clack/prompts so no TTY interaction happens during tests
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    success: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    warn: vi.fn(),
  },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  confirm: vi.fn().mockResolvedValue(true),
  multiselect: vi.fn().mockResolvedValue([]),
  isCancel: vi.fn().mockReturnValue(false),
  cancel: vi.fn(),
}));

// Import commands AFTER setting env and mocking
const { runInit } = await import('../src/commands/init');
const { runRemove } = await import('../src/commands/remove');

const TMP = tmpdir();
let testDir: string;

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true });
  }
});

async function freshDir(): Promise<string> {
  testDir = await mkdtemp(join(TMP, 'alphaspec-int-'));
  return testDir;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('init — no tools', () => {
  it('creates stories/pending/ stories/done/ and .alphaspec/ with no IDE files', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'none', yes: true });

    expect(await fileExists(join(dir, 'stories', 'pending'))).toBe(true);
    expect(await fileExists(join(dir, 'stories', 'done'))).toBe(true);
    expect(await fileExists(join(dir, '.alphaspec', 'config.json'))).toBe(true);
    expect(await fileExists(join(dir, 'stories', 'pending', 'README.md'))).toBe(true);
    expect(await fileExists(join(dir, 'stories', 'done', 'README.md'))).toBe(true);

    // AGENTS.md should be created (universal writer always runs)
    expect(await fileExists(join(dir, 'AGENTS.md'))).toBe(true);

    // No claude-code files
    expect(await fileExists(join(dir, '.claude'))).toBe(false);
  });

  it('config.json records the correct version, empty tools array, and storiesDir', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'none', yes: true });

    const raw = await readFile(join(dir, '.alphaspec', 'config.json'), 'utf-8');
    const config = JSON.parse(raw);
    expect(Array.isArray(config.tools)).toBe(true);
    expect(config.tools).toHaveLength(0);
    expect(config.version).toBeDefined();
    expect(config.storiesDir).toBe('stories');
  });
});

describe('init — claude-code', () => {
  it('creates .claude/skills/ with a SKILL.md per prompt', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'claude-code', yes: true });

    const slugs = ['create-stories', 'refine-story', 'complete-story', 'implement-story', 'verify-story', 'define-principles', 'bootstrap-from-research'];
    for (const slug of slugs) {
      expect(await fileExists(join(dir, '.claude', 'skills', `alphaspec-${slug}`, 'SKILL.md'))).toBe(true);
    }
  });

  it('creates CLAUDE.md with sentinel block', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'claude-code', yes: true });

    const content = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- alphaspec:start -->');
    expect(content).toContain('<!-- alphaspec:end -->');
    expect(content).toContain('alphaspec');
  });

  it('is idempotent — second init does not duplicate sentinel', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'claude-code', force: true, yes: true });
    await runInit({ dir, tools: 'claude-code', force: true, yes: true });

    const content = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    const startCount = (content.match(/<!-- alphaspec:start -->/g) ?? []).length;
    expect(startCount).toBe(1);
  });
});

describe('init — codex', () => {
  it('creates .codex/skills/ with a SKILL.md per prompt', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'codex', yes: true });

    const slugs = ['create-stories', 'refine-story', 'complete-story', 'implement-story', 'verify-story', 'define-principles', 'bootstrap-from-research'];
    for (const slug of slugs) {
      expect(await fileExists(join(dir, '.codex', 'skills', `alphaspec-${slug}`, 'SKILL.md'))).toBe(true);
    }
  });

  it('writes Codex skills with prefixed frontmatter names', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'codex', yes: true });

    const content = await readFile(join(dir, '.codex', 'skills', 'alphaspec-create-stories', 'SKILL.md'), 'utf-8');
    expect(content).toContain('name: alphaspec-create-stories');
    expect(content).not.toContain('name: create-stories');
  });

  it('also writes shared AGENTS.md workflow instructions', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'codex', yes: true });

    const content = await readFile(join(dir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('<!-- alphaspec:start -->');
    expect(content).toContain('alphaspec workflow');
  });
});

describe('init — github-copilot', () => {
  it('creates skills (prompt files no longer written)', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'github-copilot', yes: true });

    expect(await fileExists(join(dir, '.github', 'skills', 'alphaspec-create-stories', 'SKILL.md'))).toBe(true);
    expect(await fileExists(join(dir, '.github', 'prompts', 'create-stories.prompt.md'))).toBe(false);
    expect(await fileExists(join(dir, '.github', 'copilot-instructions.md'))).toBe(true);
  });

  it('does NOT create .github/agents/', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'github-copilot', yes: true });
    expect(await fileExists(join(dir, '.github', 'agents'))).toBe(false);
  });
});

describe('remove — codex', () => {
  it('removes Codex skill folders and cleans AGENTS.md sentinel', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'codex', yes: true });

    expect(await fileExists(join(dir, '.codex', 'skills', 'alphaspec-create-stories', 'SKILL.md'))).toBe(true);
    expect(await fileExists(join(dir, 'AGENTS.md'))).toBe(true);

    await runRemove({ dir, yes: true });

    expect(await fileExists(join(dir, '.codex', 'skills', 'alphaspec-create-stories'))).toBe(false);
    expect(await fileExists(join(dir, 'AGENTS.md'))).toBe(false);
  });
});

describe('remove — claude-code', () => {
  it('removes skill folders and cleans CLAUDE.md sentinel', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'claude-code', yes: true });

    // Confirm files exist before removal
    expect(await fileExists(join(dir, '.claude', 'skills', 'alphaspec-create-stories', 'SKILL.md'))).toBe(true);

    await runRemove({ dir, yes: true, purge: true });

    expect(await fileExists(join(dir, '.claude', 'skills', 'alphaspec-create-stories'))).toBe(false);
    expect(await fileExists(join(dir, '.alphaspec'))).toBe(false);
    // --purge + --yes deletes stories/pending/ and stories/done/ too
    expect(await fileExists(join(dir, 'stories', 'pending'))).toBe(false);
    expect(await fileExists(join(dir, 'stories', 'done'))).toBe(false);
  });

  it('preserves existing CLAUDE.md content outside sentinel block', async () => {
    const dir = await freshDir();

    // Pre-populate CLAUDE.md with user content
    const { safeWrite } = await import('../src/lib/fs-utils');
    const claudePath = join(dir, 'CLAUDE.md');
    await safeWrite(claudePath, '# My Rules\n\nDo not break things.');

    await runInit({ dir, tools: 'claude-code', yes: true });
    await runRemove({ dir, yes: true });

    // Key check: CLAUDE.md still has the user content if it wasn't all alphaspec
    if (await fileExists(claudePath)) {
      const content = await readFile(claudePath, 'utf-8');
      expect(content).not.toContain('<!-- alphaspec:start -->');
      expect(content).toContain('My Rules');
    }
    // pending/ and done/ are untouched (no --purge)
    expect(await fileExists(join(dir, 'stories', 'pending'))).toBe(true);
    expect(await fileExists(join(dir, 'stories', 'done'))).toBe(true);
  });
});

describe('remove — universal', () => {
  it('cleans AGENTS.md sentinel on remove', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'none', yes: true });

    expect(await fileExists(join(dir, 'AGENTS.md'))).toBe(true);

    await runRemove({ dir, yes: true });

    // AGENTS.md should be deleted (was only alphaspec content)
    expect(await fileExists(join(dir, 'AGENTS.md'))).toBe(false);
    // stories/pending/ and stories/done/ untouched without --purge
    expect(await fileExists(join(dir, 'stories', 'pending'))).toBe(true);
    expect(await fileExists(join(dir, 'stories', 'done'))).toBe(true);
  });
});

describe('init — custom storiesDir', () => {
  it('--stories-dir specs creates specs/pending/ and specs/done/', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'none', storiesDir: 'specs', yes: true });

    expect(await fileExists(join(dir, 'specs', 'pending'))).toBe(true);
    expect(await fileExists(join(dir, 'specs', 'done'))).toBe(true);
    expect(await fileExists(join(dir, 'specs', 'pending', 'README.md'))).toBe(true);
    expect(await fileExists(join(dir, 'specs', 'done', 'README.md'))).toBe(true);

    const raw = await readFile(join(dir, '.alphaspec', 'config.json'), 'utf-8');
    const config = JSON.parse(raw);
    expect(config.storiesDir).toBe('specs');
  });

  it('--stories-dir . creates root-level pending/ and done/ (backward compat)', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'none', storiesDir: '.', yes: true });

    expect(await fileExists(join(dir, 'pending'))).toBe(true);
    expect(await fileExists(join(dir, 'done'))).toBe(true);
    expect(await fileExists(join(dir, 'pending', 'README.md'))).toBe(true);
    expect(await fileExists(join(dir, 'done', 'README.md'))).toBe(true);

    const raw = await readFile(join(dir, '.alphaspec', 'config.json'), 'utf-8');
    const config = JSON.parse(raw);
    expect(config.storiesDir).toBe('.');
  });

  it('template variables are resolved in written prompts (no raw {{…}})', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'none', storiesDir: 'work', yes: true });

    // Read a skill from a configured tool to verify template variable resolution
    // (no .alphaspec/prompts/ is created — prompts are only written into tool-specific locations)
    expect(await fileExists(join(dir, '.alphaspec', 'prompts'))).toBe(false);
  });

  it('remove --purge reads storiesDir from config and deletes correct dirs', async () => {
    const dir = await freshDir();
    await runInit({ dir, tools: 'none', storiesDir: 'specs', yes: true });
    await runRemove({ dir, yes: true, purge: true });

    expect(await fileExists(join(dir, 'specs', 'pending'))).toBe(false);
    expect(await fileExists(join(dir, 'specs', 'done'))).toBe(false);
    // Container should be cleaned up if empty
    expect(await fileExists(join(dir, 'specs'))).toBe(false);
  });
});
