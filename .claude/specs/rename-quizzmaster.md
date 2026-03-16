# Spec: Rename `minecraft-questionnaire` → `minecraft-quizzmaster`

## Problem

The GitHub repo, local directory, and GitHub Pages URL are still named `minecraft-questionnaire`. The display name has already been updated to "Minecraft QuizzMaster" throughout source files, but the slug used in the repo name, GitHub Pages URL, and local directory path has not been changed.

**Current state:**
- GitHub repo: `github.com/dfmore/minecraft-questionnaire`
- GitHub Pages URL: `https://dfmore.github.io/minecraft-questionnaire/`
- Local directory: `/home/daniel/minecraft-questionnaire`
- Cloudflare Worker: `minecraft-quizzmaster-proxy` (already correct — no change needed)
- Worker URL: `https://minecraft-quizzmaster-proxy.dfmore.workers.dev` (already correct)
- `wrangler.toml` name: `minecraft-quizzmaster-proxy` (already correct)
- KV binding: `QUIZZMASTER_LEADERBOARD` (already correct)

**The gap:** `app.js` hardcodes no path-dependent GitHub Pages URL. The `ALLOWED_ORIGINS` in `worker/index.js` uses `https://dfmore.github.io` (no path component) — no change needed. There is no `CNAME` file.

After repo rename, `https://dfmore.github.io/minecraft-questionnaire/` becomes `https://dfmore.github.io/minecraft-quizzmaster/`. Nothing in `app.js` or `index.html` contains a path reference to `minecraft-questionnaire`, so the **frontend source files require zero changes**.

---

## Goals

1. GitHub repo renamed to `minecraft-quizzmaster`
2. GitHub Pages URL updated to `https://dfmore.github.io/minecraft-quizzmaster/`
3. Memory files updated to reflect new URLs
4. Local directory renamed from `minecraft-questionnaire` to `minecraft-quizzmaster`
5. `.claude/` internal paths/references updated
6. `git remote` updated in the renamed local directory
7. Worker deployment unaffected (worker name and URL already correct)

---

## Non-Goals

- Changing the Cloudflare Worker name (`minecraft-quizzmaster-proxy` is correct already)
- Changing KV namespace names or IDs
- Changing any source file content (`app.js`, `index.html`, `style.css`, `worker/index.js`, `wrangler.toml`) — all already use `quizzmaster` or have no path-specific URL references
- Re-deploying the worker
- Updating `ALLOWED_ORIGINS` in `worker/index.js` — it uses `https://dfmore.github.io` (no path) and remains valid after repo rename

---

## Constraints

- GitHub Pages deploys from `main` branch root — no `gh-pages` branch or workflow to update
- `gh repo rename` automatically sets up a redirect from the old repo URL (GitHub behavior)
- The local `git remote origin` will still point to the old URL after rename — must be updated manually
- The `.claude/` memory system uses the path `/home/daniel/minecraft-questionnaire` as a project key — memory files live at `~/.claude/projects/-home-daniel-minecraft-questionnaire/`; after local rename this becomes `-home-daniel-minecraft-quizzmaster/`. Memory continuity must be considered.
- No active worktrees blocking the rename (font-sizes worktree is gone)
- `.claude/continuation.md` and `.claude/session-snapshot.json` contain old path references — low priority, update as part of cleanup

---

## Approach

Three approaches to performing the rename:

### Approach A — Surgical (recommended)

**One-sentence summary:** Rename only the GitHub repo and local directory; update only the git remote and the one memory file containing the old Pages URL.

| File / Resource | Change |
|---|---|
| GitHub repo | `gh repo rename minecraft-quizzmaster` |
| Local directory | `mv /home/daniel/minecraft-questionnaire /home/daniel/minecraft-quizzmaster` (user runs) |
| `git remote origin` | `git remote set-url origin https://github.com/dfmore/minecraft-quizzmaster` |
| `~/.claude/projects/-home-daniel-minecraft-questionnaire/memory/reference_deployment.md` | Update Game URL to `https://dfmore.github.io/minecraft-quizzmaster/` and GitHub repo to `https://github.com/dfmore/minecraft-quizzmaster` |
| `~/.claude/projects/-home-daniel-minecraft-questionnaire/memory/project_quizzmaster.md` | Update "Directory is `minecraft-questionnaire`" note |
| `.claude/continuation.md` | Update worktree path reference from `../minecraft-questionnaire-font-sizes` (stale — already gone) |
| `.claude/session-snapshot.json` | Update `cwd` and `worktrees` path strings |

