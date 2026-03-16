# Spec: Leaderboard Feature

## Problem

Minecraft QuizzMaster has no cross-session persistence. Players earn ranks and scores that vanish when they close the tab. Adding an arcade-style alias + cumulative leaderboard creates replayability, competition, and a reason to return. Players need a lightweight identity system (alias) and a persistent scoreboard backed by Cloudflare Workers KV.

---

## Goals

- Players enter a 5-character alias once per session before their first quiz
- Alias is stored in `localStorage` — persists across sessions unless explicitly changed
- Scores are cumulative per alias across all sessions (aliased identity persists in KV)
- Difficulty multipliers: Easy=1×, Normal=1.5×, Hard=2×, Legendary=2.5×, Insane=3×, Demon=4×
- Each correct answer = 10 base points × difficulty multiplier
- Results screen shows points earned this round alongside the existing score/rank display
- Leaderboard page shows top 10 aliases ranked by cumulative score (rank, alias, score)
- Leaderboard is accessible from the title screen
- "Change Alias" button on title screen lets users switch alias (for shared devices)
- Score submission happens automatically after each quiz completes (fire-and-forget, non-blocking)
- KV-backed API: `POST /api/score` and `GET /api/leaderboard` added to the Worker
- Leaderboard is a new `<section>` screen in `index.html` — same screen-system pattern as existing screens (no separate page, no modal)

---

## Non-Goals

- Authentication — aliases are not password-protected; collisions are a feature, not a bug (arcade style)
- Score editing, deletion, or admin UI
- Real-time leaderboard updates during a quiz round
- Pagination beyond top 10
- Anti-cheat validation
- Alias uniqueness enforcement — two players can share an alias
- Multiplayer
- DRY config refactor (tracked separately in project memory)

---

## Constraints

- Vanilla HTML/CSS/JS — no framework, no bundler, no npm on the frontend
- Press Start 2P font, CSS-only pixel-art aesthetic; new UI must match box-shadow bevel pattern exactly
- GitHub Pages hosts the static frontend — no server-side rendering
- Cloudflare Worker is the sole backend; KV is the only available persistence layer
- Worker already proxies `POST /` to Perplexity — new routes must not break existing routing
- CORS `Access-Control-Allow-Methods` currently lists only `POST, OPTIONS` — must add `GET` for leaderboard fetch
- No new dependencies; all code is vanilla
- KV namespace must be added to `wrangler.toml` and bound in Worker code

---

## Approach

### KV Schema

**Namespace:** `QUIZZMASTER_LEADERBOARD`

**Per-alias record** — key: alias (uppercase, exactly 5 chars), value: JSON string
```json
{
  "alias": "STEVE",
  "score": 420,
  "games": 7,
  "lastPlayed": "2026-03-15T12:00:00Z"
}
```

**Sorted index** — not natively supported by KV. Strategy: fetch top-N at read time via `list()` + `get()` calls. For ≤1000 aliases this is acceptable (KV `list()` returns up to 1000 keys; bulk-read with `Promise.all`). For the leaderboard `GET`, Worker fetches all keys, bulk-reads values, sorts in-memory, returns top 10.

> Trade-off: KV `list()` + bulk `get()` is O(n) reads but fine at this scale. Avoid a "sorted set" workaround (writing a separate index key) — adds complexity, risks desync.

### API Design

**`POST /api/score`**
- Body: `{ alias: string, points: number }`
- Validates alias = 5 uppercase alphanumeric chars; rejects otherwise (400)
- Validates `points` is a non-negative integer; rejects otherwise (400)
- Reads existing KV record for alias (or creates new)
- Adds `points` to cumulative `score`, increments `games`, updates `lastPlayed`
- Writes back to KV
- Response: `{ alias, newTotalScore, games }`

**`GET /api/leaderboard`**
- No body
- Worker lists all KV keys (checking `list_complete` to handle pagination if >1000 aliases), bulk-fetches values, sorts by `score` desc, returns top 10
- Response: `{ entries: [ { rank, alias, score, games } ] }`

**Routing in Worker:**
```
URL path → handler
/api/score       → handleScore(request, env)  [POST only]
/api/leaderboard → handleLeaderboard(env)     [GET only]
/               → existing Perplexity proxy   [POST only — unchanged]
```

Route on `new URL(request.url).pathname`. **Replace the existing blanket `method !== "POST" → 405` guard** with per-route method checks inside each handler (the existing Perplexity proxy handler enforces POST; the new `/api/leaderboard` handler enforces GET; `/api/score` enforces POST).

### Difficulty Multipliers

