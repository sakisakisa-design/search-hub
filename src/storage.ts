import type { IgnoreRequest, RememberRequest, SearchResponse } from "./types";
import { canonicalUrl, extractHostname } from "./utils";

export async function readCached(env: Env, key: string): Promise<SearchResponse | null> {
  if (!env.SEARCH_CACHE) return null;
  const raw = await env.SEARCH_CACHE.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SearchResponse;
  } catch {
    return null;
  }
}

export async function writeCached(env: Env, key: string, response: SearchResponse, ttl: number): Promise<void> {
  if (!env.SEARCH_CACHE) return;
  await env.SEARCH_CACHE.put(key, JSON.stringify(response), { expirationTtl: ttl });
}

export async function remember(env: Env, request: RememberRequest): Promise<{
  saved: boolean;
  storage: string;
  ai_search: "uploaded" | "not_configured" | "skipped" | "failed";
  item?: unknown;
  warning?: string;
}> {
  const url = canonicalUrl(request.url);
  if (!url) throw new Error("url is required");
  let storage = "ephemeral-no-d1";
  if (env.SEARCH_DB) {
    await env.SEARCH_DB.prepare(
      `CREATE TABLE IF NOT EXISTS saved_sources (
        url TEXT PRIMARY KEY,
        title TEXT,
        snippet TEXT,
        reason TEXT,
        tags TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
    await env.SEARCH_DB.prepare(
      `INSERT OR REPLACE INTO saved_sources (url, title, snippet, reason, tags)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(url, request.title ?? "", request.snippet ?? "", request.reason ?? "user_saved", JSON.stringify(request.tags ?? []))
      .run();
    storage = "d1";
  }

  if (request.upload_to_ai_search === false) return { saved: true, storage, ai_search: "skipped" };
  const upload = await uploadRememberedItem(env, { ...request, url });
  return { saved: true, storage, ...upload };
}

async function uploadRememberedItem(
  env: Env,
  request: RememberRequest
): Promise<{ ai_search: "uploaded" | "not_configured" | "failed"; item?: unknown; warning?: string }> {
  const document = buildRememberedMarkdown(request);
  const filename = rememberedFilename(request.url);
  const metadata = {
    source: "search_hub",
    reason: sanitizeMetadata(request.reason ?? "user_saved"),
    host: sanitizeMetadata(extractHostname(request.url)),
    query: sanitizeMetadata(request.query ?? "")
  };

  try {
    if (env.AI_SEARCH_UPLOAD) {
      const item = await env.AI_SEARCH_UPLOAD.items.upload(filename, document, { metadata });
      return { ai_search: "uploaded", item };
    }
    if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN && env.CF_AI_SEARCH_INSTANCE) {
      const item = await uploadViaRest(env, filename, document);
      return { ai_search: "uploaded", item };
    }
    return { ai_search: "not_configured" };
  } catch (error) {
    return {
      ai_search: "failed",
      warning: error instanceof Error ? error.message : String(error)
    };
  }
}

async function uploadViaRest(env: Env, filename: string, document: string): Promise<unknown> {
  const form = new FormData();
  form.append("file", new File([document], filename, { type: "text/markdown" }));
  const base = env.CF_AI_SEARCH_NAMESPACE
    ? `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai-search/namespaces/${env.CF_AI_SEARCH_NAMESPACE}/instances/${env.CF_AI_SEARCH_INSTANCE}`
    : `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai-search/instances/${env.CF_AI_SEARCH_INSTANCE}`;
  const res = await fetch(`${base}/items`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI Search upload failed: HTTP ${res.status}`);
  return data;
}

function buildRememberedMarkdown(request: RememberRequest): string {
  const title = request.title || extractHostname(request.url) || request.url;
  const tags = request.tags?.length ? request.tags.join(", ") : "";
  return [
    `# ${title}`,
    "",
    `Source: ${request.url}`,
    request.query ? `Query: ${request.query}` : "",
    request.reason ? `Reason: ${request.reason}` : "",
    tags ? `Tags: ${tags}` : "",
    "",
    "## Summary",
    "",
    request.snippet ?? "",
    "",
    request.content ? "## Content" : "",
    "",
    request.content ?? ""
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .slice(0, 3_800_000);
}

function rememberedFilename(url: string): string {
  const canonical = canonicalUrl(url);
  const slug = canonical
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
  return `${slug || "remembered-source"}.md`;
}

function sanitizeMetadata(value: string): string {
  return value.slice(0, 128).replace(/[^\w:./ -]/g, "");
}

export async function ignore(env: Env, request: IgnoreRequest): Promise<{ ignored: boolean; storage: string }> {
  const url = canonicalUrl(request.url);
  if (!url) throw new Error("url is required");
  if (!env.SEARCH_DB) return { ignored: true, storage: "ephemeral-no-d1" };
  await env.SEARCH_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ignored_sources (
      url TEXT PRIMARY KEY,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.SEARCH_DB.prepare(`INSERT OR REPLACE INTO ignored_sources (url, reason) VALUES (?, ?)`)
    .bind(url, request.reason ?? "low_quality")
    .run();
  return { ignored: true, storage: "d1" };
}

export async function listIgnored(env: Env): Promise<Set<string>> {
  if (!env.SEARCH_DB) return new Set();
  try {
    await env.SEARCH_DB.prepare(
      `CREATE TABLE IF NOT EXISTS ignored_sources (
        url TEXT PRIMARY KEY,
        reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
    const result = await env.SEARCH_DB.prepare(`SELECT url FROM ignored_sources`).all<{ url: string }>();
    return new Set((result.results ?? []).map((row) => canonicalUrl(row.url)));
  } catch {
    return new Set();
  }
}

export async function recordHistory(env: Env, query: string, mode: string, cached: boolean): Promise<void> {
  if (!env.SEARCH_DB) return;
  await env.SEARCH_DB.prepare(
    `CREATE TABLE IF NOT EXISTS query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      mode TEXT NOT NULL,
      cached INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.SEARCH_DB.prepare(`INSERT INTO query_history (query, mode, cached) VALUES (?, ?, ?)`)
    .bind(query, mode, cached ? 1 : 0)
    .run();
}

export async function history(env: Env): Promise<{ items: Array<{ query: string; mode: string; cached: boolean; created_at: string }> }> {
  if (!env.SEARCH_DB) return { items: [] };
  await env.SEARCH_DB.prepare(
    `CREATE TABLE IF NOT EXISTS query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      mode TEXT NOT NULL,
      cached INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  const result = await env.SEARCH_DB.prepare(
    `SELECT query, mode, cached, created_at FROM query_history ORDER BY id DESC LIMIT 50`
  ).all<{ query: string; mode: string; cached: number; created_at: string }>();
  return {
    items: (result.results ?? []).map((row) => ({
      query: row.query,
      mode: row.mode,
      cached: Boolean(row.cached),
      created_at: row.created_at
    }))
  };
}
