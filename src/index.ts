import { fetchUrl } from "./fetch-url";
import { handleMcp } from "./mcp";
import { providerStatuses } from "./providers";
import { runSearch } from "./search";
import { history, ignore, remember } from "./storage";
import { json, normalizeSearchRequest, validateSearchRequest } from "./utils";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        return json({ ok: true, service: "search-hub-mcp", time: new Date().toISOString() });
      }
      if (url.pathname === "/api/providers" && request.method === "GET") {
        return json(providerStatuses(env));
      }
      if (url.pathname === "/api/search" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const searchRequest = normalizeSearchRequest(body);
        const error = validateSearchRequest(searchRequest);
        if (error) return json({ error }, { status: 400 });
        return json(await runSearch(env, searchRequest));
      }
      if (url.pathname === "/api/search/stream" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const searchRequest = normalizeSearchRequest(body);
        const error = validateSearchRequest(searchRequest);
        if (error) return json({ error }, { status: 400 });
        return streamSearch(env, searchRequest);
      }
      if (url.pathname === "/api/batch_search" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { queries?: Array<Record<string, unknown>> };
        const queries = Array.isArray(body.queries) ? body.queries.slice(0, 5) : [];
        if (!queries.length) return json({ error: "queries is required" }, { status: 400 });
        const requests = queries.map((item) => normalizeSearchRequest(item));
        const error = requests.map(validateSearchRequest).find(Boolean);
        if (error) return json({ error }, { status: 400 });
        return json({ results: await Promise.all(requests.map((item) => runSearch(env, item))) });
      }
      if (url.pathname === "/api/remember" && request.method === "POST") {
        const body = await enrichRememberRequest(env, await request.json());
        if (!body.url) return json({ error: "url is required" }, { status: 400 });
        return json(await remember(env, body));
      }
      if (url.pathname === "/api/ignore" && request.method === "POST") {
        return json(await ignore(env, await request.json()));
      }
      if (url.pathname === "/api/history" && request.method === "GET") {
        return json(await history(env));
      }
      if (url.pathname === "/api/fetch" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { url?: string };
        return json(await fetchUrl(String(body.url ?? "")));
      }
      if (url.pathname === "/mcp") {
        return handleMcp(request, env);
      }
      if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json({ error: "not found" }, { status: 404 });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }
};

function streamSearch(env: Env, searchRequest: ReturnType<typeof normalizeSearchRequest>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        send("progress", { type: "start", message: "Starting search" });
        const result = await runSearch(env, searchRequest, {
          onEvent: (event) => send("progress", event)
        });
        send("result", result);
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });
}

async function enrichRememberRequest(env: Env, body: unknown): Promise<import("./types").RememberRequest> {
  const request = body as { url?: string; title?: string; snippet?: string; content?: string; fetch_content?: boolean };
  const base = { ...request, url: String(request.url ?? "") };
  const shouldFetch = request.fetch_content ?? env.AI_SEARCH_AUTO_FETCH === "true";
  if (!shouldFetch || request.content || !request.url) return base;
  try {
    const fetched = await fetchUrl(request.url);
    return {
      ...base,
      title: request.title || fetched.title,
      snippet: request.snippet || fetched.content.slice(0, 500),
      content: fetched.content
    };
  } catch {
    return base;
  }
}
