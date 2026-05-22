# Search Hub

Search Hub 是一个部署在 Cloudflare Workers 上的统一搜索网关。它同时服务两类用户：

- 人类：打开网页，像用一个 AI 搜索控制台一样搜索、筛选、收藏、复制。
- AI agent：通过 `/mcp` 调用搜索、问答、深度研究、抓取 URL、记住资料等工具。

它的核心思路很简单：你有哪个搜索 API key，就启用哪个 provider；没有的 provider 自动跳过，不会把整个服务拖崩。

## 主要功能

- 一个轻量网页搜索前端。
- 一个复用同套逻辑的 MCP-style agent 入口。
- 支持 Grok、Sonar、Brave、Tavily、AnySearch。
- `Fast`、`Balanced`、`Fresh`、`Research` 四种搜索模式。
- `Research` 模式会规划多个子查询，多 provider 搜索、去重，再用 Cloudflare Workers AI 写研究报告。
- 支持流式进度，长搜索时可以看到当前跑到哪一步。
- 支持保存有用来源、忽略低质量 URL。
- 可选访问 token，避免公开站点被别人消耗你的搜索 API。
- 可选 KV 短缓存、D1 历史记录、Cloudflare AI Search 长期记忆。
- 没有 KV/D1/AI Search 也能跑，功能会自动降级。

## 界面

第一屏就是搜索体验，不是营销落地页。

前端支持：

- 搜索框与搜索模式切换。
- 时间范围筛选。
- 来源范围筛选。
- include / exclude domain。
- 搜索历史。
- Provider 状态面板。
- 来源列表。
- 收藏、忽略、打开、复制答案。

## 架构

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
  -> KV: 短期搜索缓存
  -> D1: 历史、收藏、忽略列表
  -> Cloudflare AI Search: 长期保存的资料
```

## Provider 路由策略

Search Hub 不把所有 provider 当成一模一样的搜索框。

- `fast`：优先 Sonar，其次 Grok，直接拿带搜索能力的短答案。
- 如果 fast 模式没有 Sonar/Grok，才会按 Tavily、AnySearch、Brave 的顺序检索；Tavily/AnySearch 返回答案时直接使用，否则再用 Workers AI 小模型整理来源，默认 `@cf/google/gemma-4-26b-a4b-it`。
- `balanced`：优先 Sonar，再补充网页 provider。
- `fresh`：优先 Grok，适合时效性强、社交/热点类问题。
- `research`：生成多个研究子任务，按任务分配 provider，比如官方资料、近期报道、独立分析、技术细节，然后合并来源并生成报告。

如果某个 provider 没有配置 key，它会被跳过。只要至少有一个可用 provider，就可以工作。

## 准备条件

需要：

- Node.js 20+
- Cloudflare 账号
- Wrangler
- 至少一个搜索 provider API key

可选但推荐：

- Workers AI binding：`AI`
- KV binding：`SEARCH_CACHE`
- D1 binding：`SEARCH_DB`
- Cloudflare AI Search binding：`AI_SEARCH_UPLOAD`

## 本地运行

安装依赖：

```sh
npm install
```

复制本地环境变量模板：

```sh
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填入你拥有的 API key。

启动本地 Worker：

```sh
npm run dev -- --port 8787
```

打开：

```text
http://localhost:8787
```

快速检查：

```sh
curl http://localhost:8787/health
curl http://localhost:8787/api/providers
```

## 环境变量

你可以只填其中一部分：

```sh
GROK_API_KEY=
SONAR_API_KEY=
BRAVE_API_KEY=
TAVILY_API_KEY=
ANYSEARCH_API_KEY=
```

可选模型和 provider 设置：

```sh
GROK_MODEL=grok-4.3
SONAR_MODEL=sonar
ANYSEARCH_API_URL=https://api.anysearch.com/v1/search
WORKERS_AI_SYNTH_MODEL=@cf/openai/gpt-oss-120b
WORKERS_AI_FAST_MODEL=@cf/google/gemma-4-26b-a4b-it
AI_SEARCH_AUTO_FETCH=false
SEARCH_HUB_TOKEN=
```

如果设置了 `SEARCH_HUB_TOKEN`，所有 `/api/*` 和 `/mcp` 请求都需要带：

```text
Authorization: Bearer <SEARCH_HUB_TOKEN>
```

前端会在第一次访问时提示输入 token，并保存在当前浏览器里。

可选 Cloudflare AI Search REST 上传配置：

```sh
CF_ACCOUNT_ID=
CF_API_TOKEN=
CF_AI_SEARCH_INSTANCE=
CF_AI_SEARCH_NAMESPACE=
```

不要把 `.dev.vars`、`.env`、API key、Cloudflare token 提交到 GitHub。

## 部署到 Cloudflare Workers

这个仓库可以直接用于 Cloudflare 的 GitHub 集成。

推荐设置：

- Framework preset：`None`
- Build command：`npm run build`
- Deploy command：`npm run deploy`
- Root directory：仓库根目录

部署前，在 Cloudflare Worker 里设置 secrets：

```sh
wrangler secret put GROK_API_KEY
wrangler secret put SONAR_API_KEY
wrangler secret put BRAVE_API_KEY
wrangler secret put TAVILY_API_KEY
wrangler secret put ANYSEARCH_API_KEY
```

只需要其中一个 provider key，搜索就能工作。

建议同时设置一个访问 token：

```sh
wrangler secret put SEARCH_HUB_TOKEN
```

Workers AI 已在 `wrangler.jsonc` 中配置：

```jsonc
"ai": {
  "binding": "AI"
}
```

静态前端资源也已在 `wrangler.jsonc` 中配置：

```jsonc
"assets": {
  "directory": "./public",
  "binding": "ASSETS"
}
```

## 可选存储

### KV 缓存

添加名为 `SEARCH_CACHE` 的 KV binding 后，Search Hub 会使用它做短期搜索结果缓存。

### D1 历史记录

添加名为 `SEARCH_DB` 的 D1 binding 后，可以保存搜索历史、收藏来源、忽略 URL。
历史记录会保存完整搜索结果，所以点击旧问题时会直接恢复当时的答案和来源，不会重新消耗搜索 API。

数据库迁移在：

```text
migrations/0001_init.sql
migrations/0002_add_history_payloads.sql
```

创建 D1 后，在 `wrangler.jsonc` 里取消注释并填入你的数据库信息：

```jsonc
"d1_databases": [
  {
    "binding": "SEARCH_DB",
    "database_name": "search-hub",
    "database_id": "your-database-id"
  }
]
```

### Cloudflare AI Search

添加名为 `AI_SEARCH_UPLOAD` 的 AI Search binding 后，`remember` 会把保存的来源作为文档上传。

也可以使用上面列出的 REST 上传环境变量。

## API

### `GET /api/providers`

返回 provider 是否启用、缺少哪个环境变量。

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

请求格式和 `/api/search` 相同，但会先流式返回搜索进度，最后返回完整结果。

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

`POST /mcp` 提供这些工具：

- `search`
- `answer`
- `research`
- `batch_search`
- `fetch_url`
- `remember`

快速检查：

```sh
curl -X POST http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## 注意事项

Search Hub 是搜索路由和答案合成层，不保证每个 provider 返回的内容都是真的。

`Research` 模式会尽量区分一手来源、二手报道和弱证据，但重要事实仍建议人工复核，尤其是医疗、法律、金融、安全等高风险场景。

## License

MIT
