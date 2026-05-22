export type ProviderId = "grok" | "sonar" | "brave" | "tavily" | "anysearch" | "cache";
export type SearchMode = "fast" | "balanced" | "fresh" | "research";
export type Freshness = "any" | "day" | "week" | "month";
export type SourceScope = "web" | "news" | "docs" | "social" | "code" | "academic" | "finance" | "legal" | "security" | "health";

export interface SearchRequest {
  query: string;
  mode?: SearchMode;
  freshness?: Freshness;
  source_scope?: SourceScope;
  domains?: string[];
  exclude_domains?: string[];
  content_types?: string[];
  vertical_domain?: string;
  sub_domain?: string;
  sub_domain_params?: Record<string, unknown>;
  zone?: "cn" | "intl" | "";
  purpose?: string;
  max_results?: number;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  published_at: string | null;
  provider: ProviderId;
  score: number;
  cached?: boolean;
}

export interface SearchResponse {
  answer: string;
  cached: boolean;
  sources: SearchSource[];
  notes: {
    providers_used: ProviderId[];
    freshness: "cache" | "live" | "none";
    warnings: string[];
    answer_provider?: ProviderId;
    research_plan?: ResearchPlanItem[];
  };
}

export interface ResearchPlanItem {
  query: string;
  purpose: string;
  providers?: Exclude<ProviderId, "cache">[];
  source_scope?: SourceScope;
  freshness?: Freshness;
  domains?: string[];
  exclude_domains?: string[];
  content_types?: string[];
  vertical_domain?: string;
  sub_domain?: string;
  sub_domain_params?: Record<string, unknown>;
  zone?: "cn" | "intl";
  max_results?: number;
}

export interface ProviderStatus {
  id: Exclude<ProviderId, "cache">;
  enabled: boolean;
  capabilities: string[];
  missing?: string;
}

export interface ProviderResult {
  answer?: string;
  sources: SearchSource[];
  warnings?: string[];
}

export interface Provider {
  id: Exclude<ProviderId, "cache">;
  envKey: keyof Env;
  capabilities: string[];
  search(env: Env, request: Required<SearchRequest>): Promise<ProviderResult>;
}

export interface RememberRequest {
  url: string;
  title?: string;
  snippet?: string;
  content?: string;
  query?: string;
  reason?: string;
  tags?: string[];
  upload_to_ai_search?: boolean;
  fetch_content?: boolean;
}

export interface IgnoreRequest {
  url: string;
  reason?: string;
}
