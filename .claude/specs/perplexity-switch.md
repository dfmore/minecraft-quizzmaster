# Spec: Switch from Mistral to Perplexity Sonar

**Status:** Draft — awaiting approach selection
**Date:** 2026-03-15
**Project dir:** `/home/daniel/minecraft-questionnaire`

---

## Problem

Mistral API hallucinates Minecraft facts (e.g., incorrect block values, made-up mechanics) and responds slowly (~45s per round). This degrades question quality and breaks game UX. Perplexity `sonar` is a search-native LLM with OpenAI-compatible API that grounds responses in web search results, eliminating hallucinations and improving response time to ~10-15s per round.

---

## Goals

- Replace Mistral with Perplexity sonar for question generation
- Eliminate hallucinated facts while maintaining question variety and difficulty differentiation
- Reduce response latency from ~45s to ~10-15s per round
- Maintain existing question schema, game flow, and difficulty tiers
- Minimize code changes (direct API swap)
- Keep API key secure (Cloudflare Worker secret)

---

## Non-Goals

- DRY refactor (hardcoded config, repeated model names)
- New features or game mechanics
- Changes to system prompt strategy or question schema
- Performance optimization beyond switching providers
- UI/UX changes

---

## Constraints

- Perplexity sonar uses OpenAI-compatible API (drop-in replacement for Mistral endpoint structure)
- Same `response_format: {type: "json_object"}` support required for reliable parsing
- Single model name: `sonar` (no difficulty-based model switching; all difficulties use same model)
- No thinking-mode response parsing needed (sonar returns `content` as string, not array)
- API key must be stored as Cloudflare Worker secret: `PERPLEXITY_API_KEY`
- GitHub Pages origin allowlist in worker unchanged

---

## Approach

### Surgical (Smallest Blast Radius) — RECOMMENDED

Direct swap: URL, secret name, model names, remove magistral response parsing.

**Files touched:**

| Path | Change | Lines affected |
|------|--------|-----------------|
| `worker/index.js` | Change URL from `api.mistral.ai/v1/chat/completions` to `https://api.perplexity.ai/chat/completions`; rename `MISTRAL_API_KEY` to `PERPLEXITY_API_KEY` everywhere; update error messages | Lines 15, 80-81, 104 |
| `app.js` | Change all model names in `MODELS` object from `mistral-large-latest` / `magistral-medium-latest` to `sonar`; remove the `Array.isArray(content)` thinking-mode response parsing (lines 199-208) and use string path only | Lines 13-20, 199-208 |
| `worker/wrangler.toml` | Update comments to reference Perplexity instead of Mistral | Lines 2, 13-14 |

**Trade-offs:**

_Pros:_
- Fewest changes; reuses existing request/response infrastructure
- No risk of introducing new abstractions or breaking existing patterns
- Fastest path to validation; same game flow, same schema

_Cons:_
- Model names still hardcoded in `MODELS` object (duplication across difficulties)
- No flexibility if Perplexity ever adds multiple models (unlikely in near term)

**Risk:** Low. All changes are literal string substitutions. Response format is identical to Mistral (no thinking-mode array); sonar returns plain string `content`.

---

### Structural (Config-Driven Models)

Extract API provider config into a separate `config.js` file externalizing model names, API endpoint, and secret name.

**Files touched:**

| Path | Change | Lines affected |
|------|--------|-----------------|
| `config.js` | New file: export `PROVIDER` object with model names, endpoint URL, secret name | New |
| `app.js` | Import `PROVIDER` from config.js; replace hardcoded `MODELS` with `PROVIDER.models` | Lines 1, 13-20 |
| `worker/index.js` | Import `PROVIDER` from config.js; use `PROVIDER.url` and `PROVIDER.secretName` | Lines 15, 80-81, 104 |
| `worker/wrangler.toml` | Reference secret name from config (via comment) | Lines 2, 13-14 |

**Trade-offs:**

_Pros:_
- Centralizes provider config; single point of change for future provider swaps
- Documents provider abstraction cleanly
- Easier to extend with new providers later (though unlikely)

