import type { ProviderId, SearchResponse, SearchSource } from "./types";

export const DEFAULT_SYNTH_MODEL = "@cf/openai/gpt-oss-120b";
export const DEFAULT_FAST_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SYNTH_PROMPT_VERSION = "research-synth-v4";
export const FAST_PROMPT_VERSION = "fast-synth-v1";

export async function synthesizeFastAnswer(env: Env, response: SearchResponse, query: string): Promise<SearchResponse> {
  if (!env.AI || !response.sources.length) {
    return {
      ...response,
      notes: {
        ...response.notes,
        warnings: env.AI ? response.notes.warnings : [...response.notes.warnings, "workers_ai_fast: AI binding not configured"]
      }
    };
  }

  const sources = response.sources.slice(0, 8);
  const prompt = buildFastPrompt(query, sources);
  const instructions =
    "You write concise search answers grounded only in the source dossier. Write Chinese unless the query is clearly English. Be direct and useful, not verbose. Cite factual claims with [1], [2]. Mention uncertainty when the sources are weak or indirect. Do not include a bibliography, source list, preamble, or offer to continue. Output only the final answer in Markdown.";
  try {
    const model = env.WORKERS_AI_FAST_MODEL ?? DEFAULT_FAST_MODEL;
    const result = (await env.AI.run(model, {
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: prompt }
      ],
      max_tokens: 700,
      temperature: 0.25
    })) as unknown;
    const synthesized = sanitizeAnswer(extractAiText(result));
    return {
      ...response,
      answer: synthesized || response.answer,
      notes: {
        ...response.notes,
        warnings: response.notes.warnings
      }
    };
  } catch (error) {
    return {
      ...response,
      notes: {
        ...response.notes,
        warnings: [
          ...response.notes.warnings,
          `workers_ai_fast: ${error instanceof Error ? error.message : String(error)}`
        ]
      }
    };
  }
}

export async function synthesizeResearch(env: Env, response: SearchResponse, query: string): Promise<SearchResponse> {
  if (!env.AI || !response.sources.length) {
    return {
      ...response,
      notes: {
        ...response.notes,
        warnings: env.AI ? response.notes.warnings : [...response.notes.warnings, "workers_ai: AI binding not configured"]
      }
    };
  }

  const sources = response.sources.slice(0, 16);
  const prompt = buildPrompt(query, sources);
  const instructions =
    "You are a senior research analyst writing a concrete evidence-based report, not a chat assistant and not a methodology coach. Use the source dossier as raw evidence. Every section must make specific claims about the user's topic. Never write generic advice about how to analyze sources unless it is directly tied to a specific claim in the dossier. Write Chinese unless the query is clearly English. Cite claims as [1], [2]. Separate official facts, official background-only sources, credible secondary reporting, and weak rumors. If a source does not directly mention the queried entity, treat it only as background. Never convert secondary reporting into official fact. Never offer follow-up help. Output only the final report. Do not expose planning, reasoning, scratchpad notes, or English preambles.";
  try {
    const model = env.WORKERS_AI_SYNTH_MODEL ?? DEFAULT_SYNTH_MODEL;
    const input = model.includes("/openai/gpt-oss")
      ? { instructions, input: prompt }
      : {
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: prompt }
          ]
        };
    const result = (await env.AI.run(model, {
      ...input,
      max_tokens: 3600
    })) as unknown;
    const synthesized = sanitizeAnswer(extractAiText(result));
    const answer = synthesized || buildFallbackReport(query, sources);
    return {
      ...response,
      answer,
      notes: {
        ...response.notes,
        providers_used: [...new Set([...response.notes.providers_used, "cache" as ProviderId])].filter(
          (provider) => provider !== "cache"
        ),
        warnings: response.notes.warnings
      }
    };
  } catch (error) {
    return {
      ...response,
      answer: buildFallbackReport(query, sources),
      notes: {
        ...response.notes,
        warnings: [
          ...response.notes.warnings,
          `workers_ai: ${error instanceof Error ? error.message : String(error)}`
        ]
      }
    };
  }
}

function buildFastPrompt(query: string, sources: SearchSource[]): string {
  const sourceBlock = sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}
