// =====================================================
// Minecraft QuizzMaster — Cloudflare Worker proxy
//
// Receives POST requests from the GitHub Pages frontend,
// injects the Perplexity API key (stored as a wrangler secret),
// and forwards to the Perplexity chat completions endpoint.
//
// Deploy:
//   cd worker && wrangler deploy
//
// Set API key (once, never committed):
//   wrangler secret put PERPLEXITY_API_KEY
// =====================================================

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// ── Origin allowlist ─────────────────────────────────
// For development: allow all origins ("*").
// For production: restrict to your GitHub Pages URL:
//   const ALLOWED_ORIGINS = ["https://yourusername.github.io"];
// Then replace the getAllowedOrigin function accordingly.
const ALLOWED_ORIGINS = ["https://dfmore.github.io", "http://localhost", "http://127.0.0.1"];

function getAllowedOrigin(requestOrigin) {
  // Allow all during development
  if (ALLOWED_ORIGINS.includes("*")) {
    return "*";
  }
  // Allowlist check for production
  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  return null;
}

// ── CORS headers factory ─────────────────────────────
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":  origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
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

    // ── Only allow POST ───────────────────────────────
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
