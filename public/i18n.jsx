/* global React */
/* Tiny i18n table for Search Hub.
   Two locales: en + zh.  Strings are either flat keys or small dicts. */

const I18N = {
  en: {
    /* shell */
    brand_sub:        "multi-provider · v0.4",
    crumb:            "Search",
    providers_on:     (n) => `${n} on`,
    providers_miss:   (n) => `${n} missing`,

    /* search form */
    placeholder:      "Search the web, news, docs, social…",
    placeholder_compact: "Search…",
    filters:          "Filters",
    time:             "Time",
    source:           "Source",
    include_domains:  "Include domains",
    exclude_domains:  "Exclude domains",
    max_results:      "Max results",
    less:             "Less",
    more:             "More",
    clear:            "Clear",
    submit:           "Search",
    kbd_focus:        "to focus search",
    kbd_filter:       "to filter",
    working:          "Working",
    progress_start:   "Starting search",
    progress_plan:    (plan) => `Built ${plan.length} research tracks`,
    progress_cache:   "Checking cache",
    progress_cache_hit:"Using cached result",
    progress_providers:(providers, purpose) => `${purpose ? purpose + ": " : ""}searching ${providers.join(", ")}`,
    progress_provider_start:(provider, purpose) => `${purpose ? purpose + ": " : ""}calling ${provider}`,
    progress_provider_done:(provider, purpose) => `${purpose ? purpose + ": " : ""}${provider} returned results`,
    progress_provider_error:(provider, purpose) => `${purpose ? purpose + ": " : ""}${provider} failed, continuing`,
    progress_merge:   "Merging and deduplicating sources",
    progress_synthesis:"Writing research report with Workers AI",
    progress_synthesis_done:"Research report ready",
    progress_fast_synthesis:"Writing quick answer with Workers AI",
    progress_fast_synthesis_done:"Quick answer ready",
    progress_complete:"Done",

    /* mode / freshness / scope */
    mode: {
      fast: "Fast", balanced: "Balanced", fresh: "Fresh", research: "Research",
    },
    fresh: {
      any: "Any", day: "Day", week: "Week", month: "Month",
    },
    scope: {
      web: "Web", news: "News", docs: "Docs", social: "Social",
    },
    mode_blurb: {
      fast:     "Single best provider. Lowest latency.",
      balanced: "Web + answer fusion across providers.",
      fresh:    "Prioritises sources from the last 24–72h.",
      research: "Deeper crawl, more sources, slower.",
    },
    fresh_label: {
      any: "mixed", day: "<24h", week: "<7d", month: "<30d",
      live: "live", cache: "cache", none: "none",
    },

    /* answer / sources */
    answer:           "Answer",
    cached:           "Cached",
    live:             "Live",
    providers_count:  (n) => `${n} providers`,
    sources:          "Sources",
    hidden_count:     (n) => `${n} hidden`,
    restore_hidden:   "Restore hidden",
    all_ignored:      "All sources ignored.",
    restore:          "Restore",
    open:             "Open",
    save:             "Save",
    saved:            "Saved",
    ignore:           "Ignore",
    score_title:      "Relevance score",
    copy:             "Copy",
    copied:           "Copied",
    auth_title:       "Access token required",
    auth_body:        "This Search Hub is protected. Enter the site token to use search APIs.",
    auth_placeholder: "Search Hub token",
    auth_submit:      "Unlock",

    /* sidebar */
    recent:           "Recent",
    no_history:       "No history yet",
    delete_history:   "Delete history item",
    library:          "Library",
    saved_lbl:        "Saved",
    ignored_lbl:      "Ignored",
    providers:        "Providers",

    /* empty */
    empty_title:      "Ask anything.",
    empty_sub:        "Search Hub routes your query across multiple providers, fuses the answer, and shows you exactly where every fact came from.",
    try_label:        "Try",
    suggestions: [
      "post-quantum TLS rollout 2026",
      "Vision Pro 2 announcement rumors",
      "duckdb vs clickhouse for OLAP",
      "EU AI Act enforcement timeline",
      "best small espresso machine 2026",
    ],

    /* errors */
    err_title:        "Search failed",
    retry:            "Retry",
    stale_label:      "Showing previous results",

    /* provider sheet */
    sheet_title:      "Providers",
    sheet_sub:        "Keys are managed by the backend.",
    cap_missing:      (key) => `Missing ${key}`,
    enabled:          "Enabled",
    disabled:         "Disabled",
    refresh:          "Refresh status",
    refreshing:       "Refreshing…",

    /* toasts */
    toast_saved:      "Saved to library",
    toast_save_fail:  "Save failed",
    toast_ignored:    "Ignored — hidden from results",
    toast_ignore_fail:"Ignore failed",
    toast_copied:     "Copied answer",
    toast_copy_fail:  "Copy failed",

    /* misc */
    cache_label:      "cached",
    timeago: (n, unit) => {
      const u = { s: "s", m: "m", h: "h", d: "d" }[unit];
      return `${n}${u} ago`;
    },
  },

  zh: {
    /* shell */
    brand_sub:        "多源聚合 · v0.4",
    crumb:            "搜索",
    providers_on:     (n) => `${n} 个可用`,
    providers_miss:   (n) => `${n} 缺密钥`,

    /* search form */
    placeholder:      "搜索网页、新闻、文档、社交…",
    placeholder_compact: "搜索…",
    filters:          "筛选",
    time:             "时间",
    source:           "来源",
    include_domains:  "包含域名",
    exclude_domains:  "排除域名",
    max_results:      "结果数",
    less:             "减少",
    more:             "增加",
    clear:            "清空",
    submit:           "搜索",
    kbd_focus:        "聚焦搜索框",
    kbd_filter:       "切换筛选",
    working:          "正在处理",
    progress_start:   "开始搜索",
    progress_plan:    (plan) => `已生成 ${plan.length} 条研究线`,
    progress_cache:   "检查缓存",
    progress_cache_hit:"命中缓存，正在读取",
    progress_providers:(providers, purpose) => `${purpose ? purpose + "：" : ""}正在搜索 ${providers.join("、")}`,
    progress_provider_start:(provider, purpose) => `${purpose ? purpose + "：" : ""}正在调用 ${provider}`,
    progress_provider_done:(provider, purpose) => `${purpose ? purpose + "：" : ""}${provider} 已返回结果`,
    progress_provider_error:(provider, purpose) => `${purpose ? purpose + "：" : ""}${provider} 失败，继续处理`,
    progress_merge:   "合并并去重来源",
    progress_synthesis:"Workers AI 正在撰写深度报告",
    progress_synthesis_done:"深度报告已生成",
    progress_fast_synthesis:"Workers AI 正在整理快速答案",
    progress_fast_synthesis_done:"快速答案已生成",
    progress_complete:"完成",

    /* mode / freshness / scope */
    mode: {
      fast: "快速", balanced: "均衡", fresh: "最新", research: "深度",
    },
    fresh: {
      any: "不限", day: "一天", week: "一周", month: "一月",
    },
    scope: {
      web: "网页", news: "新闻", docs: "文档", social: "社交",
    },
    mode_blurb: {
      fast:     "单一最优 provider，最低延迟。",
      balanced: "多源融合，平衡速度与召回。",
      fresh:    "优先 24–72 小时内的来源。",
      research: "更深的抓取与更多来源，速度较慢。",
    },
    fresh_label: {
      any: "混合", day: "<24小时", week: "<7天", month: "<30天",
      live: "实时", cache: "缓存", none: "无",
    },

    /* answer / sources */
    answer:           "答案",
    cached:           "缓存",
    live:             "实时",
    providers_count:  (n) => `${n} 个来源`,
    sources:          "来源",
    hidden_count:     (n) => `已隐藏 ${n}`,
    restore_hidden:   "恢复已隐藏",
    all_ignored:      "所有来源已被忽略。",
    restore:          "恢复",
    open:             "打开",
    save:             "收藏",
    saved:            "已收藏",
    ignore:           "忽略",
    score_title:      "相关度",
    copy:             "复制",
    copied:           "已复制",
    auth_title:       "需要访问 token",
    auth_body:        "这个 Search Hub 已开启保护。输入站点 token 后才能调用搜索 API。",
    auth_placeholder: "Search Hub token",
    auth_submit:      "解锁",

    /* sidebar */
    recent:           "最近",
    no_history:       "暂无搜索记录",
    delete_history:   "删除这条搜索记录",
    library:          "库",
    saved_lbl:        "收藏",
    ignored_lbl:      "忽略",
    providers:        "Provider 状态",

    /* empty */
    empty_title:      "随便问。",
    empty_sub:        "Search Hub 会把你的 query 路由到多个 provider，融合答案，并清晰标注每条事实的来源。",
    try_label:        "试试",
    suggestions: [
      "后量子 TLS 2026 部署进展",
      "Vision Pro 2 最新爆料",
      "DuckDB 与 ClickHouse 对比",
      "欧盟 AI 法案执行时间线",
      "2026 家用小型意式咖啡机",
    ],

    /* errors */
    err_title:        "搜索失败",
    retry:            "重试",
    stale_label:      "显示上一次结果",

    /* provider sheet */
    sheet_title:      "Provider 状态",
    sheet_sub:        "API 密钥由后端环境变量管理。",
    cap_missing:      (key) => `缺少 ${key}`,
    enabled:          "已启用",
    disabled:         "未启用",
    refresh:          "刷新状态",
    refreshing:       "刷新中…",

    /* toasts */
    toast_saved:      "已加入收藏",
    toast_save_fail:  "收藏失败",
    toast_ignored:    "已隐藏该来源",
    toast_ignore_fail:"忽略失败",
    toast_copied:     "已复制答案",
    toast_copy_fail:  "复制失败",

    /* misc */
    cache_label:      "缓存",
    timeago: (n, unit) => {
      const u = { s: "秒前", m: "分钟前", h: "小时前", d: "天前" };
      return `${n} ${u[unit]}`;
    },
  },
};

window.I18N = I18N;
