import type { Provider, ProviderId, ProviderResult, SearchSource } from "./types";
import { extractHostname, freshnessToDate, freshnessToPerplexity, safeText } from "./utils";

const USER_AGENT = "search-hub-mcp/0.1";

export const providers: Provider[] = [
  {
    id: "grok",
    envKey: "GROK_API_KEY",
    capabilities: ["fresh", "answer", "social", "research"],
    search: searchGrok
  },
  {
    id: "sonar",
    envKey: "SONAR_API_KEY",
    capabilities: ["answer", "citations", "fresh", "research"],
    search: searchSonar
  },
  {
    id: "brave",
    envKey: "BRAVE_API_KEY",
    capabilities: ["web", "news", "raw_results"],
    search: searchBrave
  },
  {
    id: "tavily",
    envKey: "TAVILY_API_KEY",
    capabilities: ["web", "answer", "extract", "research"],
    search: searchTavily
  },
  {
    id: "anysearch",
    envKey: "ANYSEARCH_API_KEY",
    capabilities: ["web", "vertical", "batch", "experimental", "fallback"],
    search: searchAnySearch
  }
];

export function providerStatuses(env: Env) {
  return {
    providers: providers.map((provider) => ({
      id: provider.id,
      enabled: Boolean(env[provider.envKey]),
      capabilities: provider.capabilities,
      ...(env[provider.envKey] ? {} : { missing: provider.envKey })
    }))
  };
}

export function routeProviders(env: Env, mode: string, sourceScope: string): Provider[] {
  const enabled = providers.filter((provider) => Boolean(env[provider.envKey]));
  const byId = (id: ProviderId) => enabled.find((provider) => provider.id === id);
  const verticalScopes = new Set(["code", "academic", "finance", "legal", "security", "health"]);
  const orderedIds =
    verticalScopes.has(sourceScope)
      ? ["anysearch", "brave", "tavily", "sonar", "grok"]
      : mode === "research" && sourceScope === "docs"
        ? ["brave", "sonar", "tavily", "grok", "anysearch"]
      : mode === "research" && sourceScope === "news"
        ? ["grok", "brave", "sonar", "tavily", "anysearch"]
      : mode === "research" && sourceScope === "web"
        ? ["brave", "tavily", "sonar", "grok", "anysearch"]
      : mode === "fresh" || sourceScope === "social"
      ? ["grok", "sonar", "tavily", "brave", "anysearch"]
      : mode === "fast"
        ? ["sonar", "grok", "brave", "tavily", "anysearch"]
        : mode === "research"
          ? ["sonar", "grok", "tavily", "brave", "anysearch"]
          : ["sonar", "brave", "tavily", "grok", "anysearch"];
  return orderedIds.map((id) => byId(id as ProviderId)).filter((provider): provider is Provider => Boolean(provider));
}

async function searchBrave(env: Env, request: Parameters<Provider["search"]>[1]): Promise<ProviderResult> {
  const params = new URLSearchParams({
    q: withDomainHints(request.query, request.domains, request.exclude_domains),
    count: String(request.max_results),
    safesearch: "moderate"
  });
  if (request.source_scope === "news") params.set("freshness", freshnessForBrave(request.freshness));
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
      "x-subscription-token": env.BRAVE_API_KEY ?? ""
    }
  });
  const data = await parseJson(res, "brave");
  const webResults = asArray(data.web?.results);
  const newsResults = asArray(data.news?.results);
  const sources = [...webResults, ...newsResults].slice(0, request.max_results).map((item, index) =>
    source({
      title: item.title,
      url: item.url,
      snippet: item.description ?? item.snippet,
      published_at: item.age ?? item.page_age ?? null,
      provider: "brave",
      score: 0.9 - index * 0.02
    })
  );
  return { sources };
}

async function searchTavily(env: Env, request: Parameters<Provider["search"]>[1]): Promise<ProviderResult> {
  const body = {
    query: request.query,
    topic: request.source_scope === "news" ? "news" : "general",
    search_depth: request.mode === "research" ? "advanced" : "basic",
    include_answer: request.mode !== "fast",
    include_raw_content: false,
    max_results: request.max_results,
    time_range: request.freshness === "any" ? undefined : request.freshness,
    include_domains: request.domains.length ? request.domains : undefined,
    exclude_domains: request.exclude_domains.length ? request.exclude_domains : undefined
  };
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.TAVILY_API_KEY ?? ""}`
    },
    body: JSON.stringify(body)
  });
  const data = await parseJson(res, "tavily");
  const sources = asArray(data.results).slice(0, request.max_results).map((item, index) =>
    source({
      title: item.title,
      url: item.url,
      snippet: item.content ?? item.snippet,
      published_at: item.published_date ?? null,
      provider: "tavily",
      score: typeof item.score === "number" ? item.score : 0.85 - index * 0.02
    })
  );
  return { answer: safeText(data.answer), sources };
}

async function searchSonar(env: Env, request: Parameters<Provider["search"]>[1]): Promise<ProviderResult> {
  const domainFilter = [
    ...request.domains,
    ...request.exclude_domains.map((domain) => `-${domain}`)
  ].slice(0, 20);
  const body = {
    model: env.SONAR_MODEL ?? "sonar",
    messages: [
      {
        role: "system",
        content:
          "Return a concise answer grounded in current web search. Prefer primary sources. Mention uncertainty when sources disagree."
      },
      { role: "user", content: request.query }
    ],
    search_recency_filter: freshnessToPerplexity(request.freshness),
    search_domain_filter: domainFilter.length ? domainFilter : undefined
  };
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.SONAR_API_KEY ?? ""}`
    },
    body: JSON.stringify(body)
  });
  const data = await parseJson(res, "sonar");
  const answer = safeText(data.choices?.[0]?.message?.content);
  const citations = asArray(data.citations);
  const searchResults = asArray(data.search_results);
  const citationSources = citations.map((url, index) =>
    source({
      title: extractHostname(String(url)) || String(url),
      url: String(url),
      snippet: "Citation returned by Sonar.",
      published_at: null,
      provider: "sonar",
      score: 0.9 - index * 0.02
    })
  );
  const resultSources = searchResults.map((item, index) =>
    source({
      title: item.title,
      url: item.url,
      snippet: item.snippet ?? item.text,
      published_at: item.date ?? item.published_date ?? null,
      provider: "sonar",
      score: 0.88 - index * 0.02
    })
  );
  return { answer, sources: resultSources.length ? resultSources : citationSources };
}

