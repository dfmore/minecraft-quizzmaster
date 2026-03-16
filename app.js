// =====================================================
// Minecraft QuizzMaster — app.js
// State machine: TITLE → (ALIAS) → LOADING → QUIZ → RESULTS → TITLE
//                TITLE → LEADERBOARD → TITLE
// =====================================================

// ── CONFIGURE THIS before deploying ──────────────────
// Replace with your deployed Cloudflare Worker URL.
// Example: "https://minecraft-quizzmaster-proxy.yourname.workers.dev"
const WORKER_URL = "https://minecraft-quizzmaster-proxy.dfmore.workers.dev";
// ─────────────────────────────────────────────────────

// Model selection per difficulty
const MODELS = {
  easy:      "sonar",
  normal:    "sonar",
  hard:      "sonar",
  legendary: "sonar",
  insane:    "sonar",
  demon:     "sonar",
};

// Total questions per round
const TOTAL_QUESTIONS = 20;

// ── Difficulty multipliers for scoring ───────────────
const DIFFICULTY_MULTIPLIERS = {
  easy:      1,
  normal:    1.5,
  hard:      2,
  legendary: 2.5,
  insane:    3,
  demon:     4,
};

// Rank thresholds (score out of 20)
const RANKS = [
  { name: "Netherite", min: 19, color: "#5C5C6E", cssVar: "--netherite" },
  { name: "Diamond",   min: 17, color: "#4AE3D8", cssVar: "--diamond"   },
  { name: "Gold",      min: 15, color: "#FFD700", cssVar: "--gold"       },
  { name: "Iron",      min: 12, color: "#C8C8C8", cssVar: "--iron"       },
  { name: "Copper",    min: 9,  color: "#B87333", cssVar: "--copper"     },
  { name: "Stone",     min: 6,  color: "#888888", cssVar: "--stone"      },
  { name: "Wood",      min: 0,  color: "#9B6B3A", cssVar: "--wood"       },
];

// ── Game state ─────────────────────────────────────
// Clean separation for future extensibility (leaderboard, multiplayer).
let GameState = {
  screen:             "TITLE",    // TITLE | ALIAS | LOADING | QUIZ | RESULTS | ERROR | LEADERBOARD
  difficulty:         null,
  pendingDifficulty:  null,       // difficulty to start after alias entry
  questions:          [],
  currentQuestion:    0,
  score:              0,
  answers:            [],         // { questionId, selectedIndex, correct }
  lastDifficulty:     null,       // for retry after error
};

// ── DOM refs ────────────────────────────────────────
const screens = {
  title:       document.getElementById("screen-title"),
  alias:       document.getElementById("screen-alias"),
  loading:     document.getElementById("screen-loading"),
  quiz:        document.getElementById("screen-quiz"),
  results:     document.getElementById("screen-results"),
  error:       document.getElementById("screen-error"),
  leaderboard: document.getElementById("screen-leaderboard"),
};

const $ = (id) => document.getElementById(id);

// ── Cached DOM refs for hot-path elements ────────────
const el = {
  options:           Array.from({ length: 4 }, (_, i) => $(`option-${i}`)),
  optionsGrid:       $("options-grid"),
  questionText:      $("question-text"),
  quizProgress:      $("quiz-progress"),
  quizScore:         $("quiz-score"),
  xpBarFill:         $("xp-bar-fill"),
  explanationArea:   $("explanation-area"),
  explanationLabel:  $("explanation-label"),
  explanationText:   $("explanation-text"),
  rankIcon:          $("rank-icon"),
  rankLabel:         $("rank-label"),
  resultsScore:      $("results-score"),
  resultsPct:        $("results-pct"),
  resultsPoints:     $("results-points"),
  errorMsg:          $("error-msg"),
  aliasError:        $("alias-error"),
  aliasInput:        $("alias-input"),
  leaderboardContent: $("leaderboard-content"),
};

// ── Screen navigation ────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  GameState.screen = name.toUpperCase();
}