URL: ${source.url}
Provider: ${source.provider}
Published: ${source.published_at ?? "unknown"}
Snippet: ${source.snippet}`
    )
    .join("\n\n");
  const isChinese = /[\u3400-\u9fff]/.test(query);
  const format = isChinese
    ? `格式要求：
- 以 "## 快速结论" 开头，直接用 2-4 句话回答。
- 然后写 "## 依据"，用 2-5 条 bullet 说明关键证据。
- 不要逐条复述所有来源，不要输出来源列表。`
    : `Formatting requirements:
- Start with "## Quick Take" and answer directly in 2-4 sentences.
- Then write "## Evidence" with 2-5 bullets explaining the key support.
- Do not summarize every source one by one and do not output a source list.`;
  return `User query:
${query}

Source dossier:
${sourceBlock}

Task:
Write a short original answer grounded only in these search results. Prefer current, primary, and concrete facts. If the sources do not prove the central claim, say that clearly.

${format}`;
}

function buildPrompt(query: string, sources: SearchSource[]): string {
  const sourceBlock = sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}
URL: ${source.url}
Provider: ${source.provider}
Published: ${source.published_at ?? "unknown"}
Snippet: ${source.snippet}`
    )
    .join("\n\n");
  return `User query:
${query}

Source dossier:
${sourceBlock}

Task:
Write an original deep research report in clean Markdown. Do not summarize the search results one by one. Do not write a generic framework for evaluating evidence. Use the dossier to answer the query directly, with concrete facts, concrete uncertainty, and concrete implications. The answer must be self-contained and final.

Formatting requirements:
- Start with "## 核心判断" and give a direct 2-4 sentence verdict.
- Then write "## 证据分级" with bullets grouped by official/direct evidence, official background-only evidence, credible secondary sources, and weak/rumor sources.
- Then write "## 背景与脉络" explaining what the topic is, why it matters, and what changed recently.
- Then write "## 关键发现" with 4-8 substantive bullets. Each bullet should explain why the fact matters, not just restate a snippet.
- Then write "## 分析判断" with your own synthesis: what is likely true, what is exaggerated, what practical implications follow, and what evidence would change the conclusion.
- Then write "## 不确定性与风险" with unsupported claims, conflicting claims, stale information, and missing evidence.
- Then write "## 实用判断" explaining what this means for a normal user, developer, buyer, researcher, or agent, depending on the query.
- End with "## 结论" containing the final bottom line.
- The report must be at least 1500 Chinese characters when the user writes Chinese, or at least 1200 English words when the user writes English.
- Use **bold** only for short key terms.
- Cite claims with [1], [2], etc.
- Do not include a bibliography, source index, URL list, "来源索引", "来源列表", "参考来源", or "Sources used" section. The UI already renders source cards below the report.
- Do not add any offer to continue, suggested next steps, or "如果你愿意".
- Never say "你给的结果", "你提供的信息", "provided sources", or "provided search results". Refer to them as "搜索结果" or "公开搜索结果".

Quality requirements:
- Every paragraph must contain at least one concrete detail about "${query}", a specific source claim, or a specific uncertainty found in the dossier.
- If official sources are generic docs, release notes, deprecation pages, or unrelated product pages that do not directly mention the queried entity, explicitly say they are only background and cannot verify the central claim.
- Phrase unsupported secondary claims as "二手来源称", "据报道", or "尚未被官方直接确认"; do not state them as settled facts.
- Do not say there are no rumors or weak sources merely because search results look consistent. Any dramatic claim without direct primary-source support belongs in weak/uncertain evidence.
- Separate official/primary-source facts from rumors, media summaries, or community claims.
- Say "公开证据不足" when the sources do not support a strong claim.
- Prefer primary and recent sources.
- Do not invent facts beyond these sources.
- Do not mention that sources were "provided" by the user.`;
}

