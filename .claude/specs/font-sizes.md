# Font Size Increase Spec

## Problem

The Minecraft QuizzMaster app currently has several font sizes that are too small for comfortable readability, particularly on mobile and desktop screens. The smallest text (7px, 8px) is cramped and difficult to read, mid-range sizes (9px–11px) feel cramped for a playable game, and there is no consistent minimum baseline. This impacts accessibility and user experience across all screens.

## Goals

- **Increase readability globally** across all text, buttons, inputs, labels, and selectors
- **Set a minimum floor of 16px** for body text and small UI elements
- **Scale mid-range sizes (9–15px) proportionally** to maintain hierarchy while improving readability
- **Preserve large/heading sizes** (20px and above) as they already provide good visual weight
- **Maintain visual hierarchy** across all text elements so relationships are clear
- **Apply changes uniformly** across all screen sizes (mobile and desktop) unless explicitly responsive

## Non-Goals

- Change typography font family (Press Start 2P stays)
- Modify line-height, letter-spacing, or color values
- Adjust layout or padding/margin (except as needed to accommodate larger text)
- Create new CSS variables or refactor the stylesheet structure
- Implement dynamic font sizing based on screen width

## Constraints

- Single stylesheet file (`style.css`)
- Pixel-based units only (no em/rem conversion)
- Press Start 2P is a decorative pixel font with limited size options; larger sizes must still look intentional
- Responsive media queries already in place and must be updated in parallel
- All UI must remain functional and on-screen without overflow

## Approach

### Current Font Size Inventory

**Very small (7–8px)**: Extremely cramped, barely readable. Candidates for 16px floor.
- `.title-prompt` (10px) → 14px
- `.loading-sub` (8px) → 16px
- `.explanation-text` (8px) → 14px
- `.error-msg` (8px) → 14px
- `.alias-tip` (7px) → 14px
- `.alias-hint` (7px) → 14px
- `.alias-error` (7px) → 14px
- `.leaderboard-loading`, `.leaderboard-empty`, `.leaderboard-error` (8px) → 14px
- `.leaderboard-table th` (7px) → 12px
- `.leaderboard-table .rank-cell` (8px) → 12px

**Small (9–11px)**: Acceptable but cramped. Scale up ~50–60%.
- `.quiz-header` (9px) → 14px
- `.btn-option` (9px) → 14px
- `.btn-continue` (9px) → 14px
- `.btn-retry`, `.btn-back-title` (9px) → 14px
- `.explanation-label` (11px) → 16px
- `.results-pct` (11px) → 16px
- `.results-points` (10px) → 14px
- `.leaderboard-table` body (9px) → 14px
- `.leaderboard-table .score-cell` (9px) → 14px
- `@media (max-width: 480px) .question-text` (9px) → 14px
- `@media (min-width: 481px) and (max-width: 768px)` — no changes in small media

**Medium (10–14px)**: Needs moderate improvement. Scale up ~30–40%.
- `.btn` base (10px) → 14px
- `.title-prompt` (10px) → 14px
- `.btn-difficulty` (10px) → 14px
- `.question-text` (10px) → 14px
- `.results-points` (10px) → 14px
- `.btn-leaderboard` (10px) → 14px
- `.btn-play-again` (10px) → 14px
- `.alias-title` (14px) → 18px
- `@media (max-width: 480px) .title-main` (18px) → 24px (proportional scale)
- `@media (max-width: 480px) .title-sub` (13px) → 17px
- `@media (max-width: 480px) .results-title` (12px) → 16px
- `@media (max-width: 480px) .alias-input` (18px) → 24px
- `@media (max-width: 480px) .leaderboard-title` (12px) → 16px
- `@media (max-width: 480px) .leaderboard-table` (8px) → 12px
- `@media (min-width: 481px) and (max-width: 768px) .title-main` (22px) → 28px
- `@media (min-width: 481px) and (max-width: 768px) .title-sub` (15px) → 20px

**Large headings (16–22px)**: Preserve as-is.
- `.title-main` (28px) → 28px ✓
- `.title-sub` (18px) → 18px ✓
- `.loading-title` (16px) → 16px ✓
- `.results-title` (16px) → 16px ✓
- `.error-title` (16px) → 16px ✓
- `.alias-input` (22px) → 22px ✓
- `.rank-label` (20px) → 20px ✓
- `.results-score` (22px) → 22px ✓
- `.leaderboard-title` (16px) → 16px ✓
- `.error-icon` (32px) → 32px ✓

