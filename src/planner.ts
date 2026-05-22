import type { ResearchPlanItem, SearchRequest } from "./types";

const OFFICIAL_DOMAINS: Array<[RegExp, string[]]> = [
  [/claude|anthropic|mythos/i, ["anthropic.com", "docs.anthropic.com"]],
  [/openai|gpt|chatgpt/i, ["openai.com", "platform.openai.com"]],
  [/cloudflare|workers|mcp/i, ["cloudflare.com", "developers.cloudflare.com"]],
  [/google|gemini/i, ["google.com", "blog.google", "deepmind.google"]],
  [/microsoft|azure/i, ["microsoft.com", "azure.microsoft.com"]],
  [/apple|ios|iphone|mac/i, ["apple.com", "developer.apple.com"]],
  [/cve|vulnerability|漏洞|安全|cyber|security/i, ["cve.org", "nvd.nist.gov", "mitre.org"]]
];

export function buildResearchPlan(request: Required<SearchRequest>): ResearchPlanItem[] {
  const q = request.query;
  const officialDomains = inferOfficialDomains(q);
  const scope = request.source_scope;
  const freshness = request.freshness;
  const max = Math.min(6, Math.max(4, Math.ceil(request.max_results / 2)));

  const plan: ResearchPlanItem[] = [
    {
      query: officialDomains.length ? `${q} official documentation announcement source` : `${q} official source documentation`,
      purpose: "官方/一手来源确认",
      providers: ["brave", "sonar"],
      source_scope: "docs",
      freshness,
      domains: officialDomains,
      max_results: max
    },
    {
      query: `${q} latest news analysis`,
      purpose: "近期报道与时间线",
      providers: ["grok", "brave"],
      source_scope: "news",
      freshness: freshness === "any" ? "month" : freshness,
      max_results: max
    },
    {
      query: `${q} independent analysis criticism limitations`,
      purpose: "独立分析、质疑与限制",
      providers: ["tavily", "sonar"],
      source_scope: "web",
      freshness,
      max_results: max
    },
    {
      query: `${q} comparison alternatives benchmark evidence`,
      purpose: "对比、基准与证据强度",
      providers: ["sonar", "tavily"],
      source_scope: inferVerticalScope(q) ?? scope,
      freshness,
      max_results: max
    }
  ];

  if (/(cve|vulnerability|漏洞|exploit|cyber|security|安全|mythos|glasswing)/i.test(q)) {
    plan.push({
      query: `${q} cybersecurity defensive research technical details`,
      purpose: "安全/技术细节垂直检索",
      providers: ["sonar", "grok"],
      source_scope: "security",
      vertical_domain: "security",
      content_types: ["web", "news", "doc"],
      freshness,
      max_results: max
    });
  }

  return dedupePlan(plan).slice(0, 5);
}

function inferOfficialDomains(query: string): string[] {
  const domains = new Set<string>();
  for (const [pattern, matches] of OFFICIAL_DOMAINS) {
    if (pattern.test(query)) matches.forEach((domain) => domains.add(domain));
  }
  return Array.from(domains).slice(0, 5);
}

function inferVerticalScope(query: string): ResearchPlanItem["source_scope"] | undefined {
  if (/(paper|论文|doi|arxiv|research|研究)/i.test(query)) return "academic";
  if (/(cve|漏洞|security|cyber|exploit|安全)/i.test(query)) return "security";
  if (/(stock|股票|earnings|财报|finance|金融)/i.test(query)) return "finance";
  if (/(law|legal|lawsuit|regulation|法规|法律)/i.test(query)) return "legal";
  if (/(github|code|repo|npm|package|代码|开源)/i.test(query)) return "code";
  if (/(health|medical|medicine|疾病|医疗|健康)/i.test(query)) return "health";
  return undefined;
}

function dedupePlan(plan: ResearchPlanItem[]): ResearchPlanItem[] {
  const seen = new Set<string>();
  const out: ResearchPlanItem[] = [];
  for (const item of plan) {
    const key = item.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
