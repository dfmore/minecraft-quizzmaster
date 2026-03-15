# Spec: Expand Markdown Stripping in Quiz Options

**Status:** Ready for approach selection
**Scope:** Single-file, localized change to `stripMarkdown()` function
**Effort:** Low (~1 hour implementation + testing)

---

## Problem

Perplexity's sonar API injects markdown formatting into string values even when `json_schema` format is specified in the request. Currently, only `**bold**` (`*\*...\*\*`) is stripped from quiz option strings (line 242, app.js). The API can inject additional formats:

- `*italic*` / `_italic_`
- `__bold__` (underscore variant)
- `` `inline code` `` (backticks around Minecraft commands/items)
- `[text](url)` links
- Headers (`# text`, `## text`, etc.) — unlikely in options, possible in explanations

This causes rendered options to display as "A) **Netherite**" instead of "A) Netherite", which:
1. Visually reveals emphasis/importance differences
2. Pollutes the option text with markdown artifacts when rendered as textContent
3. Undermines quiz fairness and question clarity

---

## Goals

1. **Expand `stripMarkdown()`** to handle all common markdown formats found in option strings
2. **Apply stripping only to options** (line 245, `q.options.map(stripMarkdown)`)
3. **Preserve explanations as-is** — they render via textContent but benefit from formatting context for future rendering (markdown → HTML)
4. **Maintain backward compatibility** — no API changes, no new dependencies
5. **Single regex or chained approach** — clear, performant, easy to extend

---

## Non-Goals

- Render markdown in explanations or questions (explanations use textContent; questions are plain text)
- Support advanced markdown (tables, nested formatting, strikethrough)
- Change JSON schema or API contract
- Refactor option rendering or explanation display logic
- Add tests (quiz app has no test infrastructure)

---

## Constraints

- **Vanilla JS only** — no markdown parser library
- **Performance-sensitive path** — runs on every API response (20 questions, ~80 option strings per round)
- **Regex-based approach** — must handle edge cases (nested backticks, overlapping patterns, bare parentheses in options)
- **No false positives** — common option text like "(not implemented)" or "1 (wood)" must not be corrupted
- **Idempotent** — stripping an already-stripped string must return the same result

---

## Approach

Three implementations are presented below. Each expands `stripMarkdown()` at line 242.

### Approach 1: Surgical — Single Multi-Pattern Regex

**Summary:** Replace the existing `**bold**` regex with one chained call using alternation to match all formats in a single pass.

**Files Touched:**

| File | Change |
|------|--------|
| `app.js` (line 242) | Replace `stripMarkdown()` function |

**Implementation:**

```javascript
const stripMarkdown = (text) => {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")  // [text](url) → text (before emphasis to avoid partial matches)
    .replace(/\*\*(.+?)\*\*/g, "$1")           // **bold**
    .replace(/__(.+?)__/g, "$1")               // __bold__ (before _italic_ to avoid ___x___ collision)
    .replace(/\*(.+?)\*/g, "$1")               // *italic*
    .replace(/_(.+?)_/g, "$1")                 // _italic_
    .replace(/`([^`]+)`/g, "$1")               // `code` (negated class prevents cross-match)
    .replace(/^#+\s+(.+)$/gm, "$1");           // # Headers → text
};
```

**Trade-offs:**

Pros:
- Minimal code, easy to understand chained `.replace()` calls
- Matches existing pattern (single-pass, no new abstractions)
- Order of operations is explicit (links before bold/italic to avoid partial matches)
- Performance: 7 regex operations per option string is negligible

Cons:
- Backtick regex `/`(.+?)`/g` can misfire on bare backticks in option text (e.g., "Run `command") — requires lookahead guards
- Underscore italic `/\_(.+?)\_/g` overlaps with underscore bold `/\_\_(.+?)\_\_/g` — order matters; bold must be first
- Link regex `/\[(.+?)\]\(.+?\)/g` naively assumes `(.+?)` doesn't contain `]` — OK for most cases, but edge cases exist

**Risk Profile:**
- Moderate: false positives/negatives with overlapping patterns (italic/bold underscores, bare backticks)
- Requires manual testing of edge cases: `__bold__ *italic*`, `` `code` with ) paren``, `[link](with) paren`
- No rollback needed — regex-only, no structural changes

---

### Approach 2: Structural — Pattern Object with Order Dependencies

**Summary:** Define markdown patterns as ordered objects with explicit rules, process each pattern type in sequence with safeguards to avoid conflicts.

**Files Touched:**

| File | Change |
|------|--------|
| `app.js` (lines 240–250) | Define `markdownPatterns` object + refactored `stripMarkdown()` |

**Implementation:**