```js
const DIFFICULTY_MULTIPLIERS = {
  easy:      1,
  normal:    1.5,
  hard:      2,
  legendary: 2.5,
  insane:    3,
  demon:     4,
};
```

Points per game = `correctAnswers × 10 × multiplier`

**Note:** `GameState.score` is a raw correct-answer count (0–20), not a points total. The formula must use this count (captured at `showResults()` time, before any state reset) as `correctAnswers`. Do not refactor `GameState.score` into actual points — it is used elsewhere as a count.

This constant lives in `app.js` (frontend computes and sends `points` to worker). Worker does not need to know multipliers — it only stores/accumulates what it receives.

### Alias Entry Flow

1. On title screen, before `startGame()` runs: check `localStorage.getItem("quizzmaster_alias")`
2. If not set: show alias entry screen (new `<section id="screen-alias">`) — **this is a mandatory gate; there is no skip/cancel option**
3. Player types 5-char alias → normalise to uppercase → store in `localStorage` → proceed to title. **Enter key submits** (in addition to a submit button)
4. If already set: skip directly to game start (alias persists across sessions)
5. Show tip on alias screen: "THIS ALIAS TRACKS YOUR SCORE — you can change it anytime from the title screen"

**Change Alias flow:** Title screen has a "Change Alias" button. Clicking it navigates to the alias screen with the current alias pre-filled. User can overwrite it. New alias is saved to `localStorage`. This supports shared-device scenarios (e.g., siblings taking turns).

### Leaderboard UI

New screen: `<section id="screen-leaderboard">` — follows same `.screen` / `.active` CSS pattern.

Layout:
```
[ LEADERBOARD ]        ← gold title, same style as results-title
[ Loading... / table ] ← fetched on screen show
RANK  ALIAS  SCORE
#1    STEVE   420
#2    ALEX    390
...
[ Back ]               ← stone btn, returns to title
```

Table uses `<table>` element styled with Press Start 2P. Rank numbers colored by position: #1 gold, #2 silver (`--iron`), #3 copper (`--copper`), rest white.

**Error/loading states:** Show "Loading..." while fetching. On fetch failure, show "Could not load leaderboard" message (no retry button needed). On empty leaderboard, show "No scores yet — be the first!"

"Back" button: `id="btn-leaderboard-back"` with `btn` class styling (do not reuse existing Back button IDs to avoid query collisions).

Leaderboard link on title screen: a new button below the difficulty grid — "Leaderboard" with stone block style, navigates to leaderboard screen.

### Score Submission

Called from `showResults()` in `app.js` — fire-and-forget:
```js
submitScore(alias, pointsThisRound).catch(() => {}); // silent fail
```

Results screen shows: "Points earned: +NNN" in addition to existing score/rank display.

---

## Files to Change

| File | Change |
|------|--------|
| `index.html` | Add `<section id="screen-alias">` (alias entry), `<section id="screen-leaderboard">` (leaderboard view), "Leaderboard" and "Change Alias" buttons on title screen |
| `app.js` | Add `DIFFICULTY_MULTIPLIERS` const, alias flow (localStorage check + alias screen + change-alias flow), `submitScore()` async function, leaderboard fetch + render, `screens.alias` + `screens.leaderboard` entries, update `showResults()` to show points earned and call `submitScore()` |
| `style.css` | Styles for alias screen (input field, tip text), leaderboard screen (table, rank rows, position colors) |
| `worker/index.js` | Add URL-based routing, `handleScore()`, `handleLeaderboard()`, update CORS to allow `GET`, bind `QUIZZMASTER_LEADERBOARD` KV namespace |
| `worker/wrangler.toml` | Add `[[kv_namespaces]]` binding for `QUIZZMASTER_LEADERBOARD` |

---

## Overlap

No active worktrees found. The `humor-prompts` and `perplexity-switch` worktrees are both shipped and cleaned up. No file conflicts.

---

## Phases

- [x] **Phase 1 — Worker KV API**
  - [x] Add `[[kv_namespaces]]` to `wrangler.toml` (builder adds placeholder ID; user creates namespace with `wrangler kv namespace create` and fills ID)
  - [x] Add `handleScore()` to `worker/index.js` (POST /api/score)
  - [x] Add `handleLeaderboard()` to `worker/index.js` (GET /api/leaderboard)
  - [x] Add URL-based routing before existing Perplexity proxy block
  - [x] Update CORS `Allow-Methods` to include `GET`
  - [ ] Smoke-test with `curl` against local `wrangler dev` (requires user to deploy with real KV ID)

