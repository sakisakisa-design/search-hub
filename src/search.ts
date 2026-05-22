import { routeProviders } from "./providers";
import { buildResearchPlan } from "./planner";
import {
  DEFAULT_FAST_MODEL,
  DEFAULT_SYNTH_MODEL,
  FAST_PROMPT_VERSION,
  SYNTH_PROMPT_VERSION,
  synthesizeFastAnswer,
  synthesizeResearch
} from "./synthesizer";
import { listIgnored, readCached, recordHistory, writeCached } from "./storage";
import type { ProviderId, ResearchPlanItem, SearchResponse, SearchSource } from "./types";
import { cacheKey, cacheTtl, isIgnored, stableDedupe } from "./utils";

export interface SearchProgressEvent {
  type: string;
  message: string;
  provider?: ProviderId;
  providers?: ProviderId[];
  plan?: ResearchPlanItem[];
  query?: string;
  purpose?: string;
}

export async function runSearch(
  env: Env,
  request: Required<import("./types").SearchRequest>,
  options: { onEvent?: (event: SearchProgressEvent) => void | Promise<void> } = {}
): Promise<SearchResponse> {
  const emit = async (event: SearchProgressEvent) => {
    await options.onEvent?.(event);
  };

  await emit({ type: "cache_check", message: "Checking local cache" });
  const synthesisKey =
    request.mode === "research"
      ? `synth:${env.WORKERS_AI_SYNTH_MODEL ?? DEFAULT_SYNTH_MODEL}:${SYNTH_PROMPT_VERSION}`
      : request.mode === "fast"
        ? `fast-synth:${env.WORKERS_AI_FAST_MODEL ?? DEFAULT_FAST_MODEL}:${FAST_PROMPT_VERSION}`
        : "";
  const key = cacheKey(
    request,
    synthesisKey
  );
  const cached = await readCached(env, key);
  if (cached) {
    const response: SearchResponse = {
      ...cached,
      cached: true,
      sources: cached.sources.map((source) => ({ ...source, provider: "cache" as const, cached: true })),
      notes: { ...cached.notes, freshness: "cache" as const }
    };
    await recordHistory(env, request, response);
    await emit({ type: "cache_hit", message: "Cache hit" });
    return response;
  }

  const selected = routeProviders(env, request.mode, request.source_scope);
  if (!selected.length) {
    const response: SearchResponse = {
      answer: "",
      cached: false,
      sources: [],
      notes: {
        providers_used: [],
        freshness: "none",
        warnings: [
          "No search providers are enabled. Add at least one of GROK_API_KEY, SONAR_API_KEY, BRAVE_API_KEY, TAVILY_API_KEY, or ANYSEARCH_API_KEY."
        ]
      }
    };
    await recordHistory(env, request, response);
    return response;
  }

  const response = request.mode === "research"
    ? await runPlannedResearch(env, request, emit)
    : await runProviderSearch(env, request, emit);

  if (request.mode === "research") {
    await emit({ type: "synthesis_start", message: "Writing research report with Workers AI" });
  } else if (request.mode === "fast" && shouldSynthesizeFast(response)) {
    await emit({ type: "fast_synthesis_start", message: "Writing quick answer with Workers AI" });
  }
  const finalResponse =
    request.mode === "research"
      ? await synthesizeResearch(env, response, request.query)
      : request.mode === "fast" && shouldSynthesizeFast(response)
        ? await synthesizeFastAnswer(env, response, request.query)
        : response;
  if (request.mode === "research") {
    await emit({ type: "synthesis_done", message: "Research report ready" });
  } else if (request.mode === "fast" && shouldSynthesizeFast(response)) {
    await emit({ type: "fast_synthesis_done", message: "Quick answer ready" });
  }
  if (finalResponse.sources.length || finalResponse.answer) await writeCached(env, key, finalResponse, cacheTtl(request.freshness));
  await recordHistory(env, request, finalResponse);
  await emit({ type: "complete", message: "Search complete" });
  return finalResponse;
}

function shouldSynthesizeFast(response: SearchResponse): boolean {
  const directAnswerProviders = new Set<ProviderId>(["sonar", "grok", "tavily", "anysearch"]);
  return !response.notes.answer_provider || !directAnswerProviders.has(response.notes.answer_provider);
}

async function runPlannedResearch(
  env: Env,
  request: Required<import("./types").SearchRequest>,
  emit: (event: SearchProgressEvent) => Promise<void>
): Promise<SearchResponse> {
  const plan = buildResearchPlan(request);
  await emit({ type: "plan_ready", message: `Built ${plan.length} research queries`, plan });
  const perQueryMax = Math.min(6, Math.max(4, Math.ceil(request.max_results / 2)));
  const settled = await Promise.allSettled(
    plan.map((item) => {
      const plannedRequest: Required<import("./types").SearchRequest> = {
        ...request,
        query: item.query,
        purpose: item.purpose,
        source_scope: item.source_scope ?? request.source_scope,
        freshness: item.freshness ?? request.freshness,
        domains: item.domains ?? request.domains,
        exclude_domains: item.exclude_domains ?? request.exclude_domains,
        content_types: item.content_types ?? request.content_types,
        vertical_domain: item.vertical_domain ?? request.vertical_domain,
        sub_domain: item.sub_domain ?? request.sub_domain,
        sub_domain_params: item.sub_domain_params ?? request.sub_domain_params,
        zone: item.zone ?? request.zone,
        max_results: item.max_results ?? perQueryMax
      };
      return runProviderSearch(env, plannedRequest, emit, { fanoutCount: 2, purpose: item.purpose, providers: item.providers });
    })
  );

  const warnings: string[] = [];
  const answers: string[] = [];
  const sources: SearchSource[] = [];
  const used: ProviderId[] = [];
  for (const result of settled) {
    if (result.status === "rejected") {
      warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      continue;
    }
    answers.push(result.value.answer);
    sources.push(...result.value.sources);
    used.push(...result.value.notes.providers_used);
    warnings.push(...result.value.notes.warnings);
  }

  await emit({ type: "merge_start", message: "Merging planned research sources" });
  const ignored = await listIgnored(env);
  const filtered = stableDedupe(
    sources.filter((source) => source.url && !isIgnored(source.url, ignored)),
    request.max_results
  );
  return {
    answer: answers.filter(Boolean).join("\n\n"),
    cached: false,
    sources: filtered,
    notes: {
      providers_used: Array.from(new Set(used)),
      freshness: "live",
      warnings,
      research_plan: plan
    }
  };
}