// ── Alias helpers ────────────────────────────────────
const ALIAS_KEY = "quizzmaster_alias";

function getStoredAlias() {
  return localStorage.getItem(ALIAS_KEY) || null;
}

function setStoredAlias(alias) {
  localStorage.setItem(ALIAS_KEY, alias);
}

function validateAlias(raw) {
  const upper = raw.trim().toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(upper)) return upper;
  return null;
}

// ── Difficulty button handlers ───────────────────────
document.querySelectorAll(".btn-difficulty").forEach((btn) => {
  btn.addEventListener("click", () => {
    const difficulty = btn.dataset.difficulty;
    const alias = getStoredAlias();
    if (!alias) {
      // Gate: must set alias first
      GameState.pendingDifficulty = difficulty;
      el.aliasInput.value = "";
      showScreen("alias");
    } else {
      startGame(difficulty);
    }
  });
});

// ── Change Alias button ──────────────────────────────
$("btn-change-alias").addEventListener("click", () => {
  const current = getStoredAlias();
  el.aliasInput.value = current || "";
  GameState.pendingDifficulty = null; // not triggered from difficulty click
  showScreen("alias");
});

// ── Alias submission ─────────────────────────────────
function submitAlias() {
  const raw = el.aliasInput.value;
  const alias = validateAlias(raw);

  if (!alias) {
    el.aliasError.classList.remove("hidden");
    return;
  }

  el.aliasError.classList.add("hidden");

  setStoredAlias(alias);

  if (GameState.pendingDifficulty) {
    const difficulty = GameState.pendingDifficulty;
    GameState.pendingDifficulty = null;
    startGame(difficulty);
  } else {
    showScreen("title");
  }
}

$("btn-alias-submit").addEventListener("click", submitAlias);

el.aliasInput.addEventListener("keydown", (e) => {
  // Force uppercase live
  if (e.key === "Enter") {
    e.preventDefault();
    submitAlias();
  }
});

// Force uppercase as user types
el.aliasInput.addEventListener("input", () => {
  const pos = el.aliasInput.selectionStart;
  el.aliasInput.value = el.aliasInput.value.toUpperCase();
  el.aliasInput.setSelectionRange(pos, pos);
});

// ── Play again ───────────────────────────────────────
$("btn-play-again").addEventListener("click", () => {
  showScreen("title");
});

// ── Error screen ─────────────────────────────────────
$("btn-retry").addEventListener("click", () => {
  if (GameState.lastDifficulty) {
    startGame(GameState.lastDifficulty);
  } else {
    showScreen("title");
  }
});

$("btn-back-title").addEventListener("click", () => {
  showScreen("title");
});

// ── Continue button (after explanation) ─────────────
$("btn-continue").addEventListener("click", () => {
  advanceQuestion();
});

// ── Option click via event delegation ────────────────
el.optionsGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-option");
  if (!btn || btn.disabled) return;
  handleAnswer(parseInt(btn.dataset.index, 10));
});

// ── Keyboard support ────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (GameState.screen === "QUIZ") {
    const explanationVisible = !el.explanationArea.classList.contains("hidden");

    if (!explanationVisible) {
      // 1-4 to select answer
      const idx = "1234".indexOf(e.key);
      if (idx !== -1 && !el.options[idx].disabled) {
        handleAnswer(idx);
      }
    } else {
      // Enter or Space to continue
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advanceQuestion();
      }
    }
  }
});

