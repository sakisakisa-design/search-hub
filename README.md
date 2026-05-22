# Search Hub

Search Hub is a Cloudflare Workers search gateway for humans and AI agents.

It gives you one search endpoint that can use whichever provider keys you have:
Grok, Sonar, Brave, Tavily, or AnySearch. The same backend powers a small web UI
and an MCP-style endpoint for agents.

## What It Does

- Search from a human-friendly web UI.
- Expose search tools to agents through `/mcp`.
- Use any available provider key instead of requiring a fixed vendor.
- Route different search modes to different providers.
- Stream progress while long research searches are running.
- Synthesize `research` results with Cloudflare Workers AI.
- Save useful sources and ignore low-quality URLs.
- Degrade gracefully when optional KV, D1, or AI Search bindings are missing.

## Screens

The first screen is the actual search console, not a landing page. The UI supports:

- Fast, Balanced, Fresh, and Research modes.
- Time filters.
- Source scope filters.
- Include/exclude domain filters.
- Search history.
- Provider status.
- Save, ignore, open, and copy actions.

## Architecture

```text
Frontend
  -> /api/search
  -> /api/search/stream
  -> /api/providers
  -> /api/remember
  -> /api/ignore
  -> /api/history

Agents
  -> /mcp
     - search
     - answer
     - research
     - batch_search
     - fetch_url
     - remember

Providers
  -> Grok
  -> Sonar
  -> Brave
  -> Tavily
  -> AnySearch

Optional storage
  -> KV for short search cache
  -> D1 for history, saved sources, ignored URLs
  -> Cloudflare AI Search for remembered documents
```

## Provider Routing

Search Hub does not treat all providers as interchangeable.

- `fast`: prefers raw web results such as Brave and Tavily.
- `balanced`: prefers Sonar first, then web providers.
- `fresh`: prefers Grok for current or social-heavy queries.
- `research`: plans several sub-queries, fans out across multiple providers,
  deduplicates sources, then asks Workers AI to write the final report.

If a provider key is missing, that provider is skipped. The Worker still starts.

## Requirements

- Node.js 20+
- A Cloudflare account
- Wrangler
- At least one search provider API key

Optional but useful:

- A Cloudflare Workers AI binding named `AI`
- A KV namespace named `SEARCH_CACHE`
- A D1 database named `SEARCH_DB`
- A Cloudflare AI Search binding named `AI_SEARCH_UPLOAD`

## Local Development

Install dependencies:

```sh
npm install
```

Copy the local environment template:

```sh
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add whichever provider keys you have.

Start the Worker:

```sh
npm run dev -- --port 8787
```

Open:

```text
http://localhost:8787
```

Useful checks:

```sh
curl http://localhost:8787/health
curl http://localhost:8787/api/providers
```

## Environment Variables

Set any subset of these:

```sh
GROK_API_KEY=
SONAR_API_KEY=
BRAVE_API_KEY=
TAVILY_API_KEY=
ANYSEARCH_API_KEY=
```

Optional model and provider settings:

```sh
GROK_MODEL=grok-4.3
SONAR_MODEL=sonar
ANYSEARCH_API_URL=https://api.anysearch.com/v1/search
WORKERS_AI_SYNTH_MODEL=@cf/openai/gpt-oss-120b
AI_SEARCH_AUTO_FETCH=false
```

Optional Cloudflare AI Search REST upload settings:

```sh
CF_ACCOUNT_ID=
CF_API_TOKEN=
CF_AI_SEARCH_INSTANCE=
CF_AI_SEARCH_NAMESPACE=
```

Never commit `.dev.vars`, `.env`, API keys, or Cloudflare tokens.

## Deploy To Cloudflare Workers

This repository is ready for Cloudflare's GitHub integration.

Recommended Cloudflare settings:

- Framework preset: `None`
- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Root directory: repository root

Before deploying, set Worker secrets in Cloudflare:

```sh
wrangler secret put GROK_API_KEY
wrangler secret put SONAR_API_KEY
wrangler secret put BRAVE_API_KEY
wrangler secret put TAVILY_API_KEY
wrangler secret put ANYSEARCH_API_KEY
```

You only need one provider key to make search work.

Workers AI is configured in `wrangler.jsonc` with:

```jsonc
"ai": {
  "binding": "AI"
}
```

Static frontend assets are configured with:

```jsonc
"assets": {
  "directory": "./public",
  "binding": "ASSETS"
}
```

## Optional Storage

### KV Cache

Add a KV binding named `SEARCH_CACHE` for short-lived search result caching.

### D1 History

Add a D1 binding named `SEARCH_DB` for history, saved sources, and ignored URLs.
The migration is in `migrations/0001_init.sql`.

### Cloudflare AI Search

Add an AI Search binding named `AI_SEARCH_UPLOAD` to save remembered sources as
documents. You can also use the REST upload variables listed above.

## API

### `GET /api/providers`

Returns enabled and missing providers.

### `POST /api/search`

```json
{
  "query": "post-quantum TLS rollout 2026",
  "mode": "research",
  "freshness": "month",
  "source_scope": "web",
  "domains": [],
  "exclude_domains": [],
  "max_results": 10
}
```

### `POST /api/search/stream`

Same request shape as `/api/search`, but streams progress events before returning
the final result.

### `POST /api/remember`

```json
{
  "url": "https://example.com/article",
  "title": "Useful article",
  "snippet": "Why this source matters",
  "reason": "user_saved",
  "tags": ["research"],
  "fetch_content": true,
  "upload_to_ai_search": false
}
```

### `POST /api/ignore`

```json
{
  "url": "https://example.com/spam",
  "reason": "low_quality"
}
```

## MCP

`POST /mcp` exposes:

- `search`
- `answer`
- `research`
- `batch_search`
- `fetch_url`
- `remember`

Quick check:

```sh
curl -X POST http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Safety Notes

Search Hub is a routing and synthesis layer. It does not guarantee that every
provider result is true. Research mode tries to separate primary sources,
secondary reporting, and weak claims, but users should still verify important
facts before relying on them.

## License

MIT
