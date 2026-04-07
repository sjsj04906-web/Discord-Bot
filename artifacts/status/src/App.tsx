import { useEffect, useState, useRef } from "react";

interface BotStatus {
  online: boolean;
  tag: string;
  guilds: number;
  members: number;
  commands: number;
  uptime: number;
  latency: number;
  checkedAt: string;
}

interface CorpStatus {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  prevPrice: number;
  change: number;
  volume24h: number;
  halted: boolean;
  lastTickAt: string | null;
}

interface MarketEvent {
  id: number;
  ticker: string | null;
  eventType: string;
  headline: string;
  impactBps: number | null;
  occurredAt: string | null;
}

interface MarketStatus {
  corps: CorpStatus[];
  events: MarketEvent[];
  lastTickAt: string | null;
  totalVolume: number;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").replace(/__/g, "");
}

function GlitchTitle() {
  return (
    <div className="glitch-wrapper" aria-label="GL1TCH">
      <span className="glitch-base">GL1TCH</span>
      <span className="glitch-layer glitch-layer-1" aria-hidden>GL1TCH</span>
      <span className="glitch-layer glitch-layer-2" aria-hidden>GL1TCH</span>
    </div>
  );
}

function DataStream() {
  const chars = "01アイウエオカキクケコサシスセソタチツテト";
  const cols = Array.from({ length: 10 }, (_, i) => i);
  return (
    <div className="data-stream" aria-hidden>
      {cols.map((i) => (
        <div key={i} className="data-stream-col" style={{ animationDelay: `${i * 0.7}s`, left: `${i * 10}%` }}>
          {Array.from({ length: 14 }, (_, j) => (
            <span key={j}>{chars[Math.floor(Math.random() * chars.length)]}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

const MODULES = [
  { id: "core",    label: "Core Engine",       desc: "discord.js v14 · Gateway" },
  { id: "mod",     label: "Moderation",         desc: "Ban · Kick · Mute · Warn" },
  { id: "xp",      label: "XP Engine",          desc: "Levels · Roles · Leaderboard" },
  { id: "economy", label: "Economy",            desc: "Wallet · Bank · Shop · Lottery" },
  { id: "ndx",     label: "Neural Data Exchange", desc: "Stocks · Options · Bonds" },
  { id: "bank",    label: "Neural Bank",        desc: "Loans · Interest · Rates" },
  { id: "nuke",    label: "Anti-Nuke",          desc: "Raid Guard · Ghost Ping" },
  { id: "sched",   label: "Scheduler",          desc: "Ticks · Reminders · Expiry" },
];

const CMD_CATS = [
  { label: "Moderation",  count: 18, accent: "red"    },
  { label: "Economy",     count: 20, accent: "yellow" },
  { label: "Stock Market",count: 14, accent: "cyan"   },
  { label: "XP / Levels", count:  8, accent: "purple" },
  { label: "Utility",     count:  9, accent: "green"  },
  { label: "Config",      count:  5, accent: "dim"    },
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  flash_crash:    "var(--red)",
  circuit_breaker:"var(--red)",
  grid_event:     "var(--yellow)",
  earnings:       "var(--cyan)",
  dividend:       "var(--green)",
  takeover:       "var(--purple)",
  ipo:            "var(--cyan)",
};

function App() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [market, setMarket] = useState<MarketStatus | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/bot-status");
      if (!res.ok) throw new Error("non-ok");
      setStatus(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  };

  const fetchMarket = async () => {
    try {
      const res = await fetch("/api/market-status");
      if (!res.ok) return;
      setMarket(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchStatus();
    fetchMarket();
    const s = setInterval(fetchStatus, 15_000);
    const m = setInterval(fetchMarket, 30_000);
    return () => { clearInterval(s); clearInterval(m); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const displayUptime = status ? status.uptime + tick : 0;
  const isOnline = status?.online && !error;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const tickerCorps = market?.corps ?? [];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-mono);
          min-height: 100vh;
          overflow-x: hidden;
        }
        :root {
          --bg: #020409;
          --panel: rgba(0,255,136,0.03);
          --panel-alt: rgba(0,212,255,0.03);
          --border: rgba(0,255,136,0.12);
          --border-cyan: rgba(0,212,255,0.15);
          --border-purple: rgba(157,78,221,0.18);
          --green: #00ff88;
          --green-dim: rgba(0,255,136,0.5);
          --purple: #9d4edd;
          --red: #ff3366;
          --yellow: #ffb703;
          --cyan: #00d4ff;
          --text: #c8fde0;
          --text-dim: #4a7a5e;
          --text-muted: #243530;
          --font-mono: 'Share Tech Mono', monospace;
          --font-display: 'Orbitron', sans-serif;
        }
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 0 80px;
          position: relative;
          overflow: hidden;
        }
        .bg-grid {
          position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(0,255,136,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.025) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none; z-index: 0;
        }
        .scanline {
          position: fixed; top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(transparent, rgba(0,255,136,0.08), transparent);
          animation: scanline 8s linear infinite;
          pointer-events: none; z-index: 1;
        }
        .data-stream {
          position: fixed; inset: 0;
          pointer-events: none; z-index: 0; overflow: hidden; opacity: 0.03;
        }
        .data-stream-col {
          position: absolute; bottom: 0;
          font-size: 11px; color: var(--green);
          display: flex; flex-direction: column; gap: 3px;
          animation: data-stream 10s linear infinite;
        }

        /* ── Ticker tape ─────────────────────────────── */
        .ticker-tape {
          position: sticky; top: 0; z-index: 10;
          width: 100%;
          background: rgba(2,4,9,0.92);
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(6px);
          overflow: hidden;
          padding: 8px 0;
        }
        .ticker-inner {
          display: flex; gap: 0;
          animation: ticker-scroll 40s linear infinite;
          white-space: nowrap;
          width: max-content;
        }
        .ticker-inner:hover { animation-play-state: paused; }
        .ticker-item {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 0 24px;
          font-size: 12px;
          border-right: 1px solid rgba(0,255,136,0.08);
        }
        .ticker-sym  { font-family: var(--font-display); font-size: 11px; font-weight: 700; color: var(--green); letter-spacing: 0.1em; }
        .ticker-price { color: var(--text); }
        .ticker-up   { color: var(--green); }
        .ticker-down { color: var(--red); }
        .ticker-flat { color: var(--text-dim); }
        .ticker-halted { color: var(--red); font-size: 10px; letter-spacing: 0.05em; }

        /* ── Main content ─────────────────────────────── */
        .content {
          position: relative; z-index: 2;
          width: 100%; max-width: 1060px;
          padding: 48px 24px 0;
          display: flex; flex-direction: column; align-items: center; gap: 32px;
          animation: fade-in 0.5s ease both;
        }

        /* ── Header ──────────────────────────────────── */
        .header {
          text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .glitch-wrapper {
          position: relative;
          font-family: var(--font-display);
          font-size: clamp(52px, 11vw, 88px);
          font-weight: 900;
          color: var(--green);
          letter-spacing: 0.1em;
          line-height: 1;
          text-shadow: 0 0 28px rgba(0,255,136,0.45), 0 0 60px rgba(0,255,136,0.15);
        }
        .glitch-base { position: relative; z-index: 2; }
        .glitch-layer { position: absolute; inset: 0; display: block; }
        .glitch-layer-1 { color: var(--purple); z-index: 1; animation: glitch-1 4.5s infinite; text-shadow: 2px 0 var(--purple); }
        .glitch-layer-2 { color: var(--cyan);   z-index: 1; animation: glitch-2 4.5s infinite; text-shadow: -2px 0 var(--cyan); }
        .subtitle {
          font-family: var(--font-mono); font-size: 12px;
          color: var(--text-dim); letter-spacing: 0.28em; text-transform: uppercase;
        }
        .status-badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 5px 16px; border-radius: 3px; border: 1px solid;
          font-size: 11px; font-family: var(--font-mono);
          letter-spacing: 0.18em; text-transform: uppercase;
        }
        .status-badge--online  { border-color: rgba(0,255,136,0.35); color: var(--green); background: rgba(0,255,136,0.05); }
        .status-badge--offline { border-color: rgba(255,51,102,0.35); color: var(--red);   background: rgba(255,51,102,0.05); }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; }
        .status-dot--online  { background: var(--green); box-shadow: 0 0 6px var(--green); animation: blink 2s ease infinite; }
        .status-dot--offline { background: var(--red); }
        .tag { font-family: var(--font-mono); font-size: 13px; color: var(--text-dim); letter-spacing: 0.05em; }

        /* ── Full-width two-col layout ───────────────── */
        .main-grid {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 680px) { .main-grid { grid-template-columns: 1fr; } }

        /* ── Stats row ───────────────────────────────── */
        .stats-grid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 600px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
        .stat-card {
          border: 1px solid var(--border);
          background: var(--panel);
          border-radius: 5px;
          padding: 18px 14px;
          text-align: center;
          animation: pulse-border 5s ease infinite;
        }
        .stat-card--purple { border-color: rgba(157,78,221,0.18); background: rgba(157,78,221,0.04); animation-delay: 0.5s; }
        .stat-card--cyan   { border-color: rgba(0,212,255,0.18);  background: rgba(0,212,255,0.04);  animation-delay: 1s; }
        .stat-card--yellow { border-color: rgba(255,183,3,0.18);  background: rgba(255,183,3,0.03);  animation-delay: 1.5s; }
        .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.22em; color: var(--text-dim); margin-bottom: 6px; }
        .stat-value { font-family: var(--font-display); font-size: 26px; font-weight: 700; color: var(--green); text-shadow: 0 0 14px rgba(0,255,136,0.3); }
        .stat-card--purple .stat-value { color: var(--purple); text-shadow: 0 0 14px rgba(157,78,221,0.3); }
        .stat-card--cyan   .stat-value { color: var(--cyan);   text-shadow: 0 0 14px rgba(0,212,255,0.3); }
        .stat-card--yellow .stat-value { color: var(--yellow); text-shadow: 0 0 14px rgba(255,183,3,0.25); }

        /* ── Panel base ──────────────────────────────── */
        .panel {
          border: 1px solid var(--border);
          background: var(--panel);
          border-radius: 5px;
        }
        .panel-cyan   { border-color: var(--border-cyan);   background: var(--panel-alt); }
        .panel-purple { border-color: var(--border-purple); background: rgba(157,78,221,0.03); }
        .panel-header {
          padding: 10px 16px 10px;
          border-bottom: 1px solid var(--border);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: var(--text-dim);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .panel-header-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--green); box-shadow: 0 0 5px var(--green);
        }

        /* ── Info panel ──────────────────────────────── */
        .info-panel { padding: 0; }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 12px;
          border-bottom: 1px solid rgba(0,255,136,0.05);
          padding: 10px 18px;
        }
        .info-row:last-child { border-bottom: none; }
        .info-key { color: var(--text-dim); letter-spacing: 0.12em; text-transform: uppercase; font-size: 10px; }
        .info-val { color: var(--text); font-family: var(--font-mono); }
        .ping-good { color: var(--green); }
        .ping-ok   { color: var(--yellow); }
        .ping-bad  { color: var(--red); }

        /* ── System modules ──────────────────────────── */
        .modules-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
        }
        .module-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(0,255,136,0.05);
          border-right: 1px solid rgba(0,255,136,0.05);
        }
        .module-row:nth-child(even) { border-right: none; }
        .module-row:nth-last-child(-n+2) { border-bottom: none; }
        .module-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .module-dot--on  { background: var(--green); box-shadow: 0 0 5px var(--green); animation: blink 3s ease infinite; }
        .module-dot--off { background: var(--red); }
        .module-name { font-size: 11px; color: var(--text); letter-spacing: 0.05em; flex: 1; }
        .module-desc { font-size: 9px; color: var(--text-dim); letter-spacing: 0.04em; display: block; margin-top: 1px; }

        /* ── Command categories ──────────────────────── */
        .cmd-cats {
          display: flex; flex-direction: column; gap: 0;
        }
        .cmd-cat-row {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 16px;
          border-bottom: 1px solid rgba(0,255,136,0.05);
          font-size: 11px;
        }
        .cmd-cat-row:last-child { border-bottom: none; }
        .cmd-cat-bar-wrap { flex: 1; height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
        .cmd-cat-bar { height: 100%; border-radius: 2px; transition: width 1s ease; }
        .cmd-cat-name  { color: var(--text-dim); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; width: 110px; flex-shrink: 0; }
        .cmd-cat-count { color: var(--text-dim); font-size: 10px; width: 28px; text-align: right; flex-shrink: 0; }
        .bar--red    { background: var(--red); box-shadow: 0 0 6px var(--red); }
        .bar--yellow { background: var(--yellow); box-shadow: 0 0 6px var(--yellow); }
        .bar--cyan   { background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }
        .bar--purple { background: var(--purple); box-shadow: 0 0 6px var(--purple); }
        .bar--green  { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .bar--dim    { background: var(--text-dim); }

        /* ── Corp market grid ────────────────────────── */
        .corps-grid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        @media (max-width: 760px) { .corps-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 420px) { .corps-grid { grid-template-columns: 1fr 1fr; } }
        .corp-card {
          border: 1px solid var(--border);
          background: var(--panel);
          border-radius: 5px;
          padding: 14px 12px;
          display: flex; flex-direction: column; gap: 4px;
          transition: border-color 0.3s;
          position: relative;
          overflow: hidden;
        }
        .corp-card:hover { border-color: rgba(0,255,136,0.35); }
        .corp-card--up   { border-top: 2px solid var(--green); }
        .corp-card--down { border-top: 2px solid var(--red); }
        .corp-card--flat { border-top: 2px solid rgba(0,212,255,0.3); }
        .corp-card--halt { border-top: 2px solid var(--yellow); opacity: 0.7; }
        .corp-ticker { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--green); letter-spacing: 0.1em; }
        .corp-name { font-size: 9px; color: var(--text-dim); letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .corp-price { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--text); margin-top: 4px; }
        .corp-change {
          font-size: 11px; font-weight: 700;
          display: flex; align-items: center; gap: 3px;
        }
        .corp-change--up   { color: var(--green); }
        .corp-change--down { color: var(--red); }
        .corp-change--flat { color: var(--text-dim); }
        .corp-vol { font-size: 9px; color: var(--text-dim); letter-spacing: 0.05em; margin-top: 2px; }
        .corp-sector { font-size: 8px; color: var(--text-dim); letter-spacing: 0.08em; text-transform: uppercase; }
        .halted-badge {
          position: absolute; top: 6px; right: 6px;
          background: rgba(255,183,3,0.12); border: 1px solid rgba(255,183,3,0.3);
          color: var(--yellow); font-size: 8px; letter-spacing: 0.1em;
          padding: 2px 5px; border-radius: 2px;
        }
        .market-empty {
          width: 100%; text-align: center; padding: 32px;
          color: var(--text-dim); font-size: 12px; letter-spacing: 0.15em;
        }

        /* ── Events feed ─────────────────────────────── */
        .events-feed { display: flex; flex-direction: column; gap: 0; }
        .event-row {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(0,255,136,0.05);
          font-size: 11px;
        }
        .event-row:last-child { border-bottom: none; }
        .event-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
        .event-body { flex: 1; }
        .event-headline { color: var(--text); line-height: 1.4; word-break: break-word; }
        .event-meta { display: flex; gap: 10px; margin-top: 3px; }
        .event-type { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; }
        .event-time { font-size: 9px; color: var(--text-dim); }
        .no-events { padding: 20px 16px; font-size: 11px; color: var(--text-dim); letter-spacing: 0.1em; text-align: center; }

        /* ── Footer ──────────────────────────────────── */
        .terminal-footer {
          font-size: 10px; color: var(--text-dim);
          letter-spacing: 0.14em; text-align: center; padding: 0 24px;
        }
        .cursor {
          display: inline-block; width: 7px; height: 12px;
          background: var(--green); margin-left: 3px; vertical-align: middle;
          animation: blink 1s step-end infinite;
        }

        /* ── Loading ─────────────────────────────────── */
        .loading {
          color: var(--text-dim); font-size: 13px;
          letter-spacing: 0.2em; text-transform: uppercase;
        }

        /* ── Animations ──────────────────────────────── */
        @keyframes glitch-1 {
          0%, 100% { clip-path: inset(0 0 95% 0);  transform: translate(-2px, 0); }
          20%       { clip-path: inset(30% 0 50% 0); transform: translate(2px, 0); }
          40%       { clip-path: inset(70% 0 10% 0); transform: translate(-1px, 0); }
          60%       { clip-path: inset(10% 0 80% 0); transform: translate(1px, 0); }
          80%       { clip-path: inset(50% 0 30% 0); transform: translate(-2px, 0); }
        }
        @keyframes glitch-2 {
          0%, 100% { clip-path: inset(80% 0 5% 0);  transform: translate(2px, 0); }
          20%       { clip-path: inset(20% 0 60% 0); transform: translate(-2px, 0); }
          40%       { clip-path: inset(60% 0 20% 0); transform: translate(1px, 0); }
          60%       { clip-path: inset(5% 0 85% 0);  transform: translate(-1px, 0); }
          80%       { clip-path: inset(40% 0 40% 0); transform: translate(2px, 0); }
        }
        @keyframes scanline {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(0,255,136,0.12); box-shadow: none; }
          50%       { border-color: rgba(0,255,136,0.28); box-shadow: 0 0 14px rgba(0,255,136,0.07); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes data-stream {
          0%   { transform: translateY(0); opacity: 0.7; }
          100% { transform: translateY(-150px); opacity: 0; }
        }
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      <div className="bg-grid" />
      <div className="scanline" />
      <DataStream />

      {/* ── Ticker tape ─────────────────────────────────────── */}
      {tickerCorps.length > 0 && (
        <div className="ticker-tape">
          <div className="ticker-inner">
            {/* Duplicate for seamless loop */}
            {[...tickerCorps, ...tickerCorps].map((c, i) => {
              const up   = c.change > 0.05;
              const down = c.change < -0.05;
              const cls  = up ? "ticker-up" : down ? "ticker-down" : "ticker-flat";
              const arrow = up ? "▲" : down ? "▼" : "▸";
              return (
                <span className="ticker-item" key={i}>
                  <span className="ticker-sym">{c.ticker}</span>
                  <span className="ticker-price">{c.price.toLocaleString()}</span>
                  <span className={cls}>{arrow}{Math.abs(c.change).toFixed(2)}%</span>
                  {c.halted && <span className="ticker-halted">HALT</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="page">
        <div className="content">

          {/* ── Header ───────────────────────────────────────── */}
          <div className="header">
            <GlitchTitle />
            <div className="subtitle">Ghost Protocol · Neural Enforcement · v2.0</div>
            {status ? (
              <>
                <div className={`status-badge status-badge--${isOnline ? "online" : "offline"}`}>
                  <span className={`status-dot status-dot--${isOnline ? "online" : "offline"}`} />
                  {isOnline ? "ALL SYSTEMS OPERATIONAL" : "OFFLINE"}
                </div>
                <div className="tag">{status.tag}</div>
              </>
            ) : (
              <div className="loading">INITIALIZING<span className="cursor" /></div>
            )}
          </div>

          {status && (
            <>
              {/* ── Stats row ─────────────────────────────────── */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Guilds</div>
                  <div className="stat-value">{status.guilds}</div>
                </div>
                <div className="stat-card stat-card--purple">
                  <div className="stat-label">Members</div>
                  <div className="stat-value">{status.members.toLocaleString()}</div>
                </div>
                <div className="stat-card stat-card--cyan">
                  <div className="stat-label">Commands</div>
                  <div className="stat-value">{status.commands}</div>
                </div>
                <div className="stat-card stat-card--yellow">
                  <div className="stat-label">Uptime</div>
                  <div className="stat-value" style={{ fontSize: "14px", paddingTop: "6px" }}>
                    {isOnline ? formatUptime(displayUptime) : "—"}
                  </div>
                </div>
              </div>

              {/* ── Two-col: info + modules ───────────────────── */}
              <div className="main-grid">
                {/* Info panel */}
                <div className="panel info-panel">
                  <div className="panel-header">
                    <span className="panel-header-dot" />
                    System Info
                  </div>
                  <div className="info-row">
                    <span className="info-key">Latency</span>
                    <span className={`info-val ${status.latency < 0 ? "" : status.latency < 80 ? "ping-good" : status.latency < 200 ? "ping-ok" : "ping-bad"}`}>
                      {status.latency < 0 ? "—" : `${status.latency} ms`}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-key">Last Check</span>
                    <span className="info-val">{now} UTC</span>
                  </div>
                  <div className="info-row">
                    <span className="info-key">Market Volume</span>
                    <span className="info-val">{market ? market.totalVolume.toLocaleString() + " shares" : "—"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-key">Last Tick</span>
                    <span className="info-val">{market ? timeAgo(market.lastTickAt) : "—"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-key">Engine</span>
                    <span className="info-val">discord.js v14 · Node · PostgreSQL</span>
                  </div>
                </div>

                {/* System modules */}
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-header-dot" />
                    System Modules
                  </div>
                  <div className="modules-grid">
                    {MODULES.map((m) => (
                      <div className="module-row" key={m.id}>
                        <span className={`module-dot module-dot--${isOnline ? "on" : "off"}`} style={{ animationDelay: `${Math.random() * 2}s` }} />
                        <div>
                          <span className="module-name">{m.label}</span>
                          <span className="module-desc">{m.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Neural Data Exchange corp grid ────────────── */}
              <div style={{ width: "100%" }}>
                <div className="panel-header" style={{ background: "none", border: "none", paddingLeft: 0, paddingBottom: 8 }}>
                  <span className="panel-header-dot" style={{ background: "var(--cyan)", boxShadow: "0 0 5px var(--cyan)" }} />
                  <span style={{ color: "var(--cyan)", letterSpacing: "0.2em", fontSize: "9px", textTransform: "uppercase" }}>
                    Neural Data Exchange · {market?.corps.length ?? 0} Corps
                  </span>
                </div>
                {market && market.corps.length > 0 ? (
                  <div className="corps-grid">
                    {market.corps.map((c) => {
                      const up   = c.change > 0.05;
                      const down = c.change < -0.05;
                      const cls  = c.halted ? "halt" : up ? "up" : down ? "down" : "flat";
                      return (
                        <div className={`corp-card corp-card--${cls}`} key={c.ticker}>
                          {c.halted && <span className="halted-badge">HALT</span>}
                          <div className="corp-ticker">{c.ticker}</div>
                          <div className="corp-name">{c.name}</div>
                          <div className="corp-price">{c.price.toLocaleString()}</div>
                          <div className={`corp-change corp-change--${cls === "halt" ? "flat" : cls}`}>
                            <span>{up ? "▲" : down ? "▼" : "▸"}</span>
                            <span>{c.change >= 0 ? "+" : ""}{c.change.toFixed(2)}%</span>
                          </div>
                          <div className="corp-vol">VOL {c.volume24h.toLocaleString()}</div>
                          <div className="corp-sector">{c.sector}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="panel" style={{ width: "100%" }}>
                    <div className="market-empty">
                      Market data pending first tick<span className="cursor" />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Two-col: events + command categories ──────── */}
              <div className="main-grid">
                {/* Recent events */}
                <div className="panel panel-cyan">
                  <div className="panel-header" style={{ borderColor: "var(--border-cyan)" }}>
                    <span className="panel-header-dot" style={{ background: "var(--cyan)", boxShadow: "0 0 5px var(--cyan)" }} />
                    Recent Market Events
                  </div>
                  <div className="events-feed">
                    {market && market.events.length > 0 ? market.events.map((ev) => {
                      const color = EVENT_TYPE_COLORS[ev.eventType] ?? "var(--text-dim)";
                      return (
                        <div className="event-row" key={ev.id}>
                          <span className="event-dot" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                          <div className="event-body">
                            <div className="event-headline">{stripMd(ev.headline)}</div>
                            <div className="event-meta">
                              <span className="event-type" style={{ color }}>{ev.eventType.replace(/_/g, " ")}</span>
                              {ev.ticker && <span className="event-type" style={{ color: "var(--text-dim)" }}>{ev.ticker}</span>}
                              <span className="event-time">{timeAgo(ev.occurredAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="no-events">No events yet — market warming up<span className="cursor" /></div>
                    )}
                  </div>
                </div>

                {/* Command categories */}
                <div className="panel panel-purple">
                  <div className="panel-header" style={{ borderColor: "var(--border-purple)" }}>
                    <span className="panel-header-dot" style={{ background: "var(--purple)", boxShadow: "0 0 5px var(--purple)" }} />
                    Command Registry · {status.commands} total
                  </div>
                  <div className="cmd-cats">
                    {CMD_CATS.map((cat) => (
                      <div className="cmd-cat-row" key={cat.label}>
                        <span className="cmd-cat-name">{cat.label}</span>
                        <div className="cmd-cat-bar-wrap">
                          <div
                            className={`cmd-cat-bar bar--${cat.accent}`}
                            style={{ width: `${(cat.count / 20) * 100}%` }}
                          />
                        </div>
                        <span className="cmd-cat-count">{cat.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Footer ───────────────────────────────────────── */}
          <div className="terminal-footer">
            SYS::{now} · SECTOR_7 · AUTHORIZED ACCESS ONLY<span className="cursor" />
          </div>

        </div>
      </div>
    </>
  );
}

export default App;
