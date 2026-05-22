/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* -------------------------------------------------------------------------- */
/*  Icons — minimal SF-Symbol-ish line glyphs.                                */
/*  Always 20×20, currentColor, stroke 1.6 for an iOS feel.                   */
/* -------------------------------------------------------------------------- */
function Icon({ name, size = 20, stroke = 1.6, style }) {
  const props = {
    width: size, height: size, viewBox: "0 0 20 20",
    fill: "none", stroke: "currentColor",
    strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round",
    style
  };
  switch (name) {
    case "search":
      return <svg {...props}><circle cx="9" cy="9" r="5.2" /><path d="m13 13 4 4" /></svg>;
    case "command":
      return <svg {...props}><path d="M7 7h6v6H7zM7 7V5.5A1.5 1.5 0 1 0 5.5 7H7zm6 0h1.5A1.5 1.5 0 1 0 13 5.5V7zm0 6v1.5A1.5 1.5 0 1 0 14.5 13H13zm-6 0H5.5A1.5 1.5 0 1 0 7 14.5V13z" /></svg>;
    case "menu":
      return <svg {...props}><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></svg>;
    case "close":
      return <svg {...props}><path d="m5 5 10 10M15 5 5 15" /></svg>;
    case "arrow":
      return <svg {...props}><path d="M4 10h12m-4-4 4 4-4 4" /></svg>;
    case "ext":
      return <svg {...props}><path d="M8 5H5v10h10v-3M12 4h4v4M16 4l-7 7" /></svg>;
    case "bookmark":
      return <svg {...props}><path d="M5.5 4.5h9V17l-4.5-3-4.5 3z" /></svg>;
    case "bookmark-fill":
      return <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" style={style}><path d="M5.5 4.5h9V17l-4.5-3-4.5 3z" /></svg>;
    case "hide":
      return <svg {...props}><path d="M3 10s2.5-5 7-5 7 5 7 5-2.5 5-7 5a7.7 7.7 0 0 1-3.5-.9M3 3l14 14" /></svg>;
    case "clock":
      return <svg {...props}><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.5 1.5" /></svg>;
    case "globe":
      return <svg {...props}><circle cx="10" cy="10" r="6.5" /><path d="M3.5 10h13M10 3.5c2 2 2 11 0 13M10 3.5c-2 2-2 11 0 13" /></svg>;
    case "spark":
      return <svg {...props}><path d="M10 3v4M10 13v4M3 10h4M13 10h4M5 5l2.5 2.5M12.5 12.5 15 15M5 15l2.5-2.5M12.5 7.5 15 5" /></svg>;
    case "plug":
      return <svg {...props}><path d="M7 3v3M13 3v3M5.5 6h9v3a4.5 4.5 0 0 1-9 0V6zM10 13.5V17" /></svg>;
    case "filter":
      return <svg {...props}><path d="M3.5 5h13M6 10h8M8.5 15h3" /></svg>;
    case "chevron":
      return <svg {...props}><path d="m7 5 5 5-5 5" /></svg>;
    case "check":
      return <svg {...props}><path d="m4.5 10.5 3.5 3.5L16 6" /></svg>;
    case "copy":
      return <svg {...props}><rect x="7" y="6" width="9" height="10" rx="2" /><path d="M4 13V5a2 2 0 0 1 2-2h7" /></svg>;
    case "trash":
      return <svg {...props}><path d="M4 6h12M8 6V4.5h4V6M6.5 6l.5 10h6l.5-10M9 9v4M11 9v4" /></svg>;
    case "dot":
      return <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" style={style}><circle cx="10" cy="10" r="3" /></svg>;
    case "pin":
      return <svg {...props}><path d="M7 3h6l-1 5 3 3H5l3-3-1-5zM10 11v6" /></svg>;
    case "stack":
      return <svg {...props}><path d="m4 7 6-3 6 3-6 3-6-3zM4 11l6 3 6-3M4 14.5l6 3 6-3" /></svg>;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Segmented control — the iOS one. Pure CSS sliding pill.                   */
/* -------------------------------------------------------------------------- */
function Segmented({ options, value, onChange, ariaLabel }) {
  const containerRef = useRef(null);
  const btnRefs = useRef([]);
  const [thumb, setThumb] = useState({ left: 2, width: 0, ready: false });
  const i = Math.max(0, options.findIndex((o) => o.value === value));

  // Measure the actual selected button so the thumb stays glued to it,
  // even if labels are wildly different widths (EN "Research" vs 中文 "深度").
  React.useLayoutEffect(() => {
    const place = () => {
      const btn = btnRefs.current[i];
      const c = containerRef.current;
      if (!btn || !c) return;
      const cR = c.getBoundingClientRect();
      const bR = btn.getBoundingClientRect();
      setThumb({ left: bR.left - cR.left, width: bR.width, ready: true });
    };
    place();
    const ro = new ResizeObserver(place);
    if (containerRef.current) ro.observe(containerRef.current);
    btnRefs.current.forEach((b) => b && ro.observe(b));
    window.addEventListener("resize", place);
    return () => { ro.disconnect(); window.removeEventListener("resize", place); };
  }, [i, options.length, options.map((o) => o.label).join("|")]);

  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel} ref={containerRef}>
      <div
        className="seg-thumb"
        style={{
          left: thumb.left,
          width: thumb.width,
          transform: "none",
          opacity: thumb.ready ? 1 : 0,
        }}
      />
      {options.map((o, idx) =>
        <button
          key={o.value}
          ref={(el) => (btnRefs.current[idx] = el)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={"seg-opt" + (value === o.value ? " is-on" : "")}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Provider badge — small pill with a leading dot.                            */
/* -------------------------------------------------------------------------- */
const PROVIDER_LABEL = {
  grok: "Grok",
  sonar: "Sonar",
  brave: "Brave",
  tavily: "Tavily",
  anysearch: "AnySearch",
  cache: "Cache"
};

function ProviderBadge({ id, dim }) {
  return (
    <span className={"pbadge" + (dim ? " is-dim" : "")} data-provider={id}>
      <span className="pbadge-dot" />
      {PROVIDER_LABEL[id] || id}
    </span>);

}

/* -------------------------------------------------------------------------- */
/*  Hairline — iOS-style 0.5px divider on retina.                              */
/* -------------------------------------------------------------------------- */
function Hairline({ inset = 0, style }) {
  return <div className="hairline" style={{ marginLeft: inset, ...style }} />;
}

/* -------------------------------------------------------------------------- */
/*  IconButton — circular tap target, used in toolbars.                       */
/* -------------------------------------------------------------------------- */
function IconButton({ icon, label, onClick, active, size = 32, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={"ibtn" + (active ? " is-active" : "")}
      aria-label={label || title}
      title={title || label}
      style={{ width: size, height: size }}>
      
      <Icon name={icon} size={Math.round(size * 0.55)} />
    </button>);

}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */
function timeAgo(iso, fmt) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  // fmt(n, unit) — pluggable so the i18n table owns formatting.
  const f = fmt || ((n, u) => `${n}${u} ago`);
  if (s < 60) return f(s, "s");
  if (s < 3600) return f(Math.floor(s / 60), "m");
  if (s < 86400) return f(Math.floor(s / 3600), "h");
  return f(Math.floor(s / 86400), "d");
}

function hostOf(url) {
  try {return new URL(url).hostname.replace(/^www\./, "");}
  catch {return url;}
}

function cls(...xs) {return xs.filter(Boolean).join(" ");}

Object.assign(window, {
  Icon, Segmented, ProviderBadge, Hairline, IconButton,
  PROVIDER_LABEL, timeAgo, hostOf, cls
});
