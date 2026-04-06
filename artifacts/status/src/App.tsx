import { useEffect, useState, useRef } from "react";

const API_BASE = "";

interface BotStatus {
  online: boolean;
  tag: string;
  guilds: number;
  members: number;
  commands: number;
  uptime: number;
  checkedAt: string;
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

function GlitchTitle() {
  return (
    <div className="glitch-wrapper" aria-label="GL1TCH">
      <span className="glitch-base">GL1TCH</span>
      <span className="glitch-layer glitch-layer-1" aria-hidden>GL1TCH</span>
      <span className="glitch-layer glitch-layer-2" aria-hidden>GL1TCH</span>
    </div>
  );
}

function StatCard({ label, value, accent = "green" }: { label: string; value: string | number; accent?: "green" | "purple" | "cyan" }) {
  return (
    <div className={`stat-card stat-card--${accent}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function DataStream() {
  const chars = "01アイウエオカキクケコサシスセソタチツテト";
  const cols = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div className="data-stream" aria-hidden>
      {cols.map((i) => (
        <div key={i} className="data-stream-col" style={{ animationDelay: `${i * 0.4}s`, left: `${i * 12.5}%` }}>
          {Array.from({ length: 12 }, (_, j) => (
            <span key={j}>{chars[Math.floor(Math.random() * chars.length)]}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bot-status`);
      if (!res.ok) throw new Error("non-ok");
      const data: BotStatus = await res.json();
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const displayUptime = status ? status.uptime + tick : 0;
  const isOnline = status?.online && !error;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  return (
    <>
      <style>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 40px 20px 80px;
          position: relative;
          overflow: hidden;
        }
        .bg-grid {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
          z-index: 0;
        }
        .scanline {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(transparent, rgba(0,255,136,0.06), transparent);
          animation: scanline 6s linear infinite;
          pointer-events: none;
          z-index: 1;
        }
        .content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 700px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          animation: fade-in 0.6s ease both;
        }
        .header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .glitch-wrapper {
          position: relative;
          font-family: var(--font-display);
          font-size: clamp(56px, 12vw, 96px);
          font-weight: 900;
          color: var(--green);
          letter-spacing: 0.08em;
          line-height: 1;
          text-shadow: 0 0 30px rgba(0,255,136,0.4), 0 0 60px rgba(0,255,136,0.15);
        }
        .glitch-base { position: relative; z-index: 2; }
        .glitch-layer {
          position: absolute;
          inset: 0;
          display: block;
        }
        .glitch-layer-1 {
          color: var(--purple);
          z-index: 1;
          animation: glitch-1 4s infinite;
          text-shadow: 2px 0 var(--purple);
        }
        .glitch-layer-2 {
          color: var(--cyan);
          z-index: 1;
          animation: glitch-2 4s infinite;
          text-shadow: -2px 0 var(--cyan);
        }
        .subtitle {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--text-dim);
          letter-spacing: 0.25em;
          text-transform: uppercase;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 4px;
          border: 1px solid;
          font-size: 12px;
          font-family: var(--font-mono);
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }
        .status-badge--online {
          border-color: rgba(0,255,136,0.4);
          color: var(--green);
          background: rgba(0,255,136,0.06);
          box-shadow: 0 0 12px rgba(0,255,136,0.08);
        }
        .status-badge--offline {
          border-color: rgba(255,51,102,0.4);
          color: var(--red);
          background: rgba(255,51,102,0.06);
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot--online {
          background: var(--green);
          box-shadow: 0 0 6px var(--green);
          animation: blink 2s ease infinite;
        }
        .status-dot--offline {
          background: var(--red);
        }
        .tag {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--text-dim);
          letter-spacing: 0.05em;
        }
        .stats-grid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }
        .stat-card {
          border: 1px solid var(--border);
          background: var(--panel);
          border-radius: 6px;
          padding: 20px 16px;
          text-align: center;
          animation: pulse-border 4s ease infinite;
        }
        .stat-card--purple { animation-delay: 0.5s; border-color: rgba(157,78,221,0.2); background: rgba(157,78,221,0.04); }
        .stat-card--cyan   { animation-delay: 1s;   border-color: rgba(0,212,255,0.2);  background: rgba(0,212,255,0.04); }
        .stat-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .stat-value {
          font-family: var(--font-display);
          font-size: 28px;
          font-weight: 700;
          color: var(--green);
          text-shadow: 0 0 16px rgba(0,255,136,0.3);
        }
        .stat-card--purple .stat-value { color: var(--purple); text-shadow: 0 0 16px rgba(157,78,221,0.3); }
        .stat-card--cyan   .stat-value { color: var(--cyan);   text-shadow: 0 0 16px rgba(0,212,255,0.3); }
        .info-panel {
          width: 100%;
          border: 1px solid var(--border);
          background: var(--panel);
          border-radius: 6px;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          border-bottom: 1px solid rgba(0,255,136,0.05);
          padding-bottom: 8px;
        }
        .info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .info-key   { color: var(--text-muted); letter-spacing: 0.1em; text-transform: uppercase; }
        .info-val   { color: var(--text); font-family: var(--font-mono); }
        .terminal-footer {
          font-size: 11px;
          color: var(--text-muted);
          letter-spacing: 0.12em;
          text-align: center;
        }
        .cursor {
          display: inline-block;
          width: 8px;
          height: 13px;
          background: var(--green);
          margin-left: 4px;
          vertical-align: middle;
          animation: blink 1s step-end infinite;
        }
        .data-stream {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
          opacity: 0.04;
        }
        .data-stream-col {
          position: absolute;
          bottom: 0;
          font-size: 12px;
          color: var(--green);
          display: flex;
          flex-direction: column;
          gap: 4px;
          animation: data-stream 8s linear infinite;
        }
        .loading {
          color: var(--text-dim);
          font-size: 14px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
      `}</style>
      <div className="bg-grid" />
      <div className="scanline" />
      <DataStream />
      <div className="page">
        <div className="content">
          <div className="header">
            <GlitchTitle />
            <div className="subtitle">Discord Moderation System · v2.0</div>
            {status ? (
              <>
                <div className={`status-badge status-badge--${isOnline ? "online" : "offline"}`}>
                  <span className={`status-dot status-dot--${isOnline ? "online" : "offline"}`} />
                  {isOnline ? "OPERATIONAL" : "OFFLINE"}
                </div>
                <div className="tag">{status.tag}</div>
              </>
            ) : (
              <div className="loading">INITIALIZING<span className="cursor" /></div>
            )}
          </div>

          {status && (
            <>
              <div className="stats-grid">
                <StatCard label="Guilds" value={status.guilds} accent="green" />
                <StatCard label="Members" value={status.members.toLocaleString()} accent="purple" />
                <StatCard label="Commands" value={status.commands} accent="cyan" />
              </div>

              <div className="info-panel">
                <div className="info-row">
                  <span className="info-key">Uptime</span>
                  <span className="info-val">{isOnline ? formatUptime(displayUptime) : "—"}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">Last Check</span>
                  <span className="info-val">{now} UTC</span>
                </div>
                <div className="info-row">
                  <span className="info-key">Latency</span>
                  <span className="info-val">{isOnline ? `${status.guilds > 0 ? "— ms" : "—"}` : "—"}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">Engine</span>
                  <span className="info-val">discord.js v14 · Node.js · PostgreSQL</span>
                </div>
              </div>
            </>
          )}

          <div className="terminal-footer">
            SYS::{now} · SECTOR_7 · AUTHORIZED ACCESS ONLY<span className="cursor" />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
