/**
 * Search Hub — API client
 * ---------------------------------------------------------------
 * Mirror of the backend contract.  Drop this file (and the types
 * comments below) into `src/lib/api.ts` in a Vite + TS project and
 * convert the JSDoc to real `type` / `interface` declarations:
 *
 *   export type Mode       = 'fast' | 'balanced' | 'fresh' | 'research';
 *   export type Freshness  = 'any'  | 'day'      | 'week'  | 'month';
 *   export type SourceScope= 'web'  | 'news'     | 'docs'  | 'social';
 *   export type ProviderId = 'grok' | 'sonar' | 'brave' | 'tavily' | 'anysearch' | 'cache';
 *
 *   export interface SearchRequest  { query, mode, freshness, source_scope,
 *                                     domains, exclude_domains, max_results }
 *   export interface Source         { title, url, snippet, published_at|null,
 *                                     provider, score }
 *   export interface SearchResponse { answer, cached, sources[], notes{
 *                                     providers_used[], freshness, warnings[] }}
 *   export interface ProviderInfo   { id, enabled, capabilities?, missing? }
 *   export interface HistoryItem    { query, mode, cached, created_at }
 *
 * Base URL is "" so the app talks to the same origin in production.
 * Override via `SearchHubAPI.configure({ baseUrl, fetchImpl, mock })`.
 */

const DEFAULT_CONFIG = {
  baseUrl: "",
  fetchImpl: typeof window !== "undefined" ? window.fetch.bind(window) : null,
  // The prototype ships with a mock backend so the page is alive
  // without a server. Flip to false to hit a real backend.
  mock: false,
};

let CONFIG = { ...DEFAULT_CONFIG };
const AUTH_TOKEN_KEY = "search-hub:auth-token:v1";

function configure(patch) {
  CONFIG = { ...CONFIG, ...patch };
}

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}

