import { join } from 'node:path';
import { pathExists } from './fs-utils';

export type ToolId = 'claude-code' | 'codex' | 'cursor' | 'windsurf' | 'github-copilot' | 'cline';

export const ALL_TOOLS: readonly ToolId[] = [
  'claude-code',
  'codex',
  'cursor',
  'windsurf',
  'github-copilot',
  'cline',
];

export const TOOL_LABELS: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'cursor': 'Cursor',
  'windsurf': 'Windsurf',
  'github-copilot': 'GitHub Copilot',
  'cline': 'Cline',
};

export async function detectTools(dir: string): Promise<ToolId[]> {
  const detected: ToolId[] = [];

  const anyExists = async (paths: string[]) => {
    const results = await Promise.all(paths.map(p => pathExists(p)));
    return results.some(Boolean);
  };

  if (await anyExists([join(dir, '.claude'), join(dir, 'CLAUDE.md')])) {
    detected.push('claude-code');
  }
  if (await anyExists([join(dir, '.codex'), join(dir, 'AGENTS.md')])) {
    detected.push('codex');
  }
  if (await pathExists(join(dir, '.cursor'))) {
    detected.push('cursor');
  }
  if (await pathExists(join(dir, '.windsurf'))) {
    detected.push('windsurf');
  }
  if (await pathExists(join(dir, '.github'))) {
    detected.push('github-copilot');
  }
  if (await pathExists(join(dir, '.clinerules'))) {
    detected.push('cline');
  }

  return detected;
}
