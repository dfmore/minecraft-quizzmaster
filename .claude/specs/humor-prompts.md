# Spec: Add Humor Instructions to Quiz System Prompt

**Author**: Scout
**Date**: 2026-03-15
**Status**: Ready for Implementation

---

## Problem

The Minecraft QuizzMaster generates factually accurate quiz questions via the Perplexity sonar API, but the system prompt contains no humor instructions. Questions are dry and lack personality, reducing engagement and replay value. Adding calibrated humor would improve the experience while maintaining factual accuracy and educational value.

## Goals

1. Add humor instructions to `buildSystemPrompt()` in `app.js`
2. Scale humor by difficulty level:
   - **Easy/Normal**: Broad, obvious humor (e.g., absurd crafting recipes with creepers)
   - **Hard/Legendary**: Subtle Minecraft in-jokes and dry wit
   - **Insane/Demon**: Humor indistinguishable from plausible wrong answers — insider-level, dry, never a giveaway
3. Ensure humor appears consistently across all questions (roughly same frequency per difficulty)
4. Maintain factual accuracy and educational value
5. Never let humor make the correct answer obvious by contrast

## Non-Goals

- Schema changes to quiz data structure
- API endpoint changes
- Game logic or UI changes
- Difficulty-level rebalancing
- Player-customizable humor settings
- Backend changes to Cloudflare Worker

## Constraints

- **System prompt only**: Humor instructions must live in `buildSystemPrompt()`, not in user prompt or downstream processing
- **No schema changes**: Questions still output `{question, options, correct, explanation}`
- **Temperature fixed**: `temperature: 0.7` cannot increase (would hurt factual accuracy)
- **Frequency parity**: All difficulties should see humor at roughly the same rate (~30–40% of questions per round)
- **Stealth requirement**: Insane/Demon humor must not visibly differ from incorrect answers until reflection
- **Brevity**: Instructions must fit naturally in existing system prompt (not exceed current length significantly)

## Approach

### Recommended: **Structural** (Humor Tier Mapping in System Prompt)

Add a humor tier section to `buildSystemPrompt()` that provides:
1. Difficulty-specific humor guidance (what tone, where it appears)
2. Examples for each tier (Easy: recipe joke, Hard: lore reference, Insane: fake patch note)
3. Explicit "stealth rules" for Insane/Demon (blend indistinguishably with wrong answers)
4. Frequency guidance: "Include humor in approximately 30–40% of questions across all options and explanations"

**Summary**: Embed humor tier instructions directly after the complexity guidance (after instruction 5 in current prompt), keyed to the difficulty parameter.

**Files Touched**:

| Path | Change |
|------|--------|
| `app.js` (lines 254–290, `buildSystemPrompt()`) | Add humor tier section with conditional text based on difficulty parameter |

**Implementation Detail**:

```javascript
function buildSystemPrompt(difficulty) {
  // ... existing preamble ...
  // ... instruction 1–5 (complexity guidance) ...

  // NEW: Add instruction 6 (humor tier — replaces or supplements old instruction 6)
  // Use template literals to inject difficulty-specific humor guidance:

  let humorTierGuidance = '';
  if (['easy', 'normal'].includes(difficulty)) {
    humorTierGuidance = `
6. Add light, obvious humor:
   - Example: Crafting recipe question: "To make a bed, you need 3 wool and 3... (A) Creepers, B) Planks, C) Feathers, D) Slime balls)"
   - Humor appears in ~30–40% of questions: in wrong answer options, question framing, or explanations.
   - Keep it broad and silly — the joke should be clear on first read.`;
  } else if (['hard', 'legendary'].includes(difficulty)) {
    humorTierGuidance = `
6. Add subtle humor for Minecraft veterans:
   - Example: "Minecraft 1.17 introduced Copper. What happens when it rains? (A) It oxidizes, (B) It turns into diamonds, (C) It attracts lightning, (D) It becomes a meme."
   - Humor appears in ~30–40% of questions: in-jokes, dry wit, or plausible-sounding nonsense that makes sense to community veterans.
   - Never make the correct answer obvious by contrast — subtlety is key.`;
  } else if (['insane', 'demon'].includes(difficulty)) {
    humorTierGuidance = `
