<p align="center">
  <img src="https://raw.githubusercontent.com/inheritech/alphaspec/main/assets/logo.png" alt="alphaspec" width="200">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/alphaspec"><img src="https://img.shields.io/npm/v/alphaspec.svg" alt="npm version"></a>
  <a href="https://github.com/inheritech/alphaspec/actions/workflows/ci.yml"><img src="https://github.com/inheritech/alphaspec/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">Track what needs to be built — plain markdown your AI tools read as context.</p>

## What is alphaspec

`alphaspec` is a lightweight story-driven development workflow for AI-assisted projects. It creates a simple folder structure in your repo (`stories/pending/` and `stories/done/`) and installs prompts as skills into whichever AI coding tools you already use.

Work is organized into **epics** (a group of related work) and **stories** (an individual piece of work). Stories capture *what* needs to be built and *why* — not how. There's no formal specification — just plain markdown that describes requirements in a way both you and your AI can read.

alphaspec deliberately stays out of planning. How you break down implementation, what order you tackle things, which tools you use for thinking through architecture — that's your call. Most AI tools already have their own planning capabilities, and you might use external tools on top of that. alphaspec doesn't compete with any of them. It just tracks the stories so your AI has a shared view of what's been asked for, what's in progress, and what's done.

No estimation, no standups, no ticket hierarchy — just folders and markdown files.

## Install

```bash
npm install -g alphaspec
# or
pnpm add -g alphaspec
```

## Quick start

```console
$ cd my-project
$ alphaspec init
◆  Which AI tools would you like to configure?
│  ◼ Claude Code  (detected)
│  ◼ Codex  (detected)
│  ◼ GitHub Copilot  (detected)
│  ○ Cursor
│  ○ Windsurf
│  ○ Cline
│
✔  Claude Code configured
✔  Codex configured
✔  GitHub Copilot configured
✔  AGENTS.md written
✔  Done — stories/pending/ and stories/done/ are ready
```

Non-interactive:

```bash
alphaspec init --tools claude-code,codex,github-copilot
alphaspec init --tools all --yes   # all tools, skip prompts
alphaspec init --tools none        # folder structure only
```

## Usage

The core workflow has four steps. Each one is a slash command you run inside your AI tool.

### 1. Create stories

Describe what you want to build. The prompt creates stories grouped under an epic, with acceptance criteria and context — capturing the *what* and *why*, not the *how*.

```
/alphaspec-create-stories
```

### 2. Implement a story

Pick a story and start building. The prompt loads the story context, checks for principles and dependencies, and flags decisions that are hard to reverse before you commit to them. It adds guardrails for common pitfalls — missing dependencies, silent architectural decisions, drift from acceptance criteria.

It works equally well with planning agents and execution agents. Invoke it during a planning phase to structure your approach before any code is written — the planning comes from your tooling, the prompt just makes sure the story is loaded as context.

> **Note:** This step is optional. Stories are just markdown — you can work from them directly if you prefer.

```
/alphaspec-implement-story
```

### 3. Verify your work

Review what was built against the story's acceptance criteria. The prompt acts as a critical reviewer — checking each criterion, flagging drift from the original intent, and producing a structured pass/fail report.

```
/alphaspec-verify-story
```

### 4. Complete and archive

Once verified, archive the story. The prompt refines the story to match what was actually built, appends implementation notes, and moves it from `pending/` to `done/`.

```
/alphaspec-complete-story
```

## Bootstrap from research

If you're starting a project from research output — notes from Perplexity, ChatGPT, a design spike, or any other source — this prompt converts that into a structured set of epics and stories. You review what it produces, keep what fits, discard what doesn't.

```
/alphaspec-bootstrap-from-research
```

Useful for spinning up a project quickly without translating research into tasks by hand.

## Principles

Principles live in `.alphaspec/PRINCIPLES.md`. They're the project's constitution — architectural decisions, quality standards, and non-functional requirements derived from what the project actually is.

Once defined, principles integrate into the rest of the workflow automatically: `implement-story` reads them before writing code, `verify-story` checks compliance against them.

To define or update principles:

```
/alphaspec-define-principles
```

## Concepts

### Folder structure

```
stories/
  pending/
    01-auth/
      _epic.md                     ← epic overview
      story-02-password-reset.md   ← what to build and why

  done/
    01-auth/
      story-01-login-flow.md       ← completed, with implementation notes
```

By default, work lives under `stories/`. Active work goes in `stories/pending/`, completed work in `stories/done/`. Both are plain markdown your AI tools read as context.

To use a different container (or keep the old root-level layout):

```bash
alphaspec init --stories-dir specs      # specs/pending/ + specs/done/
alphaspec init --stories-dir .          # pending/ + done/ at project root
```