**Pros:**
- Minimal blast radius — no source file edits needed
- Git history fully preserved via `mv` (same `.git/` dir)
- GitHub auto-redirects old URL for graceful transition

**Cons:**
- Memory project key (`-home-daniel-minecraft-questionnaire/`) becomes stale after local rename — new Claude sessions in the renamed dir start a fresh memory context unless user copies the memory directory
- `.claude/` session files contain old absolute paths — cosmetic but could confuse future agents

**Risk:** Memory continuity break if user doesn't copy/rename the memory folder at `~/.claude/projects/`.

---

### Approach B — Structural

**One-sentence summary:** Rename repo + local dir + update all references including memory project folder migration and a `CNAME`-equivalent redirect note.

| File / Resource | Change |
|---|---|
| GitHub repo | `gh repo rename minecraft-quizzmaster` |
| Local directory | `mv /home/daniel/minecraft-questionnaire /home/daniel/minecraft-quizzmaster` (user runs) |
| `git remote origin` | `git remote set-url origin https://github.com/dfmore/minecraft-quizzmaster` |
| `~/.claude/projects/` memory dir | User copies/renames `-home-daniel-minecraft-questionnaire/` → `-home-daniel-minecraft-quizzmaster/` |
| `reference_deployment.md` | Update all URLs |
| `project_quizzmaster.md` | Update directory name note |
| `.claude/continuation.md` | Update/archive stale references |
| `.claude/session-snapshot.json` | Update all path strings |

**Pros:**
- Memory continuity preserved across rename
- All path strings consistent throughout

**Cons:**
- More steps; memory dir rename is fiddly and must be done by user (not an agent — private data)
- Risk of duplicate/stale memory project keys if not done atomically

**Risk:** Memory dir rename has to happen in the right sequence or Claude Code picks up a stale context.

---

### Approach C — Pragmatic

**One-sentence summary:** Rename the GitHub repo and update the two memory files; document the local dir rename and memory dir migration as a user checklist, skipping `.claude/` internal file cleanup.

| File / Resource | Change |
|---|---|
| GitHub repo | `gh repo rename minecraft-quizzmaster` |
| `reference_deployment.md` | Update Game URL and GitHub repo URL |
| `project_quizzmaster.md` | Update directory note |
| Local directory + git remote + memory dir | Documented as user checklist (not automated) |

**Pros:**
- Fastest to execute now
- No risk of breaking in-flight Claude session by mutating `.claude/` files mid-session
- User retains control over the directory rename timing

**Cons:**
- Internal `.claude/` files left with stale paths until user acts
- Memory continuity still depends on user action

**Risk:** Low — GitHub redirect covers the URL change; stale internal paths are cosmetic until the local rename happens.

---

## Recommended Approach: A (Surgical)

A is the right fit here. The source code requires zero changes — the entire rename is infrastructure/metadata. Approach A covers everything that matters (repo, remote, Pages URL, memory files) without overreaching into memory dir manipulation (which the user must do manually anyway). Approaches B and C differ only in how much cleanup to do on `.claude/` internals — B adds memory dir migration (high value but user-executed), C defers everything to the user. A strikes the right balance: do the file-level cleanup that an agent can safely do, document the user-executed steps.

---

## Files to Change

### Agent-executable changes

| File | Change |
|---|---|
| `worker/index.js` | No change — `ALLOWED_ORIGINS` uses `https://dfmore.github.io` (no path) |
| `app.js` | No change — `WORKER_URL` is already `minecraft-quizzmaster-proxy.dfmore.workers.dev` |
| `index.html` | No change — no path-specific URLs |
| `style.css` | No change |
| `worker/wrangler.toml` | No change — name already `minecraft-quizzmaster-proxy` |
| `~/.claude/projects/-home-daniel-minecraft-questionnaire/memory/reference_deployment.md` | Update Game URL → `https://dfmore.github.io/minecraft-quizzmaster/`, GitHub repo → `https://github.com/dfmore/minecraft-quizzmaster` |
| `~/.claude/projects/-home-daniel-minecraft-questionnaire/memory/project_quizzmaster.md` | Update "Directory is `minecraft-questionnaire`" → `minecraft-quizzmaster` |
| `.claude/continuation.md` | Remove/update stale worktree path reference |
| `.claude/session-snapshot.json` | Update `cwd` and `worktrees` path strings |