function extractAiText(value: unknown): string {
  const seen = new Set<unknown>();
  const chunks: string[] = [];
  const visit = (item: unknown) => {
    if (!item || seen.has(item)) return;
    if (typeof item === "string") {
      chunks.push(item);
      return;
    }
    if (typeof item !== "object") return;
    seen.add(item);
    const record = item as Record<string, unknown>;
    const type = String(record.type ?? record.kind ?? "").toLowerCase();
    if (type.includes("reasoning") || type.includes("analysis")) return;
    for (const key of ["response", "output_text", "text", "content"]) {
      if (typeof record[key] === "string") chunks.push(record[key]);
    }
    for (const key of ["result", "message", "choice", "choices", "output", "content"]) {
      const child = record[key];
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(value);
  return chunks.join("\n").trim();
}

function sanitizeAnswer(answer: string): string {
  const replaced = answer
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/基于你给的结果/g, "基于公开搜索结果")
    .replace(/根据你给的结果/g, "根据公开搜索结果")
    .replace(/从你给的结果看/g, "从公开搜索结果看")
    .replace(/你给的结果里/g, "公开搜索结果中")
    .replace(/你提供的(?:资料|信息|结果)/g, "公开搜索结果")
    .replace(/provided sources/gi, "search results")
    .replace(/provided search results/gi, "search results")
    .replace(/【([0-9,\s-]+)】/g, "[$1]")
    .trim();
  const headingIndex = replaced.search(/#{1,3}\s*核心判断/);
  const withoutPreamble = headingIndex > 0 ? replaced.slice(headingIndex) : replaced;
  return withoutPreamble
    .replace(/^\s*(We need|We need to|Need to|We must|I need to|The task is)[\s\S]*?(?=#{1,3}\s*(核心判断|Core judgment))/i, "")
    .split(/\n{2,}/)
    .filter((paragraph) => !/(要不要|愿意|如果需要|如需|我可以|我还能|我也可以|需要的话|继续帮你|再帮你|would you like|if you want|if you'd like|I can also)/i.test(paragraph))
    .join("\n\n")
    .replace(/\n*\s*(如果你愿意|如果需要|如需|我可以|我还能|我也可以|需要的话|要不要|继续帮你|再帮你)[\s\S]*$/g, "")
    .replace(/\n+#{1,3}\s*(来源索引|来源列表|参考来源|引用来源|Sources used|References|Bibliography)[\s\S]*$/i, "")
    .trim();
}

function buildFallbackReport(query: string, sources: SearchSource[]): string {
  const official = sources.filter((source) => /(^|\.)anthropic\.com$|docs\.anthropic\.com|cloudflare\.com|openai\.com|google\.com|microsoft\.com|nist\.gov|cve\.org|mitre\.org/i.test(hostname(source.url)));
  const secondary = sources.filter((source) => !official.includes(source));
  const sourceBullets = sources
    .slice(0, 10)
    .map((source, index) => `- [${index + 1}] **${source.title}**：${trimSnippet(source.snippet)} (${hostname(source.url) || source.provider})`)
    .join("\n");
  return sanitizeAnswer(`## 核心判断
关于“${query}”，合成模型这次没有返回可用报告，因此这里直接给出按来源整理的研究档案。它不是最终深度报告，但比空泛总结更有用：优先看官方/一手来源，其次看能交叉验证的行业分析，最后再处理标题夸张或缺少原始出处的材料。

## 证据分级
- **官方/一手来源**：${official.length ? official.slice(0, 5).map((source) => `${source.title}`).join("；") : "当前结果中缺少足够明确的一手来源。"}
- **可信二手来源**：${secondary.length ? secondary.slice(0, 5).map((source) => `${source.title}`).join("；") : "当前结果中二手来源有限。"}
- **弱证据/传闻来源**：凡是只给结论、不贴原始 Anthropic 文档/模型卡/评测报告的材料，都只能当线索。

## 来源摘录
${sourceBullets || "- 暂无可用来源。"}

## 临时判断
- 如果官方来源确实提到该主题的产品定位、访问限制、模型卡或系统卡，那么这些信息应作为主干事实。
- 如果二手来源在讲能力跃迁、benchmark、价格、邀请制名单或安全风险，但没有直接链接到官方文件，可信度要降一级。
- 如果多个来源互相引用同一篇爆料或同一个视频，这不是多源验证，只是同一线索扩散。

## 结论
这次结果已经有可继续分析的材料，但后端合成模型没有产出合格文本，所以暂时保留为研究档案。真正的报告应该基于上面的具体来源继续写，而不是泛泛讨论“如何判断信息可信度”。`);
}

function trimSnippet(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "无摘要";
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