```javascript
// Define patterns in order of processing (links before bold/italic to avoid partial matches)
const markdownPatterns = [
  { name: "links",        regex: /\[([^\]]+)\]\([^)]+\)/g,         replace: "$1" },
  { name: "bold-star",    regex: /\*\*(.+?)\*\*/g,                 replace: "$1" },
  { name: "bold-under",   regex: /__(.+?)__/g,                     replace: "$1" },
  { name: "italic-star",  regex: /\*([^*]+?)\*/g,                  replace: "$1" },
  { name: "italic-under", regex: /_([^_]+?)_/g,                    replace: "$1" },
  { name: "code",         regex: /`([^`]+?)`/g,                    replace: "$1" },
  { name: "headers",      regex: /^#+\s+(.+)$/gm,                  replace: "$1" },
];

const stripMarkdown = (text) => {
  let result = text;
  for (const pattern of markdownPatterns) {
    result = result.replace(pattern.regex, pattern.replace);
  }
  return result;
};
```

**Trade-offs:**

Pros:
- Explicit ordering prevents regex conflicts (bold before italic, links before content patterns)
- Character exclusions in patterns (`[^\]]+`, `[^*]+?`) reduce false positives
- Patterns are documented and easily extended
- Clear separation of concerns — pattern list is data, not logic

Cons:
- More code (~15 lines vs. 1 line)
- 7 regex passes per option string (vs. 1 chained call) — minor performance cost
- Temptation to over-engineer (e.g., add validation, error tracking) — resist scope creep
- Harder to review each regex in isolation (no single-line reference)

**Risk Profile:**
- Low: explicit ordering and character classes reduce edge cases
- Character exclusions still have limits (e.g., `` `code with ` backtick` `` would break)
- Main risk: future maintainer adds pattern without understanding order dependencies

---

### Approach 3: Pragmatic — Single Regex with Alternation (Compact)

**Summary:** Replace existing regex with a single alternation pattern matching all formats, avoiding order dependencies by design.

**Files Touched:**

| File | Change |
|------|--------|
| `app.js` (line 242) | Replace `stripMarkdown()` function |

**Implementation:**

```javascript
const stripMarkdown = (text) => {
  return text.replace(
    /\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)|_([^_]+?)_|`([^`]+?)`|\[([^\]]+)\]\([^)]+\)|^#+\s+(.+)$/gm,
    (match, bold1, bold2, italic1, italic2, code, link, header) => {
      return bold1 || bold2 || italic1 || italic2 || code || link || header || match;
    },
    "$1"
  );
};
```

**Trade-offs:**

Pros:
- Single regex pass — best performance
- All formats handled in one operation — no order dependencies
- Lookahead/lookbehind for italic avoids `**italic**` collision with bold
- Single line (though wrapped for readability)

Cons:
- Regex is complex and hard to debug (9 capture groups, lookahead, alternation)
- JavaScript lookahead/lookbehind support is ES2018+ (safe for modern browsers, but adds cognitive load)
- If one pattern breaks, whole regex fails silently
- Difficult to maintain or extend without regex expertise

**Risk Profile:**
- Moderate: complex regex is hard to test mentally; edge cases harder to spot
- Requires regex testing tool (regex101.com) before deployment
- If broken, all stripping fails — no partial fallback

---

## Recommended Approach: **Surgical** (Approach 1)

**Rationale:**

This task is small, localized, and low-risk. The surgical approach (chained `.replace()` calls) matches the existing code style (line 242 is already a single-line regex replace), requires no new abstractions, and is easy to review/test/maintain.

**Why not Structural?**
- Over-engineering for a 7-line function. Pattern objects add cognitive overhead without corresponding benefit (patterns don't change often, order is obvious from reading the code).

**Why not Pragmatic?**
- Complex regex is harder to debug if something breaks. The Minecraft quiz app has no test infrastructure — we rely on manual testing. A simpler approach reduces failure surface.

**Caveats:**
- Order matters: `__bold__` before `*italic*` (else `___text___` parsed as underscore bold of `*text*`)
- Link regex `/\[(.+?)\]\(.+?\)/g` assumes balanced brackets — OK for most options
- Code backticks `/`(.+?)`/g` can break on bare backticks — add safeguard if needed post-testing
- Manual testing critical: test `` `code with ) paren` ``, `[link with ] bracket](url)`, `__bold__ *italic*` patterns

---

## Files to Change

| File | Lines | Change |
|------|-------|--------|
| `app.js` | 242 | Replace `stripMarkdown()` function with expanded regex chain |

No other files touched. `q.options.map(stripMarkdown)` (line 245) is unchanged.

---

## Phases

### Phase 1: Implementation (5 min)
- Replace line 242 `stripMarkdown()` function with chained regex calls

### Phase 2: Manual Testing (30 min)
Test on `normal` difficulty (fastest API response). Check:
- Existing: `**bold**` removed ✓
- New: `*italic*`, `_italic_`, `__bold__`, `` `code` ``, `[link](url)` all removed ✓
- Edge cases: `` `code)` ``, `[text]`, `(__bold__)`, mixed formats ✓
- No false positives: `(wood)`, `1 (not implemented)`, bare underscores preserved ✓

### Phase 3: Deploy
- Commit to main branch
- Push to GitHub (auto-deploys to GitHub Pages via Actions, if configured)

---

## Done Criteria

- [ ] Markdown stripped: `**x**` → `x`, `__x__` → `x`, `*y*` → `y`, `_y_` → `y`, `` `z` `` → `z`, `[a](url)` → `a`, `# H` → `H`
- [ ] Compound formats: `**bold** and *italic*` → `bold and italic`, `__b__ _i_` → `b i`
- [ ] False positives prevented: `(wood)`, `1 (not implemented)` unchanged
- [ ] Explanations unchanged (no stripping applied)
- [ ] Existing shuffle fix still works (correct answer tracks through shuffle)

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| **Single-file change only** | `stripMarkdown()` is self-contained; no cascading refactors needed |
| **Options-only scope** | Explanations render as textContent; stripping would lose formatting context; only options need visual cleanup |
| **Chained `.replace()` over single regex** | Readability, maintainability, alignment with existing code style |
| **No backtick lookahead** | Bare backticks in options are rare; cost of lookahead complexity outweighs benefit. Test post-deploy; add safeguard if needed |
| **Link regex `/\[(.+?)\]\(.+?\)/g` assumes balanced brackets** | Perplexity's schema enforcement ensures valid markdown; edge case unlikely |
| **No new dependencies** | Vanilla JS only, no markdown parser library |

