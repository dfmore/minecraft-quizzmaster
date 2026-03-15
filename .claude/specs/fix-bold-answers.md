# Spec: Remove Bold Markdown from Answer Options

## Problem

Correct answers in the quiz are visually distinguishable before selection because Perplexity's API response includes bold markdown formatting (`**answer**`) in the option strings. The markdown renders as bold text in the browser (particularly noticeable on mobile), breaking the quiz's fairness by revealing which answer is correct before the player selects it.

This affects all difficulty modes: easy, normal, hard, legendary, insane, and demon.

## Goals

- Remove all bold markdown (`**...**`) from answer option strings before rendering
- Ensure this works across all difficulty modes and question types
- Maintain the integrity of the answer text (no truncation or corruption)
- Remove any other markdown that might appear (if any)
- Verify the fix works on both mobile and desktop

## Non-Goals

- Modify the Perplexity API prompt (already working correctly, just returning formatted text)
- Change how the frontend renders text (already using `textContent`, not `innerHTML`)
- Add markdown support to other fields (questions, explanations should keep their text as-is)
- Implement conditional formatting or styling based on correct/wrong (already handled by CSS classes)

## Constraints

- The fix must be applied before options are displayed to the player
- Must not break JSON schema validation
- Must handle edge cases (multiple bold sections, nested markdown, etc.)
- Must work consistently across all difficulty levels

## Approach

**Key finding:** The bold markdown is coming directly from Perplexity's JSON response in the `options` array. The frontend already uses `textContent` to render (no HTML interpretation), so the markdown characters are displayed literally.

**Solution:** Add a post-processing step in `generateQuestions()` to strip bold markdown (`**...**`) from all option strings immediately after parsing the JSON response.

### Implementation Steps

1. Create a utility function `stripMarkdown(text)` that removes `**...**` patterns
2. Call this function on each option in each question after JSON parsing, before returning the questions array
3. Keep the function simple and focused — only handle bold (`**`)
4. Add a comment explaining why this is necessary (Perplexity API quirk)

### Code Location

- **File to modify:** `/home/daniel/minecraft-questionnaire/app.js`
- **Function:** `generateQuestions()` (around line 235-250)
- **Where:** After `JSON.parse()` succeeds, before `questions.filter()` and return

## Files to Change

| File | Change |
|------|--------|
| `/home/daniel/minecraft-questionnaire/app.js` | Add `stripMarkdown()` utility function and apply it to all options after JSON parsing |

## Phases

- [x] Phase 1: Add `stripMarkdown()` utility function
- [x] Phase 2: Apply the utility to options during question processing
- [ ] Phase 3: Test across all difficulty modes (easy, normal, hard, legendary, insane, demon)
- [ ] Phase 4: Verify mobile and desktop rendering
- [ ] Phase 5: Deploy and verify on live site

## Done Criteria

- [ ] All bold markdown (`**...**`) is removed from answer options before display
- [ ] Utility function is clearly documented and uses a simple regex
- [ ] Manual testing confirms no bold text appears on answers across all difficulties
- [ ] Mobile view shows answers without bold formatting
- [ ] Desktop view shows answers without bold formatting
- [ ] No new errors in browser console
- [ ] Answer text remains intact and readable

## Decisions

**Decision 1:** Apply the fix in the frontend, not the API.
- **Rationale:** The API is working as designed (returning valid JSON with formatted text). The rendering is the issue. Fixing in the frontend (post-processing) is simpler, requires no API changes, and is more maintainable. If we later switch APIs, the fix remains valid.

**Decision 2:** Use a simple regex to strip `**...**` patterns.
- **Rationale:** This is a lightweight, reliable solution. Regex is built into JavaScript and doesn't require external dependencies. The pattern is simple and unambiguous.

**Decision 3:** Apply the fix only to options, not to questions or explanations.
- **Rationale:** The bug manifests only in options (where it affects answer fairness). Questions and explanations are user-facing and may intentionally include formatting. We only strip what's necessary.

## Risks

- **Risk 1: Incomplete markdown handling.** If Perplexity uses other markdown patterns (italic `*...*`, code backticks, etc.) in options, this fix won't catch them.
  - **Mitigation:** Currently only bold (`**...**`) is reported. If other patterns appear, extend the regex or create broader markdown stripping.

- **Risk 2: False positives in regex.** If an answer legitimately contains `**` as literal text (e.g., a Minecraft mod name with asterisks), the regex could mangle it.
  - **Mitigation:** This is unlikely given the quiz content (Minecraft facts). If it happens, we can adjust the regex to be more conservative or add a safelist.

- **Risk 3: Performance impact.** Running regex on every option on every question generation could be slow.
  - **Mitigation:** The operation is negligible (20 questions × 4 options = 80 small strings). No performance concern.

- **Risk 4: Changes to Perplexity output.** If Perplexity stops including bold formatting, this fix becomes a no-op but causes no harm.
  - **Mitigation:** The fix is defensive and harmless. It will remain safe even if Perplexity changes behavior.
