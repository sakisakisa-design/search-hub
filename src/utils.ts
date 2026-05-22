import type { Freshness, SearchRequest, SearchSource } from "./types";

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      ...init.headers
    }
  });
}

export function normalizeSearchRequest(input: Partial<SearchRequest>): Required<SearchRequest> {
  const query = String(input.query ?? "").trim();
  return {
    query,
    mode: input.mode ?? "balanced",
    freshness: input.freshness ?? "any",
    source_scope: input.source_scope ?? "web",
    domains: normalizeStringArray(input.domains),
    exclude_domains: normalizeStringArray(input.exclude_domains),
    content_types: normalizeStringArray(input.content_types),
    vertical_domain: String(input.vertical_domain ?? "").trim(),
    sub_domain: String(input.sub_domain ?? "").trim(),
    sub_domain_params: normalizeRecord(input.sub_domain_params),
    zone: input.zone === "cn" ? "cn" : input.zone === "intl" ? "intl" : "",
    purpose: String(input.purpose ?? "").trim(),
    max_results: clampNumber(input.max_results, 1, 20, 10)
  };
}

export function validateSearchRequest(request: Required<SearchRequest>): string | null {
  if (!request.query) return "query is required";
  if (request.query.length > 1000) return "query is too long";
  return null;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 50);
}

export function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function cacheKey(request: Required<SearchRequest>, salt = ""): string {
  return `search:${hashStable(JSON.stringify({ request, salt }))}`;
}

export function cacheTtl(freshness: Freshness): number {
  if (freshness === "day") return 60 * 15;
  if (freshness === "week") return 60 * 60 * 3;
  if (freshness === "month") return 60 * 60 * 12;
  return 60 * 60 * 24;
}

export function stableDedupe(sources: SearchSource[], max: number): SearchSource[] {
  const seen = new Set<string>();
  const out: SearchSource[] = [];
  for (const source of sources.sort((a, b) => b.score - a.score)) {
    const key = canonicalUrl(source.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(source);
    if (out.length >= max) break;
  }
  return out;
}

export function isIgnored(url: string, ignoredUrls: Set<string>): boolean {
  const canonical = canonicalUrl(url);
  return canonical ? ignoredUrls.has(canonical) : false;
}

export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function freshnessToDate(freshness: Freshness): string | undefined {
  if (freshness === "any") return undefined;
  const days = freshness === "day" ? 1 : freshness === "week" ? 7 : 30;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function freshnessToPerplexity(freshness: Freshness): string | undefined {
  if (freshness === "any") return undefined;
  return freshness;
}

export function safeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function hashStable(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = (hash * 33) ^ value.charCodeAt(i);
  return (hash >>> 0).toString(36);
}