### Scaling Strategy

| Original Range | Strategy | Examples |
|---|---|---|
| 7–8px | Bump to 14px minimum | Error messages, helper text, table headers |
| 9–11px | Scale ×1.5–1.6 | Body text, buttons, quiz labels |
| 12–15px | Scale ×1.3–1.5 | Secondary headings, titles |
| 16px+ | Keep as-is | Primary headings, large UI elements |

### Proposed Mapping

Complete before/after reference:

| Current | Context | Proposed | Rationale |
|---|---|---|---|
| 28px | `.title-main` | 28px | Large primary heading, keep |
| 18px | `.title-sub` | 18px | Secondary heading, acceptable |
| 10px | `.title-prompt` | 14px | Helper text, scale 1.4× |
| 16px | `.loading-title` | 16px | Heading, acceptable |
| 8px | `.loading-sub` | 14px | Supporting text, scale 1.75× |
| 9px | `.quiz-header` | 14px | Quiz metadata, scale 1.56× |
| 10px | `.question-text` | 14px | Body text, scale 1.4× |
| 9px | `.btn-option` | 14px | Button text, scale 1.56× |
| 11px | `.explanation-label` | 16px | Label (correct/wrong), scale 1.45× |
| 8px | `.explanation-text` | 14px | Supporting text, scale 1.75× |
| 9px | `.btn-continue` | 14px | Button text, scale 1.56× |
| 16px | `.results-title` | 16px | Heading, acceptable |
| 20px | `.rank-label` | 20px | Large label, keep |
| 8px | `.results-score-text` | 14px | Supporting text, scale 1.75× |
| 22px | `.results-score` | 22px | Large score, keep |
| 11px | `.results-pct` | 16px | Percentage label, scale 1.45× |
| 10px | `.results-points` | 14px | Supporting text, scale 1.4× |
| 10px | `.btn-play-again` | 14px | Button text, scale 1.4× |
| 32px | `.error-icon` | 32px | Icon, keep |
| 16px | `.error-title` | 16px | Heading, keep |
| 8px | `.error-msg` | 14px | Supporting text, scale 1.75× |
| 9px | `.btn-retry`, `.btn-back-title` | 14px | Button text, scale 1.56× |
| 10px | `.btn-leaderboard` | 14px | Button text, scale 1.4× |
| 8px | `.btn-change-alias` | 12px | Small button text, scale 1.5× (floor: 12px for small buttons) |
| 14px | `.alias-title` | 18px | Heading, scale 1.29× |
| 7px | `.alias-tip` | 14px | Supporting text, scale 2× (floor to 14px) |
| 22px | `.alias-input` | 22px | Large input, keep |
| 7px | `.alias-hint` | 14px | Supporting text, scale 2× |
| 7px | `.alias-error` | 14px | Error text, scale 2× |
| 10px | `.results-points` | 14px | Supporting text, scale 1.4× |
| 16px | `.leaderboard-title` | 16px | Heading, keep |
| 8px | `.leaderboard-loading`, `.leaderboard-empty`, `.leaderboard-error` | 14px | Status text, scale 1.75× |
| 9px | `.leaderboard-table` | 14px | Body text, scale 1.56× |
| 7px | `.leaderboard-table th` | 12px | Table header, scale 1.71× |
| 8px | `.leaderboard-table .rank-cell` | 12px | Rank cell, scale 1.5× |
| 9px | `.leaderboard-table .score-cell` | 14px | Score cell, scale 1.56× |

#### Mobile Responsive (max-width: 480px)

| Current | Context | Proposed | Rationale |
|---|---|---|---|
| 18px | `.title-main` | 24px | Scale 1.33× for readability |
| 13px | `.title-sub` | 17px | Scale 1.31× for readability |
| 9px | `.question-text` | 14px | Scale 1.56× for readability |
| 16px | `.results-score` | 20px | Scale 1.25× for prominence |
| 12px | `.results-title` | 16px | Scale 1.33× |
| 18px | `.alias-input` | 24px | Scale 1.33× for input comfort |
| 12px | `.leaderboard-title` | 16px | Scale 1.33× |
| 8px | `.leaderboard-table` | 12px | Scale 1.5× for readability |