function authHeaders() {
  const token = getAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function request(path, init = {}) {
  if (CONFIG.mock) return MOCK_BACKEND(path, init);
  const url = (CONFIG.baseUrl || "") + path;
  const res = await CONFIG.fetchImpl(url, {
    headers: { "content-type": "application/json", ...authHeaders(), ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status} — ${text || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const SearchHubAPI = {
  configure,
  getAuthToken,
  setAuthToken,
  getProviders: () => request("/api/providers"),
  search: (body) =>
    request("/api/search", { method: "POST", body: JSON.stringify(body) }),
  searchStream: (body, onEvent) =>
    streamRequest("/api/search/stream", body, onEvent),
  remember: (body) =>
    request("/api/remember", { method: "POST", body: JSON.stringify(body) }),
  ignore: (body) =>
    request("/api/ignore", { method: "POST", body: JSON.stringify(body) }),
  getHistory: () => request("/api/history"),
  deleteHistory: (id) => request(`/api/history/${id}`, { method: "DELETE" }),
};

async function streamRequest(path, body, onEvent) {
  if (CONFIG.mock) {
    onEvent?.({ type: "start", message: "Starting mock search" });
    const result = await MOCK_BACKEND("/api/search", { method: "POST", body: JSON.stringify(body) });
    onEvent?.({ type: "complete", message: "Mock search complete" });
    return result;
  }

  const res = await CONFIG.fetchImpl((CONFIG.baseUrl || "") + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status} — ${text || res.statusText}`);
    err.status = res.status;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const event = parseSseEvent(part);
      if (!event) continue;
      if (event.event === "progress") onEvent?.(event.data);
      if (event.event === "result") finalResult = event.data;
      if (event.event === "error") throw new Error(event.data?.message || "stream error");
    }
  }

  if (!finalResult) throw new Error("Search stream ended without a result");
  return finalResult;
}

function parseSseEvent(part) {
  const lines = part.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7).trim() || "message";
  const dataLines = lines.filter((line) => line.startsWith("data: ")).map((line) => line.slice(6));
  if (!dataLines.length) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) };
}

// ---------------------------------------------------------------
// Mock backend — only used while CONFIG.mock === true.
// Replace with real Vite proxy / backend in production.
// ---------------------------------------------------------------

const MOCK_HISTORY = [
  { query: "post-quantum TLS rollout 2026", mode: "research", cached: false, created_at: "2026-05-22T09:14:00Z" },
  { query: "Apple Vision Pro 2 rumors",     mode: "fresh",    cached: true,  created_at: "2026-05-22T08:41:00Z" },
  { query: "duckdb vs clickhouse OLAP",     mode: "balanced", cached: true,  created_at: "2026-05-21T22:02:00Z" },
  { query: "EU AI Act enforcement timeline",mode: "research", cached: false, created_at: "2026-05-21T17:30:00Z" },
  { query: "anthropic claude 4.5 benchmarks", mode: "fast",   cached: true,  created_at: "2026-05-21T11:18:00Z" },
  { query: "best small espresso machine",   mode: "balanced", cached: true,  created_at: "2026-05-20T19:55:00Z" },
];

const MOCK_PROVIDERS = [
  { id: "grok",      enabled: true,  capabilities: ["fresh", "answer", "social"] },
  { id: "sonar",     enabled: true,  capabilities: ["answer", "citations"] },
  { id: "brave",     enabled: true,  capabilities: ["web", "fresh"] },
  { id: "tavily",    enabled: true,  capabilities: ["answer", "research"] },
  { id: "anysearch", enabled: false, missing: "ANYSEARCH_API_KEY" },
  { id: "cache",     enabled: true,  capabilities: ["cache"] },
];

const MOCK_SOURCES = {
  default: [
    {
      title: "NIST finalizes ML-KEM and ML-DSA for post-quantum TLS",
      url: "https://csrc.nist.gov/news/2026/pqc-final-standards",
      snippet: "The standards previously known as Kyber and Dilithium are now FIPS 203 and FIPS 204. Major TLS stacks have begun hybrid rollouts behind feature flags…",
      published_at: "2026-05-19T14:02:00Z",
      provider: "sonar",
      score: 0.94,
    },
    {
      title: "Cloudflare turns on ML-KEM hybrid for 38% of edge traffic",
      url: "https://blog.cloudflare.com/ml-kem-hybrid-rollout",
      snippet: "We've enabled X25519MLKEM768 for connections originating from supported clients. CPU overhead came in at 0.7% on Gen-12 edge hardware…",
      published_at: "2026-05-15T09:30:00Z",
      provider: "brave",
      score: 0.88,
    },
    {
      title: "Hacker News — Show HN: pq-tls, a hybrid handshake debugger",
      url: "https://news.ycombinator.com/item?id=42018221",
      snippet: "Author here. After three weekends I have a CLI that lets you inspect both the classical and PQ halves of the TLS 1.3 handshake side by side…",
      published_at: "2026-05-21T03:14:00Z",
      provider: "grok",
      score: 0.81,
    },
    {
      title: "IETF draft-ietf-tls-hybrid-design-12",
      url: "https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/12/",
      snippet: "This document defines a generic mechanism for combining one or more classical key exchange algorithms with one or more post-quantum algorithms…",
      published_at: "2026-04-28T00:00:00Z",
      provider: "tavily",
      score: 0.79,
    },
    {
      title: "Why Chrome is delaying full ML-KEM until M-140",
      url: "https://groups.google.com/a/chromium.org/g/security-dev/c/pqc-ml-kem-140",
      snippet: "Telemetry from M-138 shows a long tail of middleboxes that drop ClientHellos above ~1500 bytes. We are coordinating with major vendors before flipping the default…",
      published_at: "2026-05-12T18:45:00Z",
      provider: "sonar",
      score: 0.76,
    },
    {
      title: "Post-Quantum Cryptography — Wikipedia",
      url: "https://en.wikipedia.org/wiki/Post-quantum_cryptography",
      snippet: "Post-quantum cryptography refers to cryptographic algorithms thought to be secure against an attack by a quantum computer…",
      published_at: null,
      provider: "cache",
      score: 0.62,
    },
  ],
};

function mockSearch(body) {
  const q = (body.query || "").trim();
  const seedSources = MOCK_SOURCES.default.map((s) => ({ ...s }));

  // Lightly customize the surface text to whatever was typed
  // so the demo doesn't feel canned.
  const decorated = seedSources.map((s, i) => ({
    ...s,
    title: i === 0 && q
      ? s.title.replace("post-quantum TLS", q.slice(0, 60))
      : s.title,
  }));

  const providers_used = ["sonar", "brave", "grok", "tavily"];
  const warnings = body.mode === "fresh"
    ? []
    : (Math.random() < 0.25 ? ["anysearch unavailable — skipped"] : []);

  return {
    answer:
      q
        ? `Across ${providers_used.length} providers, the strongest signal on "${q}" is that the rollout is happening incrementally behind hybrid feature flags. NIST has finalized the standards; major CDNs (Cloudflare, Fastly) have shipped opt-in hybrid handshakes; browsers are pacing the default flip to avoid middlebox breakage. Expect default-on hybrid for most public endpoints by Q4 2026.`
        : "Type a query above to get a synthesized answer with citations.",
    cached: body.mode === "fast" && Math.random() < 0.4,
    sources: decorated.slice(0, body.max_results || 10),
    notes: {
      providers_used,
      freshness:
        body.freshness === "any" ? "mixed"
          : body.freshness === "day" ? "<24h"
          : body.freshness === "week" ? "<7d"
          : "<30d",
      warnings,
    },
  };
}

async function MOCK_BACKEND(path, init) {
  // Realistic-ish latency so the loading state is visible.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  if (path === "/api/providers") {
    await wait(120);
    return { providers: MOCK_PROVIDERS };
  }
  if (path === "/api/history") {
    await wait(80);
    return { items: MOCK_HISTORY };
  }
  if (path === "/api/search") {
    const body = JSON.parse(init.body || "{}");
    await wait(420 + Math.random() * 600);
    if (!body.query || !body.query.trim()) {
      const err = new Error("empty query");
      err.status = 400;
      throw err;
    }
    // Inject a deliberate failure path for the demo's error state.
    if (/__fail/.test(body.query)) {
      const err = new Error("upstream provider returned 502");
      err.status = 502;
      throw err;
    }
    return mockSearch(body);
  }
  if (path === "/api/remember" || path === "/api/ignore") {
    await wait(140);
    return { ok: true };
  }
  throw Object.assign(new Error("not found: " + path), { status: 404 });
}

window.SearchHubAPI = SearchHubAPI;
