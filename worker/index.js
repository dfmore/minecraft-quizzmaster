// =====================================================
// Minecraft QuizzMaster — Cloudflare Worker proxy
//
// Receives POST requests from the GitHub Pages frontend,
// injects the Perplexity API key (stored as a wrangler secret),
// and forwards to the Perplexity chat completions endpoint.
//
// Also handles:
//   POST /api/score       — submit score for an alias
//   GET  /api/leaderboard — fetch top 10 scores
//
// Deploy:
//   cd worker && wrangler deploy
//
// Set API key (once, never committed):
//   wrangler secret put PERPLEXITY_API_KEY
//
// Create KV namespace (once):
//   wrangler kv namespace create QUIZZMASTER_LEADERBOARD
//   Then fill the id in wrangler.toml
// =====================================================

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// ── Origin allowlist ─────────────────────────────────
const ALLOWED_ORIGINS = ["https://dfmore.github.io", "http://localhost", "http://127.0.0.1"];

function getAllowedOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.includes("*")) {
    return "*";
  }
  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Allow localhost/127.0.0.1 on any port for local development
  try {
    const url = new URL(requestOrigin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return requestOrigin;
    }
  } catch { /* invalid origin, fall through */ }
  return null;
}

// ── CORS headers factory ─────────────────────────────
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":  origin || "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
}

// ── /api/score — POST only ───────────────────────────
// Body: { alias: string, points: number }
// O(1) KV read+write per submission
async function handleScore(request, env, allowedOrigin) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders(allowedOrigin), "Content-Type": "text/plain" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request: invalid JSON", {
      status: 400,
      headers: { ...corsHeaders(allowedOrigin), "Content-Type": "text/plain" },
    });
  }

  const { alias, points } = body;

  // Validate alias: exactly 5 uppercase alphanumeric chars
  if (typeof alias !== "string" || !/^[A-Z0-9]{5}$/.test(alias)) {
    return new Response("Bad Request: alias must be exactly 5 uppercase alphanumeric characters", {
      status: 400,
      headers: { ...corsHeaders(allowedOrigin), "Content-Type": "text/plain" },
    });
  }

  // Validate points: non-negative integer
  if (typeof points !== "number" || !Number.isInteger(points) || points < 0) {
    return new Response("Bad Request: points must be a non-negative integer", {
      status: 400,
      headers: { ...corsHeaders(allowedOrigin), "Content-Type": "text/plain" },
    });
  }

  // Read existing record (or create new)
  let record;
  try {
    const existing = await env.QUIZZMASTER_LEADERBOARD.get(alias);
    if (existing) {
      record = JSON.parse(existing);
    } else {
      record = { alias, score: 0, games: 0, lastPlayed: null };
    }
  } catch {
    record = { alias, score: 0, games: 0, lastPlayed: null };
  }

  // Update record
  record.score      += points;
  record.games      += 1;
  record.lastPlayed  = new Date().toISOString();

  await env.QUIZZMASTER_LEADERBOARD.put(alias, JSON.stringify(record));

  return new Response(JSON.stringify({
    alias,
    newTotalScore: record.score,
    games: record.games,
  }), {
    status: 200,
    headers: { ...corsHeaders(allowedOrigin), "Content-Type": "application/json" },
  });
}

// ── /api/leaderboard — GET only ─────────────────────
// O(n) KV reads — acceptable at this scale (≤1000 aliases)
async function handleLeaderboard(env, allowedOrigin) {
  // List all keys, handling pagination (list_complete check)
  let keys = [];
  let cursor = undefined;
  do {
    const listResult = await env.QUIZZMASTER_LEADERBOARD.list({ cursor });
    keys.push(...listResult.keys);
    if (listResult.list_complete) break;
    cursor = listResult.cursor;
  } while (true);

  if (keys.length === 0) {
    return new Response(JSON.stringify({ entries: [] }), {
      status: 200,
      headers: { ...corsHeaders(allowedOrigin), "Content-Type": "application/json" },
    });
  }

  // Bulk-fetch all values in parallel
  const values = await Promise.all(
    keys.map((k) => env.QUIZZMASTER_LEADERBOARD.get(k.name))
  );

  const records = values
    .filter(Boolean)
    .map((v) => { try { return JSON.parse(v); } catch { return null; } })
    .filter(Boolean);

  // Sort by score descending, take top 10
  records.sort((a, b) => b.score - a.score);
  const top10 = records.slice(0, 10);

  const entries = top10.map((r, i) => ({
    rank:  i + 1,
    alias: r.alias,
    score: r.score,
    games: r.games,
  }));

  return new Response(JSON.stringify({ entries }), {
    status: 200,
    headers: { ...corsHeaders(allowedOrigin), "Content-Type": "application/json" },
  });
}

// ── Worker entry point ───────────────────────────────
export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin") || "";
    const allowedOrigin = getAllowedOrigin(requestOrigin);

    // ── Reject blocked origins ────────────────────────
    if (allowedOrigin === null) {
      return new Response("Forbidden: origin not allowed", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // ── OPTIONS preflight ─────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin),
      });
    }

    // ── URL-based routing ─────────────────────────────
    const url      = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/api/score") {
      return handleScore(request, env, allowedOrigin);
    }

    if (pathname === "/api/leaderboard") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { ...corsHeaders(allowedOrigin), "Content-Type": "text/plain" },
        });
      }
      return handleLeaderboard(env, allowedOrigin);
    }

    // ── Perplexity proxy — POST only ──────────────────
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...corsHeaders(allowedOrigin),
          "Content-Type": "text/plain",
        },
      });
    }

    // ── Validate API key is configured ─────────────────
    if (!env.PERPLEXITY_API_KEY) {
      return new Response("Server misconfigured: PERPLEXITY_API_KEY secret not set", {
        status: 500,
        headers: corsHeaders(allowedOrigin),
      });
    }

    // ── Forward to Perplexity ─────────────────────────
    let requestBody;
    try {
      requestBody = await request.text();
    } catch {
      return new Response("Bad Request: could not read body", {
        status: 400,
        headers: corsHeaders(allowedOrigin),
      });
    }

    let perplexityResponse;
    try {
      perplexityResponse = await fetch(PERPLEXITY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${env.PERPLEXITY_API_KEY}`,
        },
        body: requestBody,
      });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err.message}`, {
        status: 502,
        headers: corsHeaders(allowedOrigin),
      });
    }

    // ── Forward Perplexity response with CORS headers ─
    const responseBody = await perplexityResponse.text();

    return new Response(responseBody, {
      status: perplexityResponse.status,
      headers: {
        ...corsHeaders(allowedOrigin),
        "Content-Type": perplexityResponse.headers.get("Content-Type") || "application/json",
      },
    });
  },
};