6. Add stealth humor — indistinguishable from real wrong answers:
   - Example: "What is the exact duration of a Wither effect in ticks? (A) 120 ticks, (B) 140 ticks, (C) 4 hours, (D) Until you ragequit."
   - Humor appears in ~30–40% of questions: typically as one wrong answer option that looks plausible on first glance but is revealed as insider-level dry wit on closer inspection.
   - CRITICAL: The humorous wrong answer must NEVER make the correct answer obvious. Players should have to think, not spot the "joke answer."
   - Tone: Esoteric, matter-of-fact, never winking. Community in-jokes disguised as technical jargon.`;
  }

  // ... instruction 7 (output format) ...
}
```

**Trade-offs**:

**Pros**:
- Leverages Perplexity's knowledge of Minecraft humor and community memes
- Zero schema changes — backward compatible
- Humor scales naturally with difficulty without additional processing
- Single, focused code change (one function)

**Cons**:
- Relies on LLM to interpret and follow humor tier guidance (may over-apply or ignore)
- Stealth humor for Insane/Demon is ambiguous to measure (QA requires human judgment)
- No A/B testing or feedback loop (one-shot implementation)

**Risk Profile**:
- **Model interpretation**: LLM may ignore humor instructions entirely or apply them inconsistently
- **Over-humor**: Temperature 0.7 + broad instructions could lead to jokes that feel forced or inaccurate
- **Stealth failure**: Insane/Demon humor might be too obvious (giveaway) or too obscure (incomprehensible)
- **Frequency mismatch**: LLM may include humor in 80% of questions instead of ~30–40%

---

### Alternative 1: **Surgical** (Examples-Only, No Guidance)

Add only concrete examples for each difficulty tier without philosophical guidance. Strip all instructions to bare minimum.

**Summary**: Provide 2–3 real examples per difficulty in the system prompt, trust the model to extrapolate.

**Files Touched**:

| Path | Change |
|------|--------|
| `app.js` (lines 254–290, `buildSystemPrompt()`) | Add 2–3 concrete humor examples per difficulty after instruction 5 |

**Trade-offs**:

**Pros**:
- Minimal instruction bloat
- Examples provide concrete pattern for model to follow
- Backward compatible, zero schema impact

**Cons**:
- Less explicit guidance on tone/frequency — more variance between runs
- Doesn't address the "stealth humor" requirement for Insane/Demon explicitly
- May produce repetitive jokes if model copies examples too closely

**Risk Profile**:
- High variance in humor frequency and tone
- Stealth humor guardrails weaker
- Examples may be memorized/reproduced verbatim

---

### Alternative 2: **Pragmatic** (Difficulty-Based Sampling + Hints)

Add humor instructions only for Insane/Demon (highest-risk tiers), leave Easy/Normal/Hard without explicit guidance. Assumes lower difficulties self-organize humor naturally.

**Summary**: Minimal instruction for Easy/Normal/Hard (brief mention), detailed guidance only for Insane/Demon where stealth is critical.

**Files Touched**:

| Path | Change |
|------|--------|
| `app.js` (lines 254–290, `buildSystemPrompt()`) | Add brief humor mention for easy/normal/hard (1 sentence), full stealth humor guidance for insane/demon |

**Trade-offs**:

**Pros**:
- Shortest implementation
- Focuses guardrails where they matter most (Insane/Demon)
- Less noise in instructions

**Cons**:
- Inconsistent guidance across tiers — may appear ad-hoc
- Easy/Normal miss opportunities for calibrated humor (may default to either none or over-the-top)
- Harder to maintain consistency across rounds

**Risk Profile**:
- Lower difficulty tiers may lack humor or feel random
- Stealth humor still relies on LLM interpretation

---

## Recommendation: **Structural** (Humor Tier Mapping)

**Why**: This task is small (single function, ~15–20 lines added) but requires careful specification to ensure humor scales correctly across 6 difficulty levels. The Structural approach provides explicit, difficulty-specific guidance that mirrors the existing complexity tiers (lines 265–270 in current prompt), making it a natural extension of the system prompt's philosophy.

The requirement that humor be "indistinguishable from real wrong answers" for Insane/Demon is the highest-risk element — explicit stealth rules are essential here. The Surgical approach (examples only) leaves this implicit. The Pragmatic approach under-specifies Easy/Normal.

**Ties to Context**:
- **Codebase style**: System prompt already groups instructions by complexity tier. This extends that pattern.
- **Perplexity capability**: Sonar is skilled at humor and community knowledge — explicit guidance leverages that strength.
- **Maintenance**: Future difficulty rebalancing (post-MVP) can easily adjust humor tiers without touching code outside `buildSystemPrompt()`.

