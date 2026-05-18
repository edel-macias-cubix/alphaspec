# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added first-class Codex app/CLI support via `.codex/skills/alphaspec-<slug>/SKILL.md`, with shared workflow guidance in `AGENTS.md`.

## [0.4.0] - 2026-05-02

### Changed

- **create-stories** — stories now require an `Out of Scope` section with at least two concrete items, and may include an explicitly non-binding `Implementation Hints` section. Description and Acceptance Criteria are governed by a vocabulary fence (no transport / protocol / runtime / storage terminology). Every acceptance criterion must be expressible as Given [precondition] / When [action] / Then [measurable result]. Dependencies are stated as capabilities in domain language, not as references to other stories' code shapes.
- **refine-story** — replaced the open-ended gap audit with a finite, binary 8-check rubric (INVEST + Out-of-Scope completeness + business intent clarity). Adds a 5 Whys recovery protocol when business intent is unclear and an anti-assumption protocol that requires the agent to externalize WHAT-assumptions rather than silently filling them. The skill now converges: running it on a passing story produces a fixed convergence message.
- **bootstrap-from-research** — generated stories follow the new create-stories template (including Out of Scope and Implementation Hints) and pass the same vocabulary-fence and falsifiability checks, so they converge on the first run of refine-story.
- **implement-story** — explicitly reads `Out of Scope` (treated as a hard fence) and `Implementation Hints` (treated as non-binding orientation) when grounding in the story.
- **verify-story** — drift check now flags when the implementation includes any capability listed in `Out of Scope`.
- **complete-story** — refinement comparison now considers whether anything previously in `Out of Scope` actually got built, and surfaces material divergence from `Implementation Hints` for the appended Implementation Notes.

## [0.3.0] - 2026-04

### Changed

- Renamed prompt slugs from `alphaspec.<slug>` to `alphaspec-<slug>` for cross-tool consistency.
- Removed the legacy `create-story` prompt; replaced by `create-stories`.

### Added

- `alphaspec upgrade` command with version-aware migrations; cleans obsolete on-disk artifacts and re-applies IDE writers in place.
