// =====================================================
// Minecraft QuizzMaster — app.js
// State machine: TITLE → LOADING → QUIZ → RESULTS → TITLE
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
  screen:          "TITLE",    // TITLE | LOADING | QUIZ | RESULTS | ERROR
  difficulty:      null,
  questions:       [],
  currentQuestion: 0,
  score:           0,
  answers:         [],         // { questionId, selectedIndex, correct }
  lastDifficulty:  null,       // for retry after error
};

// ── DOM refs ────────────────────────────────────────
const screens = {
  title:   document.getElementById("screen-title"),
  loading: document.getElementById("screen-loading"),
  quiz:    document.getElementById("screen-quiz"),
  results: document.getElementById("screen-results"),
  error:   document.getElementById("screen-error"),
};

const $ = (id) => document.getElementById(id);

// ── Cached DOM refs for hot-path elements ────────────
const el = {
  options:          Array.from({ length: 4 }, (_, i) => $(`option-${i}`)),
  optionsGrid:      $("options-grid"),
  questionText:     $("question-text"),
  quizProgress:     $("quiz-progress"),
  quizScore:        $("quiz-score"),
  xpBarFill:        $("xp-bar-fill"),
  explanationArea:  $("explanation-area"),
  explanationLabel: $("explanation-label"),
  explanationText:  $("explanation-text"),
  rankIcon:         $("rank-icon"),
  rankLabel:        $("rank-label"),
  resultsScore:     $("results-score"),
  resultsPct:       $("results-pct"),
  errorMsg:         $("error-msg"),
};

// ── Screen navigation ────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  GameState.screen = name.toUpperCase();
}

// ── Difficulty button handlers ───────────────────────
document.querySelectorAll(".btn-difficulty").forEach((btn) => {
  btn.addEventListener("click", () => {
    const difficulty = btn.dataset.difficulty;
    startGame(difficulty);
  });
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
    response_format: { type: "json_object" },
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
  return `You are the Minecraft QuizzMaster — an expert in Minecraft game mechanics, lore, version history, and general knowledge.

Your job is to generate exactly ${TOTAL_QUESTIONS} quiz questions at the "${difficulty}" difficulty level.

Instructions:
1. Think step by step. For each question, verify the correct answer before writing it.
2. Cross-check each Minecraft fact against known wiki facts, patch notes, and game mechanics.
3. Ensure EXACTLY ONE answer is correct. The other three must be plausible but clearly wrong on reflection.
4. Mix approximately 70% Minecraft-specific trivia and 30% general knowledge.
5. Adjust complexity for the difficulty level:
   - easy: basic Minecraft facts, common recipes, obvious game rules
   - normal: moderate knowledge, biomes, mobs, items
   - hard: advanced mechanics, update history, specific numbers and values
   - legendary: obscure wiki facts, version-specific trivia, edge-case mechanics
   - insane: expert-level, update history nuances, rarely-known facts
   - demon: near-impossible Minecraft esoterica mixed with hard general knowledge
6. Write clear, unambiguous question text.
7. Keep explanations concise (1-2 sentences) and educational.

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
  const score = GameState.score;
  const total = GameState.questions.length;
  const pct   = Math.round((score / total) * 100);

  // Determine rank
  const rank = RANKS.find((r) => score >= r.min) || RANKS[RANKS.length - 1];

  // Update DOM
  el.resultsScore.textContent = `${score} / ${total}`;
  el.resultsPct.textContent   = `${pct}%`;
  el.rankLabel.textContent    = rank.name;
  el.rankLabel.style.color    = rank.color;
  el.rankIcon.style.backgroundColor = rank.color;

  // Update XP bar to full
  el.xpBarFill.style.width = "100%";

  showScreen("results");
}

// ── Error display ─────────────────────────────────────
function showError(message) {
  el.errorMsg.textContent = message;
  showScreen("error");
}
