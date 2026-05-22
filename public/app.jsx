/* global React, ReactDOM */
/* global SearchHubAPI, Icon, Segmented, ProviderBadge, Hairline, IconButton */
/* global PROVIDER_LABEL, timeAgo, hostOf, cls, useTweaks, TweaksPanel,
   TweakSection, TweakRadio, TweakToggle, TweakSelect, I18N */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Build segmented-control option lists from a localised label dict
// like { fast: "快速", balanced: "均衡", ... }
const buildOpts = (dict) =>
  Object.entries(dict).map(([value, label]) => ({ value, label }));

/* -------------------------------------------------------------------------- */
/*  Search form — header bar shared between empty + result states.            */
/* -------------------------------------------------------------------------- */
function SearchForm({
  query, setQuery,
  mode, setMode,
  freshness, setFreshness,
  scope, setScope,
  domains, setDomains,
  excludeDomains, setExcludeDomains,
  maxResults, setMaxResults,
  onSubmit, loading,
  filtersOpen, setFiltersOpen,
  compact, t,
}) {
  const inputRef = useRef(null);
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const MODE_OPTS      = useMemo(() => buildOpts(t.mode),  [t]);
  const FRESHNESS_OPTS = useMemo(() => buildOpts(t.fresh), [t]);
  const SCOPE_OPTS     = useMemo(() => buildOpts(t.scope), [t]);

  return (
    <form
      className={"sform" + (compact ? " is-compact" : "")}
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      <div className="sform-input-wrap">
        <Icon name="search" size={18} style={{ opacity: 0.5 }} />
        <input
          ref={inputRef}
          className="sform-input"
          type="text"
          placeholder={compact ? t.placeholder_compact : t.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={!compact}
          spellCheck={false}
          autoComplete="off"
        />
        {query && !loading && (
          <button
            type="button"
            className="sform-clear"
            onClick={() => setQuery("")}
            aria-label={t.clear}
          ><Icon name="close" size={14} /></button>
        )}
        <kbd className="kbd">⌘K</kbd>
        <button
          type="submit"
          className="sform-go"
          disabled={loading || !query.trim()}
          aria-label={t.submit}
        >
          {loading
            ? <span className="spinner" aria-hidden="true" />
            : <Icon name="arrow" size={16} />}
        </button>
      </div>

      <div className="sform-row">
        <Segmented options={MODE_OPTS} value={mode} onChange={setMode} ariaLabel="Mode" />
        <button
          type="button"
          className={"flt-btn" + (filtersOpen ? " is-on" : "")}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Icon name="filter" size={14} />
          <span>{t.filters}</span>
          <span className="flt-chev" data-open={filtersOpen}>
            <Icon name="chevron" size={12} />
          </span>
        </button>
      </div>

      {filtersOpen && (
        <div className="sform-filters">
          <div className="flt-row">
            <label className="flt-label">{t.time}</label>
            <Segmented options={FRESHNESS_OPTS} value={freshness} onChange={setFreshness} ariaLabel={t.time} />
          </div>
          <Hairline />
          <div className="flt-row">
            <label className="flt-label">{t.source}</label>
            <Segmented options={SCOPE_OPTS} value={scope} onChange={setScope} ariaLabel={t.source} />
          </div>
          <Hairline />
          <div className="flt-row flt-row--grid">
            <label className="flt-label">{t.include_domains}</label>
            <input
              className="flt-input"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="apple.com, arxiv.org"
              spellCheck={false}
            />
          </div>
          <Hairline />
          <div className="flt-row flt-row--grid">
            <label className="flt-label">{t.exclude_domains}</label>
            <input
              className="flt-input"
              value={excludeDomains}
              onChange={(e) => setExcludeDomains(e.target.value)}
              placeholder="pinterest.com"
              spellCheck={false}
            />
          </div>
          <Hairline />
          <div className="flt-row">
            <label className="flt-label">{t.max_results}</label>
            <div className="flt-stepper">
              <button type="button" onClick={() => setMaxResults(Math.max(3, maxResults - 1))} aria-label={t.less}>−</button>
              <span>{maxResults}</span>
              <button type="button" onClick={() => setMaxResults(Math.min(20, maxResults + 1))} aria-label={t.more}>+</button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Answer card — shown above the source list                                 */
/* -------------------------------------------------------------------------- */
function AnswerCard({ response, onCopy, copied, t }) {
  if (!response) return null;
  const { answer, cached, notes } = response;
  const usedCount = notes?.providers_used?.length || 0;
  const freshLabel = t.fresh_label[notes?.freshness] || notes?.freshness || "—";
  return (
    <section className="answer-card" aria-label={t.answer}>
      <header className="answer-head">
        <div className="answer-head-left">
          <Icon name="spark" size={16} />
          <span className="answer-head-title">{t.answer}</span>
        </div>
        <div className="answer-head-right">
          <button type="button" className="answer-copy" onClick={() => onCopy(answer)}>
            <Icon name={copied ? "check" : "copy"} size={13} />
            <span>{copied ? t.copied : t.copy}</span>
          </button>
          {cached
            ? <span className="meta-chip"><Icon name="dot" size={8} /> {t.cached}</span>
            : <span className="meta-chip"><Icon name="dot" size={8} /> {t.live}</span>}
          <span className="meta-chip"><Icon name="clock" size={12} /> {freshLabel}</span>
          <span className="meta-chip">{t.providers_count(usedCount)}</span>
        </div>
      </header>
      <div className="answer-body">{renderAnswerMarkdown(answer)}</div>
      {notes?.providers_used?.length > 0 && (
        <div className="answer-providers">
          {notes.providers_used.map((p) => <ProviderBadge key={p} id={p} dim />)}
        </div>
      )}
      {notes?.warnings?.length > 0 && (
        <div className="answer-warn">
          {notes.warnings.map((w, i) => (
            <div key={i} className="answer-warn-item">
              <Icon name="hide" size={12} /> {w}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function renderAnswerMarkdown(text) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/:\s+-\s+\*\*/g, ":\n\n- **")
    .replace(/((?:\[|【)[0-9,\s-]+(?:\]|】))\s+-\s+\*\*/g, "$1\n- **")
    .replace(/\.\s+\*\*Bottom line:\*\*/g, ".\n\n**Bottom line:**")
    .trim();
  if (!normalized) return null;

  const lines = normalized.split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "p", text: paragraph.join(" ").trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "ul", items: list });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: heading[2] });
      continue;
    }
    const bullet = line.match(/^[-•]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return blocks.map((block, index) => {
    if (block.type === "h2") {
      return <h3 key={index} className="answer-section-title">{renderInlineMarkdown(block.text)}</h3>;
    }
    if (block.type === "ul") {
      return (
        <ul key={index} className="answer-list">
          {block.items.map((item, i) => <li key={i}>{renderInlineMarkdown(item)}</li>)}
        </ul>
      );
    }
    return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
  });
}

function renderInlineMarkdown(text) {
  return String(text).split(/(\*\*[^*]+\*\*|(?:\[|【)[0-9,\s-]+(?:\]|】))/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (/^(?:\[|【)[0-9,\s-]+(?:\]|】)$/.test(part)) {
      return <span key={index} className="citation">{part.replace(/^【/, "[").replace(/】$/, "]")}</span>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function formatProgress(event, t) {
  const provider = event?.provider ? String(event.provider) : "";
  const providerName = provider ? (PROVIDER_LABEL[provider] || provider) : "";
  switch (event?.type) {
    case "plan_ready": return t.progress_plan(event.plan || []);
    case "cache_check": return t.progress_cache;
    case "cache_hit": return t.progress_cache_hit;
    case "providers_selected": return t.progress_providers(event.providers || [], event.purpose);
    case "provider_start": return t.progress_provider_start(providerName, event.purpose);
    case "provider_done": return t.progress_provider_done(providerName, event.purpose);
    case "provider_error": return t.progress_provider_error(providerName, event.purpose);
    case "merge_start": return t.progress_merge;
    case "synthesis_start": return t.progress_synthesis;
    case "synthesis_done": return t.progress_synthesis_done;
    case "complete": return t.progress_complete;
    default: return event?.message || t.progress_start;
  }
}

const LOCAL_HISTORY_KEY = "search-hub:history:v1";
const LOCAL_DELETED_HISTORY_KEY = "search-hub:history-deleted:v1";
const LOCAL_SAVED_KEY = "search-hub:saved:v1";
const LOCAL_HIDDEN_KEY = "search-hub:hidden:v1";

function readJsonLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function historyKey(item) {
  return `${item?.query || ""}|${item?.mode || ""}|${item?.created_at || ""}`;
}

function mergeHistory(localItems, remoteItems, deletedKeys = new Set()) {
  const seen = new Set();
  const out = [];
  for (const item of [...localItems, ...remoteItems]) {
    if (!item?.query) continue;
    const key = historyKey(item);
    if (deletedKeys.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 50);
}

/* -------------------------------------------------------------------------- */
/*  Source row                                                                */
/* -------------------------------------------------------------------------- */
function SourceRow({ index, source, saved, onSave, onIgnore, t }) {
  const host = hostOf(source.url);
  return (
    <article className="src">
      <div className="src-rank">{String(index + 1).padStart(2, "0")}</div>
      <div className="src-body">
        <div className="src-meta-top">
          <span className="src-host">{host}</span>
          <ProviderBadge id={source.provider} dim />
          {source.published_at && (
            <span className="src-time"><Icon name="clock" size={11} /> {timeAgo(source.published_at, t.timeago)}</span>
          )}
          {source.provider === "cache" && (
            <span className="src-time">{t.cache_label}</span>
          )}
          <span className="src-score" title={t.score_title}>
            {Math.round(source.score * 100)}
          </span>
        </div>
        <a className="src-title" href={source.url} target="_blank" rel="noopener noreferrer">
          {source.title}
        </a>
        <p className="src-snippet">{source.snippet}</p>
        <div className="src-actions">
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="act">
            <Icon name="ext" size={14} /> {t.open}
          </a>
          <button type="button" className={"act" + (saved ? " is-on" : "")} onClick={onSave}>
            <Icon name={saved ? "bookmark-fill" : "bookmark"} size={14} />
            {saved ? t.saved : t.save}
          </button>
          <button type="button" className="act act--ghost" onClick={onIgnore}>
            <Icon name="hide" size={14} /> {t.ignore}
          </button>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar — history + provider summary                                      */
/* -------------------------------------------------------------------------- */
function Sidebar({
  open, onClose, history, providers,
  activeQuery, onPickHistory, onDeleteHistory, savedCount, ignoredCount,
  onOpenProviders, t,
}) {
  const enabled = providers.filter((p) => p.enabled).length;
  const missing  = providers.filter((p) => !p.enabled).length;
  return (
    <aside className={"sidebar" + (open ? " is-open" : "")}>
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <div className="brand-text">
            <div className="brand-name">Search Hub</div>
            <div className="brand-sub">{t.brand_sub}</div>
          </div>
        </div>
        <button className="sidebar-x" onClick={onClose} aria-label={t.clear}>
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span>{t.recent}</span>
          <span className="muted">{history.length}</span>
        </div>
        <ul className="hist">
          {history.length === 0 && (
            <li className="hist-empty">{t.no_history}</li>
          )}
          {history.map((h, i) => (
            <li key={historyKey(h)} className="hist-row">
              <button
                className={"hist-item" + (h.query === activeQuery ? " is-active" : "")}
                onClick={() => onPickHistory(h)}
              >
                <div className="hist-q" title={h.query}>{h.query}</div>
                <div className="hist-meta">
                  <span className="hist-mode">{t.mode[h.mode] || h.mode}</span>
                  <span className="hist-dot">·</span>
                  <span>{h.cached ? t.cached.toLowerCase() : t.live.toLowerCase()}</span>
                  <span className="hist-dot">·</span>
                  <span>{timeAgo(h.created_at, t.timeago)}</span>
                </div>
              </button>
              <button
                type="button"
                className="hist-delete"
                onClick={() => onDeleteHistory(h)}
                aria-label={t.delete_history}
                title={t.delete_history}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span>{t.library}</span>
        </div>
        <div className="lib">
          <div className="lib-row">
            <Icon name="bookmark" size={14} />
            <span>{t.saved_lbl}</span>
            <span className="lib-num">{savedCount}</span>
          </div>
          <div className="lib-row">
            <Icon name="hide" size={14} />
            <span>{t.ignored_lbl}</span>
            <span className="lib-num">{ignoredCount}</span>
          </div>
        </div>
      </div>

      <div className="sidebar-foot">
        <button className="prov-summary" onClick={onOpenProviders}>
          <div className="prov-summary-left">
            <Icon name="plug" size={14} />
            <span>{t.providers}</span>
          </div>
          <div className="prov-summary-right">
            <span className="prov-stat prov-stat--on">{enabled}</span>
            {missing > 0 && <span className="prov-stat prov-stat--off">{missing}</span>}
            <Icon name="chevron" size={12} />
          </div>
        </button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Provider drawer — modal sheet                                             */
/* -------------------------------------------------------------------------- */
function ProviderSheet({ open, onClose, providers, onRefresh, loading, t }) {
  if (!open) return null;
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.sheet_title}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{t.sheet_title}</div>
            <div className="sheet-sub">{t.sheet_sub}</div>
          </div>
          <button className="sheet-x" onClick={onClose} aria-label={t.clear}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <ul className="prov-list">
          {providers.map((p) => (
            <li key={p.id} className={"prov-item" + (p.enabled ? "" : " is-off")}>
              <div className="prov-item-left">
                <span className="prov-led" data-on={p.enabled} />
                <div>
                  <div className="prov-name">{PROVIDER_LABEL[p.id] || p.id}</div>
                  <div className="prov-caps">
                    {p.enabled
                      ? (p.capabilities || []).map((c) => (
                          <span key={c} className="cap">{c}</span>
                        ))
                      : <span className="cap cap--miss">{t.cap_missing(p.missing)}</span>}
                  </div>
                </div>
              </div>
              <div className="prov-item-right">
                {p.enabled
                  ? <span className="prov-state">{t.enabled}</span>
                  : <span className="prov-state prov-state--off">{t.disabled}</span>}
              </div>
            </li>
          ))}
        </ul>
        <div className="sheet-foot">
          <button className="sheet-btn" onClick={onRefresh} disabled={loading}>
            {loading ? t.refreshing : t.refresh}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton + Empty + Error                                                  */
/* -------------------------------------------------------------------------- */
function ResultSkeleton({ rows = 4 }) {
  return (
    <div className="skel-wrap">
      <div className="skel skel-answer">
        <div className="skel-bar" style={{ width: "30%", height: 14 }} />
        <div className="skel-bar" style={{ width: "100%" }} />
        <div className="skel-bar" style={{ width: "92%" }} />
        <div className="skel-bar" style={{ width: "78%" }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel skel-row">
          <div className="skel-bar" style={{ width: "22%", height: 10 }} />
          <div className="skel-bar" style={{ width: "80%", height: 16 }} />
          <div className="skel-bar" style={{ width: "100%" }} />
          <div className="skel-bar" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

function ProgressLine({ detail, t }) {
  if (!detail) return null;
  return (
    <div className="progress-line" role="status">
      <span className="spinner spinner--dark" aria-hidden="true" />
      <span>{t.working}: {detail}</span>
    </div>
  );
}

function EmptyState({ onPick, t }) {
  return (
    <div className="empty">
      <div className="empty-glyph" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <h2 className="empty-title">{t.empty_title}</h2>
      <p className="empty-sub">{t.empty_sub}</p>
      <div className="empty-suggest">
        <div className="empty-suggest-label">{t.try_label}</div>
        <div className="empty-suggest-list">
          {t.suggestions.map((s) => (
            <button key={s} className="sugg" onClick={() => onPick(s)}>
              {s}
              <Icon name="arrow" size={12} />
            </button>
          ))}
        </div>
      </div>
      <div className="empty-tip">
        <kbd className="kbd">⌘K</kbd> {t.kbd_focus}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry, t }) {
  return (
    <div className="err">
      <div className="err-left">
        <span className="err-led" />
        <div>
          <div className="err-title">{t.err_title}</div>
          <div className="err-sub">{message}</div>
        </div>
      </div>
      <button className="err-retry" onClick={onRetry}>{t.retry}</button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toasts                                                                    */
/* -------------------------------------------------------------------------- */
function ToastStack({ items, onDismiss }) {
  return (
    <div className="toasts">
      {items.map((tt) => (
        <div key={tt.id} className="toast" role="status">
          <Icon name={tt.icon || "check"} size={14} />
          <span>{tt.text}</span>
          <button className="toast-x" onClick={() => onDismiss(tt.id)} aria-label="×">
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */
function App() {
  // ---------- tweaks
  const [tw, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "theme":    "light",
    "density":  "comfortable",
    "sidebar":  "open",
    "accent":   "graphite",
    "language": "zh"
  }/*EDITMODE-END*/);

  // When embedded inside another page (e.g. the iPhone preview), allow
  // theme + language to come in via URL hash: #theme=dark;lang=zh
  // Also collapses the sidebar on tiny viewports automatically.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const params = Object.fromEntries(
      hash.split(";").map((kv) => kv.split("=").map(decodeURIComponent))
    );
    const edits = {};
    if (params.theme && params.theme !== tw.theme)       edits.theme = params.theme;
    if (params.lang  && params.lang  !== tw.language)    edits.language = params.lang;
    if (Object.keys(edits).length) setTweak(edits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmbedded = useMemo(() =>
    new URLSearchParams(window.location.search).get("embed") === "1"
    || window.matchMedia("(max-width: 480px)").matches,
  []);

  const t = I18N[tw.language] || I18N.en;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme",   tw.theme);
    root.setAttribute("data-density", tw.density);
    root.setAttribute("data-accent",  tw.accent);
    root.lang = tw.language === "zh" ? "zh-CN" : "en";
    if (isEmbedded) root.setAttribute("data-embed", "1");
  }, [tw.theme, tw.density, tw.accent, tw.language, isEmbedded]);

  // ---------- search state
  const [query, setQuery]                     = useState("post-quantum TLS rollout 2026");
  const [mode, setMode]                       = useState("balanced");
  const [freshness, setFreshness]             = useState("any");
  const [scope, setScope]                     = useState("web");
  const [domains, setDomains]                 = useState("");
  const [excludeDomains, setExcludeDomains]   = useState("");
  const [maxResults, setMaxResults]           = useState(10);
  const [filtersOpen, setFiltersOpen]         = useState(false);

  const [status, setStatus]                   = useState("idle");
  const [loadingDetail, setLoadingDetail]     = useState("");
  const [response, setResponse]               = useState(null);
  const [lastQuery, setLastQuery]             = useState("");
  const [error, setError]                     = useState(null);

  const [hidden, setHidden]                   = useState(() => new Set(readJsonLocal(LOCAL_HIDDEN_KEY, [])));
  const [saved, setSaved]                     = useState(() => new Set(readJsonLocal(LOCAL_SAVED_KEY, [])));

  // ---------- sidebar + sheet
  const [sidebarOpen, setSidebarOpen]         = useState(!isEmbedded);
  useEffect(() => {
    if (isEmbedded) return;            // embedded/mobile: ignore tweak default
    setSidebarOpen(tw.sidebar !== "closed");
  }, [tw.sidebar, isEmbedded]);
  const [providerSheet, setProviderSheet]     = useState(false);

  // ---------- providers + history
  const [providers, setProviders]             = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [history, setHistory]                 = useState(() => readJsonLocal(LOCAL_HISTORY_KEY, []));
  const [deletedHistory, setDeletedHistory]   = useState(() => new Set(readJsonLocal(LOCAL_DELETED_HISTORY_KEY, [])));

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const r = await SearchHubAPI.getProviders();
      setProviders(r.providers || []);
    } catch (e) { console.error(e); }
    finally { setProvidersLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await SearchHubAPI.getHistory();
      setHistory((local) => mergeHistory(local, r.items || [], deletedHistory));
    } catch (e) { console.error(e); }
  }, [deletedHistory]);

  useEffect(() => { loadProviders(); loadHistory(); }, [loadProviders, loadHistory]);
  useEffect(() => { writeJsonLocal(LOCAL_HISTORY_KEY, history); }, [history]);
  useEffect(() => { writeJsonLocal(LOCAL_DELETED_HISTORY_KEY, Array.from(deletedHistory)); }, [deletedHistory]);
  useEffect(() => { writeJsonLocal(LOCAL_SAVED_KEY, Array.from(saved)); }, [saved]);
  useEffect(() => { writeJsonLocal(LOCAL_HIDDEN_KEY, Array.from(hidden)); }, [hidden]);

  // ---------- toasts
  const [toasts, setToasts] = useState([]);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const pushToast = useCallback((text, icon = "check") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((xs) => [...xs, { id, text, icon }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 2400);
  }, []);
  const dismissToast = (id) => setToasts((xs) => xs.filter((x) => x.id !== id));

  const copyAnswer = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      setCopiedAnswer(true);
      pushToast(t.toast_copied, "copy");
      setTimeout(() => setCopiedAnswer(false), 1600);
    } catch (e) {
      pushToast(t.toast_copy_fail, "close");
    }
  }, [pushToast, t]);

  // ---------- actions
  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setStatus("loading"); setError(null);
    setLoadingDetail(t.progress_start);
    try {
      const body = {
        query: query.trim(),
        mode, freshness, source_scope: scope,
        domains: domains.split(",").map(s => s.trim()).filter(Boolean),
        exclude_domains: excludeDomains.split(",").map(s => s.trim()).filter(Boolean),
        max_results: maxResults,
      };
      const r = await SearchHubAPI.searchStream(body, (event) => {
        setLoadingDetail(formatProgress(event, t));
      });
      setResponse(r);
      setLastQuery(query.trim());
      setStatus("success");
      setHidden(new Set());
      setHistory((h) => mergeHistory([{
        query: query.trim(), mode, cached: r.cached,
        created_at: new Date().toISOString(),
      }], h, deletedHistory));
    } catch (e) {
      setError(e.message || "Unknown error");
      setStatus("error");
    } finally {
      setLoadingDetail("");
    }
  }, [query, mode, freshness, scope, domains, excludeDomains, maxResults, t, deletedHistory]);

  const handleSave = useCallback(async (src) => {
    setSaved((s) => new Set(s).add(src.url));
    try {
      await SearchHubAPI.remember({
        url: src.url, title: src.title, snippet: src.snippet,
        query: lastQuery || query.trim(),
        reason: "user_saved", tags: [mode],
        fetch_content: true,
      });
      pushToast(t.toast_saved, "bookmark-fill");
    } catch (e) {
      pushToast(t.toast_save_fail, "close");
    }
  }, [lastQuery, mode, pushToast, query, t]);

  const handleIgnore = useCallback(async (src) => {
    setHidden((s) => new Set(s).add(src.url));
    try {
      await SearchHubAPI.ignore({ url: src.url, reason: "low_quality" });
      pushToast(t.toast_ignored, "hide");
    } catch (e) {
      pushToast(t.toast_ignore_fail, "close");
    }
  }, [pushToast, t]);

  const handlePickHistory = useCallback((h) => {
    setQuery(h.query);
    setMode(h.mode);
    setTimeout(() => { document.querySelector(".sform-go")?.click(); }, 0);
  }, []);

  const handleDeleteHistory = useCallback((item) => {
    const key = historyKey(item);
    setDeletedHistory((items) => new Set(items).add(key));
    setHistory((items) => items.filter((h) => historyKey(h) !== key));
  }, []);

  const visibleSources = useMemo(() => {
    if (!response) return [];
    return response.sources.filter((s) => !hidden.has(s.url));
  }, [response, hidden]);

  const enabledProviders = providers.filter((p) => p.enabled).length;
  const missingProviders = providers.filter((p) => !p.enabled);

  return (
    <div className={cls("app", sidebarOpen && "with-sidebar")}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        history={history}
        providers={providers}
        activeQuery={lastQuery}
        onPickHistory={handlePickHistory}
        onDeleteHistory={handleDeleteHistory}
        savedCount={saved.size}
        ignoredCount={hidden.size}
        onOpenProviders={() => setProviderSheet(true)}
        t={t}
      />
      {sidebarOpen && (
        <div
          className="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarOpen && (
              <IconButton icon="menu" label="Open sidebar" onClick={() => setSidebarOpen(true)} />
            )}
            <div className="topbar-crumb">
              <span className="muted">{t.crumb}</span>
              {lastQuery && <span className="muted">/</span>}
              {lastQuery && <span className="topbar-q">{lastQuery}</span>}
            </div>
          </div>
          <div className="topbar-right">
            <div className="quick-switch" aria-label="Language and theme">
              <button
                type="button"
                className={tw.language === "en" ? "is-on" : ""}
                onClick={() => setTweak("language", "en")}
              >EN</button>
              <button
                type="button"
                className={tw.language === "zh" ? "is-on" : ""}
                onClick={() => setTweak("language", "zh")}
              >中文</button>
              <span />
              <button
                type="button"
                className={tw.theme === "light" ? "is-on" : ""}
                onClick={() => setTweak("theme", "light")}
              >Light</button>
              <button
                type="button"
                className={tw.theme === "dark" ? "is-on" : ""}
                onClick={() => setTweak("theme", "dark")}
              >Dark</button>
            </div>
            <button className="prov-pill" onClick={() => setProviderSheet(true)}>
              <Icon name="plug" size={14} />
              <span>{t.providers_on(enabledProviders)}</span>
              {missingProviders.length > 0 && (
                <span className="prov-pill-miss">{t.providers_miss(missingProviders.length)}</span>
              )}
            </button>
          </div>
        </header>

        <div className="page">
          <div className="page-inner">
            <SearchForm
              query={query} setQuery={setQuery}
              mode={mode} setMode={setMode}
              freshness={freshness} setFreshness={setFreshness}
              scope={scope} setScope={setScope}
              domains={domains} setDomains={setDomains}
              excludeDomains={excludeDomains} setExcludeDomains={setExcludeDomains}
              maxResults={maxResults} setMaxResults={setMaxResults}
              onSubmit={runSearch}
              loading={status === "loading"}
              filtersOpen={filtersOpen}
              setFiltersOpen={setFiltersOpen}
              compact={status === "success" || status === "loading"}
              t={t}
            />

            <div className="mode-blurb">{t.mode_blurb[mode]}</div>

            {status === "idle" && !response && (
              <EmptyState t={t} onPick={(s) => { setQuery(s); setTimeout(() => document.querySelector(".sform-go")?.click(), 0); }} />
            )}

            {status === "loading" && (
              <>
                <ProgressLine detail={loadingDetail} t={t} />
                <ResultSkeleton rows={4} />
              </>
            )}

            {status === "error" && (
              <>
                <ErrorBanner message={error} onRetry={runSearch} t={t} />
                {response && (
                  <div className="stale">
                    <div className="stale-label">{t.stale_label}</div>
                    <AnswerCard response={response} onCopy={copyAnswer} copied={copiedAnswer} t={t} />
                  </div>
                )}
              </>
            )}

            {(status === "success" || (status === "idle" && response)) && response && (
              <>
                <AnswerCard response={response} onCopy={copyAnswer} copied={copiedAnswer} t={t} />

                <div className="src-list-head">
                  <div className="src-list-head-left">
                    <Icon name="stack" size={14} />
                    <span>{t.sources}</span>
                    <span className="muted">
                      {visibleSources.length}
                      {hidden.size > 0 && <> · {t.hidden_count(hidden.size)}</>}
                    </span>
                  </div>
                  {hidden.size > 0 && (
                    <button className="link-btn" onClick={() => setHidden(new Set())}>
                      {t.restore_hidden}
                    </button>
                  )}
                </div>

                <div className="src-list">
                  {visibleSources.length === 0 && (
                    <div className="src-empty">{t.all_ignored} <button className="link-btn" onClick={() => setHidden(new Set())}>{t.restore}</button></div>
                  )}
                  {visibleSources.map((src, i) => (
                    <SourceRow
                      key={src.url}
                      index={i}
                      source={src}
                      saved={saved.has(src.url)}
                      onSave={() => handleSave(src)}
                      onIgnore={() => handleIgnore(src)}
                      t={t}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <ProviderSheet
        open={providerSheet}
        onClose={() => setProviderSheet(false)}
        providers={providers}
        onRefresh={loadProviders}
        loading={providersLoading}
        t={t}
      />

      <ToastStack items={toasts} onDismiss={dismissToast} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Language / 语言">
          <TweakRadio
            label="Language"
            value={tw.language}
            onChange={(v) => setTweak("language", v)}
            options={[
              { value: "en", label: "EN" },
              { value: "zh", label: "中文" },
            ]}
          />
        </TweakSection>
        <TweakSection label="Theme">
          <TweakRadio
            label="Mode"
            value={tw.theme}
            onChange={(v) => setTweak("theme", v)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark",  label: "Dark" },
            ]}
          />
          <TweakRadio
            label="Accent"
            value={tw.accent}
            onChange={(v) => setTweak("accent", v)}
            options={[
              { value: "graphite", label: "Graphite" },
              { value: "ink",      label: "Ink" },
              { value: "warm",     label: "Warm" },
            ]}
          />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio
            label="Density"
            value={tw.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "comfortable", label: "Roomy" },
              { value: "compact",     label: "Dense" },
            ]}
          />
          <TweakRadio
            label="Sidebar"
            value={tw.sidebar}
            onChange={(v) => setTweak("sidebar", v)}
            options={[
              { value: "open",   label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