// ── Score submission (fire-and-forget) ───────────────
async function submitScore(alias, points) {
  const response = await fetch(`${WORKER_URL}/api/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias, points }),
  });
  if (!response.ok) {
    throw new Error(`Score submission failed: ${response.status}`);
  }
}

// ── Main game flow ───────────────────────────────────
async function startGame(difficulty) {
  GameState.lastDifficulty = difficulty;
  GameState.difficulty = difficulty;
  GameState.currentQuestion = 0;
  GameState.score = 0;
  GameState.answers = [];

  showScreen("loading");

  try {
    const questions = await generateQuestions(difficulty);
    GameState.questions = questions;
    showScreen("quiz");
    renderQuestion();
  } catch (err) {
    console.error("Question generation failed:", err);
    showError(err.message || "Failed to generate questions. Check your worker URL.");
  }
}

// ── Markdown stripping ─────────────────────────────────
// Perplexity API sometimes returns markdown formatting in option strings,
// which reveals correct answers visually before selection. Strip it here.
const stripMarkdown = (text) => {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")  // [text](url) → text (before emphasis to avoid partial matches)
    .replace(/\*\*(.+?)\*\*/g, "$1")           // **bold**
    .replace(/\b__(.+?)__\b/g, "$1")            // __bold__ (\b at _ requires adjacent non-word char)
    .replace(/\*(.+?)\*/g, "$1")               // *italic*
    .replace(/\b_([^_]+?)_\b/g, "$1")          // _italic_ (\b skips mid-word underscores like item_name)
    .replace(/`([^`]+)`/g, "$1")               // `code` (negated class prevents cross-match)
    .replace(/^#+\s+(.+)$/gm, "$1");           // # Headers → text
};

// ── API call: generate questions via Cloudflare Worker ──
async function generateQuestions(difficulty) {
  const model = MODELS[difficulty];
  const systemPrompt = buildSystemPrompt(difficulty);
  const userPrompt = buildUserPrompt(difficulty);

  const requestBody = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "quiz_questions",
        schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question:    { type: "string" },
                  options:     { type: "array", items: { type: "string" } },
                  correct:     { type: "integer" },
                  explanation: { type: "string" },
                },
                required: ["question", "options", "correct", "explanation"],
              },
            },
          },
          required: ["questions"],
        },
      },
    },
    temperature: 0.7,
    max_tokens: 4096,
  };

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // Perplexity sonar always returns string content, so no Array.isArray branch is needed.
  const content = data.choices?.[0]?.message?.content;
  let jsonText;

  if (typeof content === "string") {
    jsonText = content;
  } else {
    throw new Error("Unexpected response content format");
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Model returned invalid JSON — please retry");
  }

  const questions = parsed.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("No questions found in API response");
  }

  for (const q of questions) {
    if (Array.isArray(q.options)) {
      q.options = q.options.map(stripMarkdown);
    }
  }

  // Shuffle option order so the correct answer isn't always in the same position.
  // Fisher-Yates shuffle, updating q.correct to track the new position.
  for (const q of questions) {
    if (!Array.isArray(q.options) || typeof q.correct !== "number") continue;
    const opts = q.options;
    let correctIdx = q.correct;
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
      if (correctIdx === i) correctIdx = j;
      else if (correctIdx === j) correctIdx = i;
    }
    q.correct = correctIdx;
  }

  // Validate each question has required fields and correct index is in bounds
  return questions.filter((q) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    return (
      q.question &&
      opts.length >= 2 &&
      typeof q.correct === "number" &&
      q.correct >= 0 &&
      q.correct < opts.length
    );
  }).slice(0, TOTAL_QUESTIONS);
}

