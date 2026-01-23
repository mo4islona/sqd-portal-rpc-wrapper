# AGENTS.md

Work style: telegraph; noun-phrases ok; drop grammar; min tokens.

## Agent Protocol
- PRs: use `gh pr view/diff` (no URLs).
- “Make a note” => edit AGENTS.md (shortcut; not a blocker). Ignore `CLAUDE.md`.
- Need upstream file: stage in `/tmp/`, then cherry-pick; never overwrite tracked.
- Bugs: add regression test when it fits.
- Keep files <~500 LOC; split/refactor as needed.
- Commits: Conventional Commits (`feat|fix|refactor|build|ci|chore|docs|style|perf|test`).
- Editor: `zed <path>`.
- CI: `gh run list/view` (rerun/fix til green).
- Prefer end-to-end verify; if blocked, say what’s missing.
- New deps: quick health check (recent releases/commits, adoption).
- Web: search early; quote exact errors; prefer 2024–>2026 sources.
- Style: telegraph. Drop filler/grammar. Min tokens (global AGENTS + replies).

## Flow & Runtime
- Use repo’s package manager/runtime; no swaps w/o approval.
- Use Codex background for long jobs; tmux only for interactive/persistent (debugger/server).

## Build / Test
- Before handoff: run full gate (`npm run lint && npm run typecheck && npm test`).

## Git
- Safe by default: `git status/diff/log`. Push only when user asks.
- Branch changes require user consent.
- Destructive ops forbidden unless explicit (`reset --hard`, `clean`, `restore`, `rm`, …).
- No amend unless asked.
- Big review: `git --no-pager diff --color=never`.

## macOS Permissions / Signing (TCC)
- Never re-sign / ad-hoc sign / change bundle ID as “debug” without explicit ok.