_Cons:_
- One extra file to maintain
- Adds a minor import dependency; adds decision point about what belongs in config
- Slightly over-engineered for current scope

**Risk:** Low-medium. Config file adds a single point of failure (if import breaks, game breaks). Requires coordination between worker and app imports.

---

### Pragmatic (Feature Flags)

Keep API provider as a build-time or runtime flag; externalize both Mistral and Perplexity endpoints in a `config.js` with a `ACTIVE_PROVIDER` switch.

**Files touched:**

| Path | Change | Lines affected |
|------|--------|-----------------|
| `config.js` | New file: define `PROVIDERS = {mistral: {...}, perplexity: {...}}` and `ACTIVE_PROVIDER = "perplexity"` | New |
| `app.js` | Import `PROVIDERS` and `ACTIVE_PROVIDER` from config.js; use `PROVIDERS[ACTIVE_PROVIDER].models` | Lines 1, 13-20, 166 |
| `worker/index.js` | Import and use `PROVIDERS[ACTIVE_PROVIDER]` for URL and secret name | Lines 1, 15, 80-81, 104 |
| `worker/wrangler.toml` | Comment notes switch location | Lines 2, 13-14 |

**Trade-offs:**

_Pros:_
- Can flip between Mistral and Perplexity with one-line flag change
- Useful if switching needs to be rapid or reversible
- Future-proofs against provider pivots

_Cons:_
- Maintains dead code (Mistral config) indefinitely
- Increases config complexity for a decision that is final (not temporary)
- Adds runtime branching and multiple config objects

**Risk:** Medium. Dual provider config can become stale or inconsistent if only one branch is actively maintained.

---

## Recommendation: Approach 1 — Surgical

**Why:** This is a decisive, non-reversible provider swap. Mistral is being replaced, not swapped back. The Surgical approach changes only what must change, reuses all existing patterns (request/response handling, error cases, game flow), and ships the fastest. The hardcoded model names are not a source of bugs — they work today and will work after the swap. Adding a `config.js` layer for a one-time change introduces ceremony without payoff. The Pragmatic approach is premature optimization for a scenario (rapid provider flips) that isn't in scope.

**Timing:** ~15 minutes for code changes + 5 minutes per deployment step (worker deploy, secret store, smoke test). Total: ~1 hour end-to-end.

---

## Files to Change

| Path | Type | Current | New |
|------|------|---------|-----|
| `worker/index.js` | Modify | Mistral URL, `MISTRAL_API_KEY`, error messages | Perplexity URL, `PERPLEXITY_API_KEY`, updated messages |
| `app.js` | Modify | `mistral-large-latest` / `magistral-medium-latest` models, thinking-mode response parsing | `sonar` for all difficulties, remove `Array.isArray` branch |
| `worker/wrangler.toml` | Modify | Mistral references in comments | Perplexity references in comments |

---

## Phases

### Phase 1 — Code Changes (Local)

- [ ] Edit `worker/index.js`: Line 15: change `MISTRAL_API_URL` to `"https://api.perplexity.ai/chat/completions"`
- [ ] Edit `worker/index.js`: Line 80 and 81: change `MISTRAL_API_KEY` to `PERPLEXITY_API_KEY`
- [ ] Edit `worker/index.js`: Line 104: change `${env.MISTRAL_API_KEY}` to `${env.PERPLEXITY_API_KEY}`
- [ ] Edit `app.js`: Lines 13-20: replace all model names in `MODELS` object with `"sonar"`
- [ ] Edit `app.js`: Lines 199-208: remove the entire `if (Array.isArray(content)) { ... }` branch; keep only the `else if (typeof content === "string")` path
- [ ] Edit `worker/wrangler.toml`: Lines 2, 13-14: update comments from Mistral to Perplexity references
- [ ] Verify changes compile: `node app.js` (syntax check) and `node worker/index.js` (syntax check)

### Phase 2 — Deploy Worker