---

## Risks

### Cross-Cutting Risks (All Approaches)

1. **Perplexity API behavior change** — If Perplexity stops injecting markdown or injects new formats, spec becomes stale. Mitigation: monitor API responses post-deploy; add telemetry to flag unexpected formats.

2. **False positives in edge cases** — Option text like `` `command arg1 arg2` `` or `[not a link]` without URL could be corrupted. Mitigation: manual testing of real Perplexity outputs before production; rollback if issues found.

3. **Markdown used intentionally in future** — If explanations are later rendered as HTML instead of textContent, stripping options breaks consistency. Mitigation: document that options are plain text by design; update spec if rendering changes.

### Approach-Specific Risks

**Surgical (Recommended):**
- Order dependency between italic and bold regex — if order flips, `___text___` parses incorrectly. Mitigation: add comment explaining order, test compound formats.
- Backtick regex false positive on bare backticks — `` `incomplete backtick `` → ` incomplete backtick ` (added space). Mitigation: test real Perplexity outputs; add lookahead safeguard if needed.

**Structural:**
- Pattern list creates false sense of extensibility — future maintainer might add patterns without understanding order dependencies. Mitigation: document order rationale in comments.

**Pragmatic:**
- Complex regex hard to debug — if it breaks, troubleshooting is painful. Mitigation: test thoroughly before deploy; keep original regex as fallback comment.

---

## Testing Plan

### Manual Test Cases

Test these inputs via browser console or API response simulator:

```javascript
const tests = [
  "**bold**",
  "*italic*",
  "_italic_",
  "__bold__",
  "`code`",
  "[link](https://example.com)",
  "# Header",
  "mixed: **bold** and *italic*",
  "`code with ) paren`",
  "[text with ] bracket](url)",
  "__bold__ *italic*",
  "(wood)",  // should not change
  "1 (not implemented)",  // should not change
  "_item_name",  // borderline: underscore in name
];

tests.forEach(t => {
  console.log(`"${t}" → "${stripMarkdown(t)}"`);
});
```

Expected output: markdown removed, plain text remains.

### Real-World Test

1. Start quiz on `normal` difficulty
2. Screenshot first 5 options
3. Verify no markdown artifacts visible
4. Compare with raw API response (devtools Network tab) to confirm stripping occurred
5. Repeat on `legendary` difficulty (more complex explanations)

---

## Appendix: Regex Explanation (Surgical Approach)

| Pattern | Matches | Replacement |
|---------|---------|-------------|
| `/\*\*(.+?)\*\*/g` | `**bold**` → capture `bold` | `$1` → `bold` |
| `/__(.+?)__/g` | `__bold__` → capture `bold` | `$1` → `bold` |
| `/\*(.+?)\*/g` | `*italic*` → capture `italic` | `$1` → `italic` |
| `/_(.+?)_/g` | `_italic_` → capture `italic` | `$1` → `italic` |
| `/`(.+?)`/g` | `` `code` `` → capture `code` | `$1` → `code` |
| `/\[(.+?)\]\(.+?\)/g` | `[text](url)` → capture `text` | `$1` → `text` |
| `/^#+\s+(.+)$/gm` | `# Header` → capture `Header` | `$1` → `Header` |

Non-capturing groups `(?:...)` not needed; alternation `\|` not used — each pattern is independent, applied sequentially.