// ── Prompts ──────────────────────────────────────────
function buildSystemPrompt(difficulty) {
  let humorInstruction;
  if (["easy", "normal"].includes(difficulty)) {
    humorInstruction = `6. Add light, obvious humor to roughly 30–40% of questions:
   - Humor appears in wrong answer options, question framing, or explanations — not in the correct answer.
   - Keep it broad and silly — the joke should land on first read. Example wrong options: "3 Creepers" for a crafting recipe, "by screaming at it" for a mob mechanic.
   - Never let a funny wrong answer make the correct answer obvious by contrast.`;
  } else if (["hard", "legendary"].includes(difficulty)) {
    humorInstruction = `6. Add subtle, veteran-tier humor to roughly 30–40% of questions:
   - Use Minecraft community in-jokes, dry wit, or plausible-sounding nonsense that only experienced players would catch.
   - Humor appears as wrong answer options or dry asides in explanations. Example: a wrong option referencing a notorious update meme or a deadpan mechanical impossibility.
   - Subtlety is essential — the humor should reward recognition, not signal itself loudly. Never make the correct answer obvious by contrast.`;
  } else {
    humorInstruction = `6. Add stealth humor to roughly 30–40% of questions — indistinguishable from real wrong answers at first glance:
   - Humor appears as exactly one wrong answer option per question, written in the same clinical, matter-of-fact tone as the other options.
   - Use insider-level dry wit, esoteric community references, or absurd-but-plausible technical jargon. Example: "Until the heat death of the universe" alongside three numeric tick values.
   - CRITICAL: The humorous option must NEVER stand out as the obvious joke. Players should have to think before realizing it is wrong. If a player can immediately identify which option is the joke, rewrite it.
   - Tone: detached, technical, never winking. No exclamation marks, no silliness — just quiet wrongness.`;
  }

  return `You are the Minecraft QuizzMaster — an expert in Minecraft game mechanics, lore, version history, and community culture.

Your job is to generate exactly ${TOTAL_QUESTIONS} quiz questions at the "${difficulty}" difficulty level.

Instructions:
1. Think step by step. For each question, verify the correct answer before writing it.
2. Cross-check each Minecraft fact against known wiki facts, patch notes, and game mechanics.
3. Ensure EXACTLY ONE answer is correct. The other three must be plausible but clearly wrong on reflection.
4. ALL questions must be about Minecraft — game mechanics, crafting, mobs, biomes, lore, version history, redstone, enchantments, and similar topics. Never include general knowledge questions unrelated to Minecraft.
5. Adjust complexity for the difficulty level:
   - easy: basic Minecraft facts, common recipes, obvious game rules
   - normal: moderate knowledge, biomes, mobs, items
   - hard: advanced mechanics, update history, specific numbers and values
   - legendary: obscure wiki facts, version-specific trivia, edge-case mechanics
   - insane: expert-level, update history nuances, rarely-known facts
   - demon: near-impossible Minecraft esoterica, deeply obscure mechanics, and version-specific minutiae
${humorInstruction}
7. Write clear, unambiguous question text.
8. Keep explanations concise (1-2 sentences) and educational.

Output ONLY valid JSON with this exact schema — no markdown, no code fences:
{
  "questions": [
    {
      "id": 1,
      "question": "string",
      "options": ["option A", "option B", "option C", "option D"],
      "correct": 0,
      "explanation": "string",
      "category": "minecraft",
      "difficulty": "${difficulty}"
    }
  ]
}

The "correct" field is the zero-based index of the correct option in the "options" array.`;
}

function buildUserPrompt(difficulty) {
  return `Generate ${TOTAL_QUESTIONS} unique quiz questions for difficulty: ${difficulty.toUpperCase()}. Output only the JSON object.`;
}

// ── Quiz rendering ────────────────────────────────────
const OPTION_PREFIXES = ["A", "B", "C", "D"];

function renderQuestion() {
  const q = GameState.questions[GameState.currentQuestion];
  const qNum = GameState.currentQuestion + 1;

  // Header
  const totalQ = GameState.questions.length;
  el.quizProgress.textContent = `Q ${qNum} / ${totalQ}`;
  el.quizScore.textContent = `Score: ${GameState.score}`;

  // XP bar
  const pct = ((qNum - 1) / totalQ) * 100;
  el.xpBarFill.style.width = `${pct}%`;

  // Question
  el.questionText.textContent = q.question;

  // Options — using cached refs, event delegation handles clicks
  for (let i = 0; i < 4; i++) {
    const btn = el.options[i];
    btn.textContent = `${OPTION_PREFIXES[i]}) ${q.options[i] || ""}`;
    btn.disabled = false;
    btn.className = "btn btn-option";
  }

  // Hide explanation
  el.explanationArea.classList.add("hidden");
}

// ── Answer handling ───────────────────────────────────
let answerLocked = false;

