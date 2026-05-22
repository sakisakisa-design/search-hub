import { routeProviders } from "./providers";
import { buildResearchPlan } from "./planner";
import { DEFAULT_SYNTH_MODEL, SYNTH_PROMPT_VERSION, synthesizeResearch } from "./synthesizer";
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
  const key = cacheKey(
    request,
    request.mode === "research" ? `synth:${env.WORKERS_AI_SYNTH_MODEL ?? DEFAULT_SYNTH_MODEL}:${SYNTH_PROMPT_VERSION}` : ""
  );
  const cached = await readCached(env, key);
  if (cached) {
    const response = {
      ...cached,
      cached: true,
      sources: cached.sources.map((source) => ({ ...source, provider: "cache" as const, cached: true })),
      notes: { ...cached.notes, freshness: "cache" as const }
    };
    await recordHistory(env, request.query, request.mode, true);
    await emit({ type: "cache_hit", message: "Cache hit" });
    return response;
  }

  const selected = routeProviders(env, request.mode, request.source_scope);
  if (!selected.length) {
    await recordHistory(env, request.query, request.mode, false);
    return {
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
  }

  const response = request.mode === "research"
    ? await runPlannedResearch(env, request, emit)
    : await runProviderSearch(env, request, emit);

  if (request.mode === "research") {
    await emit({ type: "synthesis_start", message: "Writing research report with Workers AI" });
  }
  const finalResponse = request.mode === "research" ? await synthesizeResearch(env, response, request.query) : response;
  if (request.mode === "research") {
    await emit({ type: "synthesis_done", message: "Research report ready" });
  }
  if (finalResponse.sources.length || finalResponse.answer) await writeCached(env, key, finalResponse, cacheTtl(request.freshness));
  await recordHistory(env, request.query, request.mode, false);
  await emit({ type: "complete", message: "Search complete" });
  return finalResponse;
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
  const sources: SearchSource[] = [];
  const used: ProviderId[] = [];

  settled.forEach((result, index) => {
    const provider = targets[index];
    if (result.status === "rejected") {
      warnings.push(`${provider.id}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      return;
    }
    used.push(provider.id);
    if (result.value.answer) answers.push(result.value.answer);
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
    answer: answers[0] ?? "",
    cached: false,
    sources: filtered,
    notes: {
      providers_used: used,
      freshness: "live",
      warnings
    }
  };
  return response;
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