---

## Files to Change

- **`/home/daniel/minecraft-questionnaire/app.js`** (single change)
  - Function: `buildSystemPrompt(difficulty)` (lines 254–290)
  - Add: Difficulty-specific humor tier guidance (new instruction section after instruction 5)
  - Modify: Renumber instruction 6 (output format) to instruction 7

---

## Phases

**Single phase**:
1. Update `buildSystemPrompt()` with humor tier section
2. Syntax check: `node -c app.js`
3. Manual test via playwright-cli: generate questions for each difficulty, verify humor appears and scales correctly
4. Verify stealth humor in Insane/Demon doesn't giveaway correct answer

---

## Done Criteria

- [ ] `buildSystemPrompt()` includes humor tier instructions for all 6 difficulty levels
- [ ] Humor guidance scales: broad (easy/normal) → subtle (hard/legendary) → stealth (insane/demon)
- [ ] Syntax check passes: `node -c app.js`
- [ ] Game generates questions with humorous elements (verified via playwright-cli or manual play)
- [ ] Humorous wrong answers in Insane/Demon don't make correct answer obvious (manual inspection of 5+ generated questions)
- [ ] Humor frequency roughly matches specification (~30–40% of questions per round)
- [ ] No schema changes to question format
- [ ] No API or game logic changes

---

## Decisions

**Q: Why system prompt, not post-processing?**
A: System prompt keeps humor generation atomic and avoids latency/complexity of post-question rewrites. Perplexity has inherent knowledge of Minecraft humor; we leverage that directly.

**Q: Why not use a separate "humor API" or configuration?**
A: Single-file change, zero infrastructure cost, easier to test and maintain. Humor is an instruction, not state.

**Q: How to measure "indistinguishable from real wrong answers" for Insane/Demon?**
A: Manual inspection of generated questions. A stealth joke fails if a player says "oh, that's obviously the joke answer." Success is players initially unsure whether an option is wrong or humorous.

**Q: Why ~30–40% frequency instead of higher?**
A: Preserves educational value. Humor should surprise and delight, not dominate. Higher frequency risks annoying players or diluting learning.

---

## Risks (Across All Approaches)

1. **Model interpretation variance**: Perplexity may apply humor inconsistently across questions or ignore instructions entirely. Mitigation: explicit examples help anchor behavior.

2. **Over-humor**: Temperature 0.7 + broad instructions could produce jokes that feel forced, make questions ambiguous, or sacrifice accuracy. Mitigation: "stealth rules" for Insane/Demon emphasize plausibility.

3. **Stealth humor too obvious or too obscure**:
   - Too obvious: Insane/Demon jokes become giveaways (player spots joke answer immediately)
   - Too obscure: Community in-jokes are incomprehensible to casual players
   - Mitigation: Examples must be validated in testing; adjust guidance if patterns emerge.

4. **Frequency mismatch**: Model may include humor in 10% of questions (too sparse) or 90% (too dense). Mitigation: explicit frequency guidance ("~30–40%") helps, but LLM may still vary.

5. **Factual accuracy degradation**: Pressure to be funny could lead to slight inaccuracies or misleading explanations. Mitigation: system prompt prioritizes "Think step by step" and fact-checking (instructions 1–3) before humor.

6. **No rollback plan**: If humor causes complaints, reverting requires code change. Mitigation: humor is optional — if tests reveal problems, revert to current prompt (single line change).

---

## Testing Notes

After implementation, generate questions for each difficulty and spot-check:

1. **Easy (5 questions)**: Humor should be obvious, broad, silly. Examples: absurd recipe options, silly mob descriptions.
2. **Normal (5 questions)**: Similar to Easy, but slightly more sophisticated. Examples: biome jokes, enchantment puns.
3. **Hard (5 questions)**: Subtle, in-jokes. Examples: update history references, dry mechanical observations.
4. **Legendary (5 questions)**: Veteran humor, obscure references. Examples: niche wiki facts presented as jokes.
5. **Insane (5 questions)**: Stealth humor. Spot-check that humorous wrong answers don't obviously stand out.
6. **Demon (5 questions)**: Same as Insane, but esoteric. Verify jokes blend indistinguishably with plausible wrong answers.

Success: All tiers produce humor-laden questions; Insane/Demon stealth humor doesn't giveaway correct answers.