function handleAnswer(selectedIndex) {
  if (answerLocked) return;
  answerLocked = true;

  const q = GameState.questions[GameState.currentQuestion];
  const isCorrect = selectedIndex === q.correct;

  if (isCorrect) GameState.score++;

  // Record answer
  GameState.answers.push({
    questionId:    q.id,
    selectedIndex,
    correctIndex:  q.correct,
  });

  // Disable all option buttons + highlight correct/wrong
  for (let i = 0; i < 4; i++) {
    const btn = el.options[i];
    btn.disabled = true;
    if (i === q.correct) {
      btn.classList.add("correct");
    } else if (i === selectedIndex && !isCorrect) {
      btn.classList.add("wrong");
    }
  }

  // Update score display
  el.quizScore.textContent = `Score: ${GameState.score}`;

  // Show explanation
  el.explanationLabel.textContent = isCorrect ? "Correct!" : "Wrong!";
  el.explanationLabel.className = `explanation-label ${isCorrect ? "correct-label" : "wrong-label"}`;
  el.explanationText.textContent = q.explanation || "";
  el.explanationArea.classList.remove("hidden");
}

// ── Advance to next question or results ───────────────
function advanceQuestion() {
  answerLocked = false;
  GameState.currentQuestion++;

  if (GameState.currentQuestion >= GameState.questions.length) {
    showResults();
  } else {
    renderQuestion();
  }
}

// ── Results screen ────────────────────────────────────
function showResults() {
  const score      = GameState.score;  // raw correct-answer count (0–20)
  const total      = GameState.questions.length;
  const pct        = Math.round((score / total) * 100);
  const multiplier = DIFFICULTY_MULTIPLIERS[GameState.difficulty] || 1;
  const points     = Math.round(score * 10 * multiplier);

  // Determine rank
  const rank = RANKS.find((r) => score >= r.min) || RANKS[RANKS.length - 1];

  // Update DOM
  el.resultsScore.textContent  = `${score} / ${total}`;
  el.resultsPct.textContent    = `${pct}%`;
  el.rankLabel.textContent     = rank.name;
  el.rankLabel.style.color     = rank.color;
  el.rankIcon.style.backgroundColor = rank.color;
  el.resultsPoints.textContent = `Points earned: +${points}`;

  // Update XP bar to full
  el.xpBarFill.style.width = "100%";

  showScreen("results");

  // Submit score — fire-and-forget, never blocks UI
  const alias = getStoredAlias();
  if (alias) {
    submitScore(alias, points).catch(() => {});
  }
}

// ── Leaderboard ───────────────────────────────────────
$("btn-show-leaderboard").addEventListener("click", () => {
  showLeaderboard();
});

$("btn-leaderboard-back").addEventListener("click", () => {
  showScreen("title");
});

async function showLeaderboard() {
  showScreen("leaderboard");
  el.leaderboardContent.innerHTML = '<p class="leaderboard-loading">Loading...</p>';

  try {
    const response = await fetch(`${WORKER_URL}/api/leaderboard`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderLeaderboard(data.entries || []);
  } catch (err) {
    console.error("Leaderboard fetch failed:", err);
    el.leaderboardContent.innerHTML = '<p class="leaderboard-error">Could not load leaderboard</p>';
  }
}

function renderLeaderboard(entries) {
  if (!entries || entries.length === 0) {
    el.leaderboardContent.innerHTML = '<p class="leaderboard-empty">No scores yet — be the first!</p>';
    return;
  }

  const rows = entries.map((entry) => {
    const rankClass = entry.rank <= 3 ? ` rank-${entry.rank}` : "";
    return `<tr>
      <td class="rank-cell${rankClass}">#${entry.rank}</td>
      <td class="alias-cell">${escapeHtml(entry.alias)}</td>
      <td class="score-cell">${escapeHtml(String(entry.score))}</td>
    </tr>`;
  }).join("");

  el.leaderboardContent.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Alias</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Error display ─────────────────────────────────────
function showError(message) {
  el.errorMsg.textContent = message;
  showScreen("error");
}