Re-running init with a different `--stories-dir` on an existing project will offer to relocate your stories automatically.

### Epics and stories

An **epic** is a folder grouping related work (`01-auth/`). A **story** is a single piece of work inside an epic. Stories capture what the user needs and why — not how to build it. Implementation details change; requirements endure.

Stories are living documents. Description, acceptance criteria, and key decisions get refined as understanding sharpens during planning and implementation.

### done/ as long-term memory

`done/` is not an archive you forget about. Completed stories include implementation notes — a brief record of what was built and how. AI tools read `done/` to orient on future work, avoiding repeated mistakes and maintaining consistency across the codebase.

## Using with your AI tool

alphaspec installs prompts as **skills** — a format supported across AI coding tools. Skills are loaded automatically when relevant context is detected, and can also be invoked directly as slash commands. This means the AI can pull in the right prompt on its own, or you can trigger it explicitly.

### Claude Code

Slash commands in chat: `/alphaspec-create-stories`, `/alphaspec-implement-story`, etc. Skills are also loaded autonomously when Claude detects relevant context.

### Codex

Invoke skills in Codex app or CLI with `$alphaspec-create-stories`, `$alphaspec-implement-story`, etc. Skills are installed under `.codex/skills/`, and shared workflow context is written to `AGENTS.md`.

### GitHub Copilot

Slash commands in chat: `/alphaspec-create-stories`, `/alphaspec-implement-story`, etc. In agent mode, skills are loaded automatically by relevance.

### Cursor

Reference prompts with `@` in Composer, or search by name in the Command Palette. Workflow context is loaded into every session automatically via the rules file.

### Windsurf

Open the Cascade panel and select a workflow from the picker. The rules file is loaded automatically by Cascade.

### Cline

Reference a prompt by name in chat (e.g. "Use the alphaspec-create-stories prompt to..."). The rules file is loaded automatically from `.clinerules/`.

## CLI reference

### `alphaspec init`

```bash
alphaspec init [options]
```

Detects which AI tools are present and configures them interactively. Running `init` again only adds new tools — use `--force` to overwrite.

| Flag | Description |
|------|-------------|
| `-t, --tools <list>` | Comma-separated tool IDs (`claude-code`, `codex`, `cursor`, `windsurf`, `github-copilot`, `cline`), `all`, or `none` |
| `-s, --stories-dir <path>` | Container directory for `pending/` and `done/` (default: `stories`) |
| `-f, --force` | Overwrite existing configuration |
| `-y, --yes` | Skip interactive prompts (auto-selects detected tools) |
| `-d, --dir <path>` | Target directory (defaults to cwd) |

### `alphaspec upgrade`

```bash
alphaspec upgrade [options]
```

Upgrades an existing alphaspec install in place. Reads the project's recorded version, runs the matching migrations (cleaning up obsolete files from older versions), re-applies the IDE writers for the configured tools, and bumps the recorded version. Idempotent — re-running on an up-to-date install is a no-op.

| Flag | Description |
|------|-------------|
| `-y, --yes` | Skip the confirmation prompt |
| `-d, --dir <path>` | Target directory (defaults to cwd) |

> Upgrading from an older alphaspec? Update the package (`npm i -g alphaspec@latest` or your equivalent) and run `alphaspec upgrade` in the project. `init` will detect the version drift and route you here.

### `alphaspec remove`

```bash
alphaspec remove [options]
```

Removes only what alphaspec added. Your own content in `CLAUDE.md`, `copilot-instructions.md`, etc. is preserved.

| Flag | Description |
|------|-------------|
| `-y, --yes` | Skip all confirmations |
| `--purge` | Also delete `pending/` and `done/` under the configured stories directory (asks for confirmation unless `--yes`) |
| `-d, --dir <path>` | Target directory (defaults to cwd) |

## What alphaspec isn't

- **Not a project management tool.** No time tracking, no sprints, no velocity charts.
- **Not for large cross-functional teams.** It's built for solo developers and small teams who want lightweight structure, not enterprise ceremony.
- **Not a specification language.** Stories are intentionally brief and human-readable, not formal specs.
- **Not opinionated about your stack.** It doesn't care what language, framework, or CI system you use.
- **Not opinionated about version control.** It doesn't modify your `.gitignore` — you decide whether to commit your stories directory.

## Contributing

```bash
git clone https://github.com/inheritech/alphaspec.git
cd alphaspec
pnpm install
pnpm test       # run all tests
pnpm build      # compile to dist/
pnpm dev        # watch mode
```

Found a bug or have an idea? [Open an issue](https://github.com/inheritech/alphaspec/issues).

## License

[Apache 2.0](LICENSE)