- [ ] From `worker/` directory: `wrangler deploy`
- [ ] Verify deploy succeeds with output showing worker URL

### Phase 3 — Set API Key

- [ ] From `worker/` directory: `wrangler secret put PERPLEXITY_API_KEY` (paste key when prompted)
- [ ] Verify key is stored: `wrangler secret list` (should show `PERPLEXITY_API_KEY` in list; value is masked)

### Phase 4 — Smoke Test

- [ ] Load game in browser at GitHub Pages URL
- [ ] Select "Easy" difficulty
- [ ] Verify "Generating world..." loading screen appears (~10-15s)
- [ ] Verify 20 questions load without error
- [ ] Answer all 20 questions, verify score displays correctly
- [ ] Select "Demon" difficulty, verify same flow works for hardest tier
- [ ] Verify questions are factually accurate (spot-check 3-5 answers against Minecraft wiki)
- [ ] Check browser console for any JavaScript errors

---

## Done Criteria

- [ ] Worker deploys without syntax or runtime errors
- [ ] `wrangler secret list` shows `PERPLEXITY_API_KEY` (value masked)
- [ ] Game loads and generates questions at selected difficulty (Easy through Demon)
- [ ] Response time is under 30 seconds (target ~10-15s)
- [ ] Questions are factually accurate (verify via web search or wiki cross-reference)
- [ ] All 20 questions render and are selectable
- [ ] Score calculation is correct after game completes
- [ ] Results screen displays correct rank (Wood through Netherite)
- [ ] No console errors during full game session
- [ ] Difficulty selection still works (all 6 buttons generate distinct sets of questions)

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Sonar (not pro/pro-search) | Sonar is optimized for fact-grounded generation with web search; pro is more expensive and slower; sonar is the cost/quality sweet spot |
| Single model for all difficulties | Sonar is versatile enough to scale complexity via system prompt alone; no need for separate reasoning models |
| Remove thinking-mode parsing | Sonar returns plain string content, not typed chunks; simplifies response parsing and reduces latency (no reasoning trace overhead) |
| Direct string swap, no config abstraction | Minimal, lowest-risk change; this is a one-time provider swap, not a pluggable system |
| Keep WORKER_URL unchanged | Worker endpoint and origin allowlist remain the same; only internal API call changes |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Perplexity API key not yet available | Medium | Blocks testing | User must obtain key from Perplexity account before Phase 3 |
| Sonar response format differs from expected | Low | Game breaks on parse | Wrap JSON.parse in try/catch (already in place); error screen shows parse error |
| Response latency still slow (~30-45s) | Low | Poor UX | Perplexity sonar is search-grounded; if slow, contact Perplexity support or fall back to Mistral |
| First request schema compilation penalty | Medium | Initial request takes 10-30s longer | Expected behavior for LLM schema enforcement; documented in loading message |
| PERPLEXITY_API_KEY secret not set before deploy | Medium | Worker returns 500 error | Phase 3 explicitly stores key; error message in worker instructs user to set secret |
| Browser origin not in allowlist | Low | Worker rejects request with 403 | Allowlist in worker already includes GitHub Pages URL; if repo moves, update line 22 |
| Sonar hallucinating different (but still wrong) facts | Low | Question quality regression | System prompt validates facts; sonar is search-grounded (less prone to hallucination than Mistral); spot-check answers after deploy |

---

## Notes

- **No breaking changes to game logic or schema.** The response format (JSON with `questions` array) is identical.
- **Perplexity request body is identical to Mistral.** OpenAI-compatible API means no translation layer needed.
- **Response time improvement is primary benefit.** Sonar's search grounding (vs. Mistral's closed knowledge) eliminates hallucinations and enables faster iteration.
- **First request may include schema compilation cost.** Perplexity enforces `response_format: json_object` at generation time, adding 10-30s to first response. Subsequent requests are faster.
- **Reverting is simple:** If Perplexity doesn't work as expected, revert this spec's code changes and redeploy worker + restor Mistral secret.