async function searchGrok(env: Env, request: Parameters<Provider["search"]>[1]): Promise<ProviderResult> {
  const fromDate = freshnessToDate(request.freshness);
  const tools: Array<Record<string, unknown>> = [];
  if (request.source_scope === "social") {
    tools.push({
      type: "x_search",
      ...(fromDate ? { from_date: fromDate, to_date: new Date().toISOString().slice(0, 10) } : {})
    });
  }
  const webTool: Record<string, unknown> = { type: "web_search" };
  if (request.domains.length) {
    webTool.filters = { allowed_domains: request.domains.slice(0, 5) };
  } else if (request.exclude_domains.length) {
    webTool.filters = { excluded_domains: request.exclude_domains.slice(0, 5) };
  }
  tools.push(webTool);
  const body = {
    model: env.GROK_MODEL ?? "grok-4.3",
    input: [
      {
        role: "system",
        content:
          "Use live search when useful. Return a concise answer and include source URLs when available."
      },
      { role: "user", content: request.query }
    ],
    tools
  };
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.GROK_API_KEY ?? ""}`
    },
    body: JSON.stringify(body)
  });
  const data = await parseJson(res, "grok");
  const answer = extractResponseText(data);
  const citations = asArray(data.citations ?? data.sources);
  const urls = extractUrls(answer).slice(0, request.max_results);
  const resultSources = citations.map((item, index) =>
    source({
      title: item.title ?? item.url,
      url: item.url ?? item.uri ?? item,
      snippet: item.snippet ?? item.text ?? item.title,
      published_at: item.published_at ?? item.date ?? null,
      provider: "grok",
      score: 0.9 - index * 0.02
    })
  );
  const answerSources = urls.map((url, index) =>
    source({
      title: extractHostname(url) || url,
      url,
      snippet: "URL cited in Grok response.",
      published_at: null,
      provider: "grok",
      score: 0.82 - index * 0.02
    })
  );
  return { answer, sources: resultSources.length ? resultSources : answerSources };
}

async function searchAnySearch(env: Env, request: Parameters<Provider["search"]>[1]): Promise<ProviderResult> {
  const res = await fetch(env.ANYSEARCH_API_URL ?? "https://api.anysearch.com/v1/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.ANYSEARCH_API_KEY ?? ""}`
    },
    body: JSON.stringify({
      query: request.query,
      max_results: request.max_results,
      freshness: request.freshness,
      domains: request.domains,
      exclude_domains: request.exclude_domains,
      content_types: request.content_types,
      domain: request.vertical_domain || undefined,
      sub_domain: request.sub_domain || undefined,
      sub_domain_params: Object.keys(request.sub_domain_params).length ? request.sub_domain_params : undefined,
      zone: request.zone || undefined
    })
  });
  const data = await parseJson(res, "anysearch");
  const results = asArray(data.results ?? data.sources);
  const sources = results.slice(0, request.max_results).map((item, index) =>
    source({
      title: item.title,
      url: item.url,
      snippet: item.snippet ?? item.content,
      published_at: item.published_at ?? null,
      provider: "anysearch",
      score: typeof item.score === "number" ? item.score : 0.75 - index * 0.02
    })
  );
  return { answer: safeText(data.answer), sources };
}

async function parseJson(res: Response, provider: string): Promise<any> {
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${provider} returned non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const message = safeText(data.error?.message) || safeText(data.message) || `${provider} returned HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function source(input: {
  title: unknown;
  url: unknown;
  snippet: unknown;
  published_at: unknown;
  provider: ProviderId;
  score: number;
}): SearchSource {
  const url = safeText(input.url);
  return {
    title: safeText(input.title, extractHostname(url) || "Untitled"),
    url,
    snippet: safeText(input.snippet),
    published_at: input.published_at ? String(input.published_at) : null,
    provider: input.provider,
    score: Number(input.score.toFixed(3))
  };
}

function withDomainHints(query: string, domains: string[], excludeDomains: string[]): string {
  const include = domains.map((domain) => `site:${domain}`).join(" ");
  const exclude = excludeDomains.map((domain) => `-site:${domain}`).join(" ");
  return [query, include, exclude].filter(Boolean).join(" ");
}

function freshnessForBrave(freshness: string): string {
  if (freshness === "day") return "pd";
  if (freshness === "week") return "pw";
  if (freshness === "month") return "pm";
  return "py";
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function extractUrls(text: string): string[] {
  return Array.from(new Set(text.match(/https?:\/\/[^\s)\]]+/g) ?? []));
}

function extractResponseText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = asArray(data.output)
    .flatMap((item) => asArray(item.content))
    .map((item) => safeText(item.text))
    .filter(Boolean);
  return chunks.join("\n").trim();
}
