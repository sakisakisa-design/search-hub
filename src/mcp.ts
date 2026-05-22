import { fetchUrl } from "./fetch-url";
import { remember } from "./storage";
import { runSearch } from "./search";
import { normalizeSearchRequest, validateSearchRequest } from "./utils";

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: any;
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    return rpcResponse(null, {
      name: "Search Hub MCP",
      transport: "streamable-http",
      endpoint: "/mcp"
    });
  }
  const payload = (await request.json().catch(() => null)) as JsonRpcRequest | JsonRpcRequest[] | null;
  if (!payload) return rpcError(null, -32700, "Parse error");
  if (Array.isArray(payload)) {
    const responses = await Promise.all(payload.map((item) => dispatch(item, env)));
    return rpcResponseRaw(responses);
  }
  return dispatch(payload, env);
}

async function dispatch(request: JsonRpcRequest, env: Env): Promise<Response> {
  const id = request.id ?? null;
  try {
    if (request.method === "initialize") {
      return rpcResponse(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "search-hub-mcp", version: "0.1.0" }
      });
    }
    if (request.method === "ping") return rpcResponse(id, {});
    if (request.method === "tools/list") {
      return rpcResponse(id, { tools });
    }
    if (request.method === "tools/call") {
      const name = String(request.params?.name ?? "");
      const args = request.params?.arguments ?? {};
      const result = await callTool(name, args, env);
      return rpcResponse(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      });
    }
    if (request.method?.startsWith("notifications/")) return new Response(null, { status: 202 });
    return rpcError(id, -32601, "Method not found");
  } catch (error) {
    return rpcError(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(name: string, args: any, env: Env): Promise<unknown> {
  if (name === "search" || name === "answer" || name === "research") {
    const request = normalizeSearchRequest({
      ...args,
      mode: name === "research" ? "research" : args.mode,
      max_results: args.max_results ?? (name === "research" ? 12 : 8)
    });
    const error = validateSearchRequest(request);
    if (error) throw new Error(error);
    return runSearch(env, request);
  }
  if (name === "batch_search") {
    const queries = Array.isArray(args.queries) ? args.queries.slice(0, 5) : [];
    if (!queries.length) throw new Error("queries is required");
    return Promise.all(
      queries.map((item: any) => {
        const request = normalizeSearchRequest({
          ...item,
          mode: item.mode ?? args.mode ?? "balanced",
          freshness: item.freshness ?? args.freshness,
          source_scope: item.source_scope ?? args.source_scope,
          max_results: item.max_results ?? args.max_results ?? 5
        });
        const error = validateSearchRequest(request);
        if (error) throw new Error(error);
        return runSearch(env, request);
      })
    );
  }
  if (name === "fetch_url") return fetchUrl(String(args.url ?? ""));
  if (name === "remember") return remember(env, await enrichRememberRequest(env, args));
  throw new Error(`Unknown tool: ${name}`);
}

async function enrichRememberRequest(env: Env, args: any) {
  const shouldFetch = args.fetch_content ?? env.AI_SEARCH_AUTO_FETCH === "true";
  if (!shouldFetch || args.content || !args.url) return args;
  try {
    const fetched = await fetchUrl(String(args.url));
    return {
      ...args,
      title: args.title || fetched.title,
      snippet: args.snippet || fetched.content.slice(0, 500),
      content: fetched.content
    };
  } catch {
    return args;
  }
}

const searchSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    mode: { type: "string", enum: ["fast", "balanced", "fresh", "research"] },
    freshness: { type: "string", enum: ["any", "day", "week", "month"] },
    source_scope: { type: "string", enum: ["web", "news", "docs", "social", "code", "academic", "finance", "legal", "security", "health"] },
    domains: { type: "array", items: { type: "string" } },
    exclude_domains: { type: "array", items: { type: "string" } },
    content_types: { type: "array", items: { type: "string" } },
    vertical_domain: { type: "string" },
    sub_domain: { type: "string" },
    zone: { type: "string", enum: ["cn", "intl"] },
    max_results: { type: "number" }
  },
  required: ["query"]
};

const tools = [
  {
    name: "search",
    description: "Search the live web or cached results and return structured sources.",
    inputSchema: searchSchema
  },
  {
    name: "answer",
    description: "Search and return a concise answer with citations when providers support them.",
    inputSchema: searchSchema
  },
  {
    name: "research",
    description: "Plan several research queries, run multi-provider searches, and return a synthesized deep research report.",
    inputSchema: searchSchema
  },
  {
    name: "batch_search",
    description: "Run 1-5 independent searches in parallel.",
    inputSchema: {
      type: "object",
      properties: {
        queries: { type: "array", items: searchSchema, minItems: 1, maxItems: 5 },
        mode: { type: "string", enum: ["fast", "balanced", "fresh", "research"] },
        freshness: { type: "string", enum: ["any", "day", "week", "month"] },
        source_scope: { type: "string", enum: ["web", "news", "docs", "social", "code", "academic", "finance", "legal", "security", "health"] },
        max_results: { type: "number" }
      },
      required: ["queries"]
    }
  },
  {
    name: "fetch_url",
    description: "Fetch and extract readable text from a URL.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "remember",
    description: "Save a URL or source into the long-term knowledge candidate list.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        title: { type: "string" },
        snippet: { type: "string" },
        reason: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["url"]
    }
  }
];

function rpcResponse(id: string | number | null, result: unknown): Response {
  return rpcResponseRaw({ jsonrpc: "2.0", id, result });
}

function rpcError(id: string | number | null, code: number, message: string): Response {
  return rpcResponseRaw({ jsonrpc: "2.0", id, error: { code, message } });
}

function rpcResponseRaw(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type, authorization, mcp-session-id"
    }
  });
}