async function runProviderSearch(
  env: Env,
  request: Required<import("./types").SearchRequest>,
  emit: (event: SearchProgressEvent) => Promise<void>,
  options: { fanoutCount?: number; purpose?: string; providers?: Exclude<ProviderId, "cache">[] } = {}
): Promise<SearchResponse> {
  const selected = routeProviders(env, request.mode, request.source_scope);
  const fanoutCount = options.fanoutCount ?? (request.mode === "research" ? 4 : request.mode === "balanced" ? 2 : 1);
  const targets = selectProviderTargets(selected, options.providers, fanoutCount);
  await emit({
    type: "providers_selected",
    message: `Searching ${targets.map((provider) => provider.id).join(", ")}`,
    providers: targets.map((provider) => provider.id),
    query: request.query,
    purpose: options.purpose ?? request.purpose
  });
  const settled = await Promise.allSettled(
    targets.map(async (provider) => {
      await emit({ type: "provider_start", message: `Searching ${provider.id}`, provider: provider.id, query: request.query, purpose: options.purpose ?? request.purpose });
      try {
        const result = await provider.search(env, request);
        await emit({ type: "provider_done", message: `${provider.id} returned ${result.sources.length} sources`, provider: provider.id, query: request.query, purpose: options.purpose ?? request.purpose });
        return result;
      } catch (error) {
        await emit({
          type: "provider_error",
          message: `${provider.id} failed: ${error instanceof Error ? error.message : String(error)}`,
          provider: provider.id,
          query: request.query,
          purpose: options.purpose ?? request.purpose
        });
        throw error;
      }
    })
  );
  const warnings: string[] = [];
  const answers: string[] = [];
  let answerProvider: ProviderId | undefined;
  const sources: SearchSource[] = [];
  const used: ProviderId[] = [];

  settled.forEach((result, index) => {
    const provider = targets[index];
    if (result.status === "rejected") {
      warnings.push(`${provider.id}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      return;
    }
    used.push(provider.id);
    if (result.value.answer) {
      answers.push(result.value.answer);
      answerProvider ??= provider.id;
    }
    if (result.value.warnings?.length) warnings.push(...result.value.warnings.map((warning) => `${provider.id}: ${warning}`));
    sources.push(...result.value.sources);
  });

  await emit({ type: "merge_start", message: "Merging and deduplicating sources" });
  const ignored = await listIgnored(env);
  const filtered = stableDedupe(
    sources.filter((source) => source.url && !isIgnored(source.url, ignored)),
    request.max_results
  );
  const response: SearchResponse = {
    answer: answers[0] ?? buildSourceSummary(request, filtered),
    cached: false,
    sources: filtered,
    notes: {
      providers_used: used,
      freshness: "live",
      warnings,
      ...(answerProvider ? { answer_provider: answerProvider } : {})
    }
  };
  return response;
}

function buildSourceSummary(request: Required<import("./types").SearchRequest>, sources: SearchSource[]): string {
  if (!sources.length) return "";
  const top = sources.slice(0, Math.min(3, sources.length));
  const isChinese = /[\u3400-\u9fff]/.test(request.query);
  if (!isChinese) {
    const lines = top.map((source, index) => {
      const snippet = compactSnippet(source.snippet || source.title);
      return `- **${source.title || "Source"}**: ${snippet} [${index + 1}]`;
    });
    return [
      `## Quick Take`,
      `Fast mode found ${sources.length} relevant source${sources.length === 1 ? "" : "s"} for "${request.query}". The strongest signals are:`,
      "",
      ...lines
    ].join("\n");
  }
  const lines = top.map((source, index) => {
    const snippet = compactSnippet(source.snippet || source.title);
    return `- **${source.title || "来源"}**：${snippet} [${index + 1}]`;
  });
  return [
    "## 快速结论",
    `Fast 模式为「${request.query}」找到 ${sources.length} 条相关来源。最值得先看的信息是：`,
    "",
    ...lines
  ].join("\n");
}

function compactSnippet(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "该来源没有提供摘要。";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function selectProviderTargets(
  selected: ReturnType<typeof routeProviders>,
  preferred: Exclude<ProviderId, "cache">[] | undefined,
  fanoutCount: number
) {
  if (!preferred?.length) return selected.slice(0, fanoutCount);
  const picked = new Set<ProviderId>();
  const byId = new Map(selected.map((provider) => [provider.id, provider]));
  const targets = preferred.flatMap((id) => {
    const provider = byId.get(id);
    if (!provider || picked.has(provider.id)) return [];
    picked.add(provider.id);
    return [provider];
  });
  for (const provider of selected) {
    if (targets.length >= fanoutCount) break;
    if (picked.has(provider.id)) continue;
    picked.add(provider.id);
    targets.push(provider);
  }
  return targets.slice(0, fanoutCount);
}