### User-executed steps (cannot be automated)

| Step | Command / Action |
|---|---|
| Rename GitHub repo | `gh repo rename minecraft-quizzmaster` (run from repo dir) |
| Update git remote | `git remote set-url origin https://github.com/dfmore/minecraft-quizzmaster.git` |
| Rename local directory | `mv /home/daniel/minecraft-questionnaire /home/daniel/minecraft-quizzmaster` |
| Copy Claude memory | `cp -r ~/.claude/projects/-home-daniel-minecraft-questionnaire ~/.claude/projects/-home-daniel-minecraft-quizzmaster` |
| Verify GitHub Pages | Visit `https://dfmore.github.io/minecraft-quizzmaster/` — Pages auto-deploys after repo rename |
| Verify old URL redirects | Visit `https://dfmore.github.io/minecraft-questionnaire/` — GitHub redirects automatically |

---

## Phases

### Phase 1 — File updates (agent)
- Update `reference_deployment.md` with new Game URL and GitHub repo URL
- Update `project_quizzmaster.md` directory note
- Update `.claude/continuation.md` (remove stale font-sizes worktree reference)
- Update `.claude/session-snapshot.json` path strings

### Phase 2 — Infrastructure (user)
1. `gh repo rename minecraft-quizzmaster`
2. `git remote set-url origin https://github.com/dfmore/minecraft-quizzmaster.git`
3. `mv /home/daniel/minecraft-questionnaire /home/daniel/minecraft-quizzmaster`
4. `cp -r ~/.claude/projects/-home-daniel-minecraft-questionnaire ~/.claude/projects/-home-daniel-minecraft-quizzmaster`

### Phase 3 — Verification (user)
- Confirm `https://dfmore.github.io/minecraft-quizzmaster/` loads the game
- Confirm worker API still responds (no worker change needed — just verify)
- Confirm leaderboard loads (KV binding unchanged)

---

## Done Criteria

- [ ] GitHub repo is named `minecraft-quizzmaster`
- [ ] `https://dfmore.github.io/minecraft-quizzmaster/` serves the game
- [ ] `https://minecraft-quizzmaster-proxy.dfmore.workers.dev` still responds (no change needed, just verified)
- [ ] `reference_deployment.md` reflects new URLs
- [ ] Local directory is `/home/daniel/minecraft-quizzmaster`
- [ ] `git remote -v` shows `https://github.com/dfmore/minecraft-quizzmaster`
- [ ] No source file contains `minecraft-questionnaire` as a meaningful reference

---

## Decisions

| Decision | Rationale |
|---|---|
| Worker not renamed | Already named `minecraft-quizzmaster-proxy` — correct, no change |
| KV namespace not renamed | Functional name `QUIZZMASTER_LEADERBOARD` is already correct; renaming risks data loss |
| `ALLOWED_ORIGINS` not changed | Uses bare `https://dfmore.github.io` with no path — valid for any repo under that user |
| No `CNAME` file needed | No custom domain; GitHub Pages URL is the canonical URL |
| Memory dir migration is user-executed | Contains private data; agent should not copy/move `~/.claude/` automatically |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GitHub Pages does not auto-deploy after repo rename | Low | Medium | Trigger a trivial commit on `main` to force redeploy |
| Old bookmarks/links break | Low | Low | GitHub auto-redirects `minecraft-questionnaire` → `minecraft-quizzmaster` for both repo and Pages |
| Memory project key mismatch after local rename | Medium | Medium | User copies memory dir as documented in Phase 2 |
| Worker CORS rejects new Pages URL | None | — | `ALLOWED_ORIGINS` uses `https://dfmore.github.io` (no path suffix), so renaming the repo has no effect |
| KV data loss during any attempted namespace rename | N/A | High | KV is not renamed — risk eliminated |