- [x] **Phase 2 — Alias system**
  - [x] Add `<section id="screen-alias">` to `index.html`
  - [x] Add alias screen CSS to `style.css` (input styling matching pixel-art bevel aesthetic)
  - [x] Add `DIFFICULTY_MULTIPLIERS` const to `app.js`
  - [x] Add alias check logic to `app.js` — intercepts difficulty button click, shows alias screen if not set in `localStorage`
  - [x] Store validated alias in `localStorage`, then proceed to game
  - [x] Add "Change Alias" button to title screen — navigates to alias screen with current alias pre-filled
  - [x] Add tip text on alias screen

- [x] **Phase 3 — Score submission + results integration**
  - [x] Add `submitScore()` async function to `app.js`
  - [x] Call from `showResults()` — fire-and-forget
  - [x] Show "Points earned: +NNN" on results screen (new DOM element in `index.html`, new CSS)
  - [x] Compute `pointsThisRound = GameState.score × 10 × DIFFICULTY_MULTIPLIERS[difficulty]`

- [x] **Phase 4 — Leaderboard UI**
  - [x] Add "Leaderboard" button to title screen in `index.html`
  - [x] Add `<section id="screen-leaderboard">` to `index.html`
  - [x] Add leaderboard CSS (table, rank colors) to `style.css`
  - [x] Add `showLeaderboard()` function to `app.js` — fetches `GET /api/leaderboard`, renders table
  - [x] Add `screens.leaderboard` to `screens` object and `showScreen()` compatible

- [ ] **Phase 5 — Deploy**
  - [ ] User runs `wrangler kv namespace create QUIZZMASTER_LEADERBOARD`
  - [ ] User fills namespace ID into `wrangler.toml`
  - [ ] `wrangler deploy` from `worker/` directory
  - [ ] Push frontend to GitHub Pages (`git push`)
  - [ ] Smoke-test full flow: alias entry → quiz → score submission → leaderboard

---

## Done Criteria

- [ ] Alias prompt appears on first difficulty selection if no alias in `localStorage`
- [ ] Alias is 5 chars, normalized to uppercase, stored in `localStorage`
- [ ] "Change Alias" button on title screen opens alias screen with current alias pre-filled
- [ ] Alias persists across browser sessions until explicitly changed
- [ ] Tip text visible on alias screen
- [ ] After quiz, results screen shows "Points earned: +NNN" with correct multiplier applied
- [ ] `POST /api/score` with valid alias and points returns 200 and updated total
- [ ] `POST /api/score` with invalid alias (wrong length, non-alphanumeric) returns 400
- [ ] `GET /api/leaderboard` returns `{ entries: [...] }` with up to 10 entries sorted by score desc
- [ ] Leaderboard screen accessible from title screen button
- [ ] Leaderboard table shows rank, alias, score — #1 gold, #2 silver, #3 copper
- [ ] "Back" button on leaderboard returns to title screen
- [ ] Score submission failure is silent — does not block UI or show error
- [ ] All new UI matches Press Start 2P font, box-shadow bevel buttons, `--night` background
- [ ] Existing quiz flow unaffected (no regression on title → loading → quiz → results path)
- [ ] Worker CORS allows GET for leaderboard endpoint
- [ ] No new external dependencies added

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Separate leaderboard screen (not modal) | Existing codebase uses a screen system — 5 named screens, toggled by `active` class. Adding a 6th screen is the zero-friction pattern. Modal would require new CSS patterns and overlay logic. |
| Alias screen (7th screen) instead of inline prompt | Keeps the game flow distinct. A dialog over the title screen would conflict with the existing screen system; a dedicated screen is consistent. |
| localStorage (not sessionStorage) for alias | Alias persists across sessions so players don't have to re-enter every time. A "Change Alias" button on the title screen supports shared devices. |
| Frontend computes points, sends to Worker | Keeps difficulty multiplier logic colocated with game logic in `app.js`. Worker is a dumb accumulator. Avoids needing to sync multiplier constants between two runtimes. |
| KV list+bulk-get for leaderboard (not sorted index) | At ≤1000 aliases, KV list() + Promise.all(get()) is fast enough. A secondary sorted index key would risk desync on concurrent writes and adds write complexity. Re-evaluate if user count grows. |
| Uppercase alias (5 alphanumeric chars) | Matches arcade aesthetics. Short enough to memorise, long enough for variety. Uppercase normalisation prevents case-collision duplicates. |
| Fire-and-forget score submission | Score submission failure should never block the results screen. Network errors are silent. Leaderboard is a bonus feature, not core gameplay. |
| Alias screen tip (not alert/modal) | Inline tip text in the alias screen is less disruptive than a browser alert and fits the pixel-art UI pattern. |
| Multipliers: Easy=1×, Normal=1.5×, Hard=2×, Legendary=2.5×, Insane=3×, Demon=4× | Each difficulty gets a distinct, escalating multiplier. Gradual ramp rewards progression without making Easy feel worthless or Demon feel mandatory. |

