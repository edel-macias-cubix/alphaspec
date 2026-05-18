import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { ensureDir, safeWrite, readTemplate } from '../fs-utils';
import { PROMPT_NAMES, PROMPT_SLUG_PREFIX, type TemplateVars } from '../templates';

const SKILLS_BASE = '.codex/skills';

export async function apply(dir: string, vars?: TemplateVars): Promise<void> {
  for (const slug of PROMPT_NAMES) {
    const skillDir = join(dir, SKILLS_BASE, `${PROMPT_SLUG_PREFIX}${slug}`);
    await ensureDir(skillDir);
    let content = await readTemplate(`prompts/${slug}.md`, vars);
    content = content.replace(`name: ${slug}`, `name: ${PROMPT_SLUG_PREFIX}${slug}`);
    await safeWrite(join(skillDir, 'SKILL.md'), content);
  }
}

export async function remove(dir: string): Promise<void> {
  for (const slug of PROMPT_NAMES) {
    await rm(join(dir, SKILLS_BASE, `${PROMPT_SLUG_PREFIX}${slug}`), { recursive: true, force: true });
    await rm(join(dir, SKILLS_BASE, slug), { recursive: true, force: true });
  }
}