#### Tablet Responsive (481px–768px)

| Current | Context | Proposed | Rationale |
|---|---|---|---|
| 22px | `.title-main` | 28px | Scale 1.27× |
| 15px | `.title-sub` | 20px | Scale 1.33× |

## Files to Change

| Path | Change | Sections |
|---|---|---|
| `/home/daniel/minecraft-questionnaire/style.css` | Update 40+ font-size declarations across desktop, mobile (max-width: 480px), and tablet (481–768px) breakpoints | Lines 102, 114, 122, 141, 200, 206, 251, 292, 307, 363, 371, 380, 413, 437, 450, 455, 461, 468, 500, 505, 511, 517, 554, 577, 610, 616, 632, 654, 660, 669, 689, 702, 716, 721, 744, 762 + responsive media queries (779–800) |

## Phases

- [ ] **Phase 1: Baseline fonts** — Update desktop font sizes (lines 102–764, excluding media queries)
- [ ] **Phase 2: Mobile responsive** — Update max-width: 480px media query (lines 779–796)
- [ ] **Phase 3: Tablet responsive** — Update 481px–768px media query (lines 799–800)
- [ ] **Phase 4: Visual verification** — Test across mobile (320px, 480px), tablet (768px), and desktop (1024px+) to ensure readability and layout integrity
- [ ] **Phase 5: Manual QA** — Load all 7 screens (title, alias, loading, quiz, results, error, leaderboard) and verify text wrapping and button overflow

## Done Criteria

- [ ] All font-size values below 16px (except `.btn-change-alias` at 12px) increased to minimum 14px or higher
- [ ] Mid-range sizes (9–15px) scaled up proportionally (×1.3–2.0)
- [ ] Large headings (16px+) preserved unchanged
- [ ] Mobile and tablet breakpoints updated in parallel
- [ ] No text overlaps or unexpected line breaks on mobile (320px minimum width)
- [ ] All buttons, inputs, and labels are readable and have adequate touch targets (≥44px height/width on mobile)
- [ ] Responsive breakpoints remain functional (no layout regressions at 480px or 768px thresholds)
- [ ] CSS syntax is valid (no typos, closing braces)

## Decisions

1. **Floor at 14px for most small text** — 16px would be too large for helper text and metadata; 14px provides a good balance between readability and density.
2. **Button text (.btn-change-alias) at 12px** — This is a secondary, small button; 12px is acceptable and maintains visual distinction from primary buttons.
3. **Preserve large headings (20px+)** — Already readable; scaling would create disproportionate hierarchy.
4. **Responsive scaling in mobile media query** — Scale up proportionally (×1.25–1.56) rather than matching desktop sizes exactly, to account for smaller screens and touch interaction.
5. **Apply changes uniformly** — No per-screen custom logic; CSS changes only.

## Risks

1. **Text overflow in constrained spaces** — Larger fonts may cause text to wrap unexpectedly or exceed button/input boundaries. Mitigation: visual QA on all screens, especially narrow mobile (320px).
2. **Layout shift at responsive breakpoints** — Mobile query changes may cause reflow at 480px threshold. Mitigation: test at exact breakpoint (480px, 481px) with responsive preview tools.
3. **Pixel font rendering** — Press Start 2P at unusual sizes (17px, 20px, 24px) may look jagged or distorted. Mitigation: verify renders correctly on actual devices.
4. **Touch target adequacy** — Buttons and inputs must remain ≥44px for mobile accessibility. Mitigation: spot-check button heights and widths after changes.
5. **Leaderboard table text wrapping** — Table cells with larger text may overflow. Mitigation: test leaderboard rendering with long aliases (5 chars) and large scores.
6. **Inconsistent scaling across breakpoints** — If mobile and tablet multipliers don't align, visual hierarchy may feel broken. Mitigation: use consistent 1.33–1.56× scaling factors across all breakpoints.

## Implementation Notes

- Changes are straightforward CSS value updates; no JavaScript modifications required
- No new selectors or classes needed
- All changes isolated to `/home/daniel/minecraft-questionnaire/style.css`
- Regex-friendly: pattern `font-size:\s*(\d+)px;` makes bulk replacements safer

---

**Recommend: Surgical approach** — This is a pure styling change affecting a single file with well-defined, repeatable patterns. A direct CSS update with no refactoring is the fastest path to correctness.