---

## Approaches

### Approach A — Surgical (Minimal)
**Summary:** Add only alias + score submission + a minimal leaderboard API. Leaderboard display is read-only via direct `GET` URL — no in-app UI screen.

| File | Change |
|------|--------|
| `index.html` | Add alias screen only |
| `app.js` | Alias logic, `submitScore()`, points display on results |
| `style.css` | Alias screen input styles only |
| `worker/index.js` | `handleScore()`, `handleLeaderboard()`, routing, CORS GET |
| `worker/wrangler.toml` | KV namespace binding |

**Pros:** Fewer files touched for UI, faster to ship, leaderboard API exists for future
**Cons:** No in-app leaderboard — players can't see rankings without navigating to a raw JSON URL; defeats the competitive purpose
**Risk:** Feature feels incomplete; user likely to immediately ask for the leaderboard UI anyway

---

### Approach B — Structural (Full)
**Summary:** Full implementation as described in the Approach section above — alias screen, score submission, leaderboard screen, all integrated into the screen-system.

| File | Change |
|------|--------|
| `index.html` | Alias screen, leaderboard screen, leaderboard nav button, points-earned element |
| `app.js` | `DIFFICULTY_MULTIPLIERS`, alias flow, `submitScore()`, `showLeaderboard()`, results update |
| `style.css` | Alias screen, leaderboard table, rank colors, points-earned display |
| `worker/index.js` | Routing, `handleScore()`, `handleLeaderboard()`, CORS update |
| `worker/wrangler.toml` | KV namespace binding |

**Pros:** Complete feature; competitive loop closed; fits existing screen-system pattern exactly; no deferred UI work
**Cons:** Touches 5 files; more CSS to write; more DOM to add
**Risk:** Low — all patterns already exist in codebase; no new architectural concepts

---

### Approach C — Pragmatic (Incremental with Phases)
**Summary:** Identical scope to Approach B but with explicit phase gates — Worker API first (testable in isolation), then frontend alias, then score submission, then leaderboard UI.

Same files as Approach B. Difference is implementation order and verification checkpoints per phase.

**Pros:** Each phase is independently deployable and smoke-testable; catches Worker bugs before frontend depends on it; lower cognitive load per phase
**Cons:** Same total scope as B; slightly more round-trips between `wrangler deploy` and frontend push
**Risk:** Low — phases are already defined in this spec; builder naturally follows them

---

**Recommended Approach: C (Pragmatic)**

Approach B and C are identical in scope and files touched. The difference is implementation discipline. Given that the Worker KV API is the riskiest new piece (new namespace binding, new routing, new KV read/write patterns), validating it before building UI on top of it reduces debugging surface. The phased structure is already written in this spec — Approach C simply formalises following it. The `humor-prompts` and `perplexity-switch` history shows this project ships in small, verified increments. Approach C matches that pattern.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| KV namespace ID not filled in `wrangler.toml` before deploy | High | Phase 5 instructions are explicit; builder leaves placeholder comment; `wrangler deploy` will fail with clear error if not set |
| Worker routing breaks existing Perplexity proxy | Medium | Route on `pathname` before the existing POST guard; `/api/*` paths never reach Perplexity logic; write a smoke test curl against `/` after routing change |
| CORS `GET` not added to preflight response | Medium | Update both `Access-Control-Allow-Methods` header string and the OPTIONS preflight handler simultaneously |
| KV `list()` + bulk `get()` slow if alias count grows large | Low (now) | Acceptable for this project scale; document the O(n) note in Worker code |
| Alias collision (two players share alias) | Medium | By design — alias is not a unique identity, it is an arcade tag. Document clearly in tip text |
| Alias in `localStorage` accessible to any user on shared device | Expected | "Change Alias" button on title screen mitigates; no password protection needed for a casual quiz game |
| Score submission race condition (submit fires while KV is mid-write from another tab) | Low | KV writes are atomic per-key at CF edge; concurrent writes to same alias will have last-write-wins semantics — acceptable for a casual leaderboard |
| Press Start 2P input field rendering inconsistency across browsers | Low | `<input>` with font-family override and box-shadow bevel matches existing button pattern; test on Chrome + Firefox |
