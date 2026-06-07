import { useState, useEffect } from "react";

const BACKEND_URL = "https://ai-trading-advisor-xx7b.onrender.com";

const REC_CONFIG = {
  "BUY MORE": { color: "#00e676", bg: "rgba(0,230,118,0.08)", border: "rgba(0,230,118,0.25)", glow: "rgba(0,230,118,0.1)" },
  "BUY":      { color: "#00e676", bg: "rgba(0,230,118,0.08)", border: "rgba(0,230,118,0.25)", glow: "rgba(0,230,118,0.1)" },
  "HOLD":     { color: "#ffd740", bg: "rgba(255,215,64,0.08)", border: "rgba(255,215,64,0.25)", glow: "rgba(255,215,64,0.1)" },
  "TRIM":     { color: "#ff6d00", bg: "rgba(255,109,0,0.08)", border: "rgba(255,109,0,0.25)", glow: "rgba(255,109,0,0.1)" },
  "SELL":     { color: "#ff1744", bg: "rgba(255,23,68,0.08)", border: "rgba(255,23,68,0.25)", glow: "rgba(255,23,68,0.1)" },
  "WATCH":    { color: "#40c4ff", bg: "rgba(64,196,255,0.08)", border: "rgba(64,196,255,0.25)", glow: "rgba(64,196,255,0.1)" },
};

const FEAR_COLORS = { "Extreme Fear": "#ff1744", "Fear": "#ff6d00", "Neutral": "#ffd740", "Greed": "#76ff03", "Extreme Greed": "#00e676" };
const CONV_COLORS = { HIGH: "#00e676", MEDIUM: "#ffd740", LOW: "#ff6d00" };

const STORAGE_KEY = "portfolio_v1";

function loadPortfolio() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function savePortfolio(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

function parseRec(text) {
  if (!text) return {};
  const rec = (text.match(/RECOMMENDATION[:\s]*\[?(BUY MORE|BUY|HOLD|TRIM|SELL|WATCH)\]?/i) || [])[1]?.toUpperCase();
  const conviction = (text.match(/CONVICTION[:\s]*\[?(HIGH|MEDIUM|LOW)\]?/i) || [])[1]?.toUpperCase();
  return { rec, conviction };
}

function parseSummary(text) {
  if (!text) return [];
  const match = text.match(/## SUMMARY\n([\s\S]*?)(?=\n##)/);
  if (!match) return [];
  return match[1].trim().split("\n")
    .map(l => l.trim().replace(/^[•\-\*]\s*/, "").replace(/\*\*/g, ""))
    .filter(l => l.length > 5).slice(0, 4);
}

function formatInline(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((p, i) => i % 2 === 1 ? <strong key={i} style={{ color: "#ccc", fontWeight: 600 }}>{p}</strong> : p);
}

function renderReport(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let key = 0;
  let inReport = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t === "--" || t === "---") { elements.push(<div key={key++} style={{ height: 6 }} />); continue; }
    if (t === "## SUMMARY") { inReport = false; continue; }
    if (t.startsWith("## PRICE")) inReport = true;
    if (!inReport) continue;

    if (t.startsWith("## ") || t.startsWith("# ")) {
      const h = t.replace(/^#+\s*/, "");
      elements.push(<div key={key++} style={{ fontSize: 11, fontWeight: 700, color: "#555", fontFamily: "monospace", letterSpacing: 1.5, marginTop: 22, marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #111", textTransform: "uppercase" }}>{h}</div>);
    } else if (t.startsWith("**") && t.endsWith("**") && t.slice(2,-2).indexOf("**") === -1) {
      const h = t.replace(/\*\*/g, "");
      if (h.match(/^(RECOMMENDATION|CONVICTION)/i)) continue;
      elements.push(<div key={key++} style={{ fontSize: 10, fontWeight: 700, color: "#444", fontFamily: "monospace", letterSpacing: 1, marginTop: 14, marginBottom: 6, textTransform: "uppercase" }}>{h}</div>);
    } else if (t.startsWith("•") || t.match(/^[-*]\s/)) {
      const c = t.replace(/^[•\-\*]\s*/, "");
      const isRisk = /risk|downside|concern|warning|danger/i.test(c);
      const isBull = /upside|growth|positive|bull|opportunity|strong/i.test(c);
      const dot = isRisk ? "#ff1744" : isBull ? "#00e676" : "#444";
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
          <span style={{ color: dot, fontSize: 13, lineHeight: 1.5, flexShrink: 0, marginTop: 2 }}>•</span>
          <span style={{ fontSize: 13, color: "#888", lineHeight: 1.7 }}>{formatInline(c)}</span>
        </div>
      );
    } else if (t.match(/^\d+\.\s/)) {
      const num = t.match(/^\d+/)[0];
      const c = t.replace(/^\d+\.\s*/, "");
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
          <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace", flexShrink: 0, marginTop: 3 }}>{num}.</span>
          <span style={{ fontSize: 13, color: "#888", lineHeight: 1.7 }}>{formatInline(c)}</span>
        </div>
      );
    } else {
      elements.push(<div key={key++} style={{ fontSize: 13, color: "#666", lineHeight: 1.75, marginBottom: 6 }}>{formatInline(t)}</div>);
    }
  }
  return elements;
}

function PositionCard({ data }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseRec(data.ai?.recommendation || "");
  const summary = parseSummary(data.ai?.recommendation || "");
  const cfg = REC_CONFIG[parsed.rec] || REC_CONFIG["WATCH"];
  const pi = data.price_info || {};
  const pos = data.position || {};
  const isGain = pos.gain_loss > 0;

  if (data.error) {
    return (
      <div style={{ background: "#0f0f14", border: "1px solid #222", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <span style={{ fontFamily: "monospace", color: "#555" }}>{data.ticker}</span>
        <span style={{ fontSize: 12, color: "#ff1744", marginLeft: 12 }}>Error: {data.error}</span>
      </div>
    );
  }

  return (
    <div style={{ background: "#08080d", border: `1px solid ${cfg.border}`, borderRadius: 14, marginBottom: 16, overflow: "hidden", boxShadow: `0 0 40px ${cfg.glow}` }}>

      {/* Header */}
      <div style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.border}`, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: 2 }}>{data.ticker}</div>
            {pi.name && pi.name !== data.ticker && <div style={{ fontSize: 10, color: "#444", marginTop: 1 }}>{pi.name}</div>}
          </div>
          <div style={{ fontSize: 28, fontFamily: "'Space Mono', monospace", fontWeight: 700, color: cfg.color, textShadow: `0 0 20px ${cfg.color}44` }}>
            {parsed.rec || "—"}
          </div>
          {parsed.conviction && (
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 5, padding: "3px 10px" }}>
              <div style={{ fontSize: 8, color: "#444", fontFamily: "monospace" }}>CONVICTION</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: CONV_COLORS[parsed.conviction] || "#888", fontFamily: "monospace" }}>{parsed.conviction}</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {pi.price && <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>${typeof pi.price === "number" ? pi.price.toFixed(2) : pi.price}</div>
            {pi.change_pct != null && <div style={{ fontSize: 11, color: pi.change_pct >= 0 ? "#00e676" : "#ff1744", fontFamily: "monospace" }}>{pi.change_pct >= 0 ? "▲" : "▼"} {Math.abs(typeof pi.change_pct === "number" ? pi.change_pct.toFixed(2) : pi.change_pct)}%</div>}
          </div>}
          {pos.position_value && <div style={{ textAlign: "right", borderLeft: "1px solid #1a1a1a", paddingLeft: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>${pos.position_value.toLocaleString()}</div>
            {pos.gain_loss != null && <div style={{ fontSize: 11, color: isGain ? "#00e676" : "#ff1744", fontFamily: "monospace" }}>
              {isGain ? "+" : ""}${pos.gain_loss.toLocaleString()} ({isGain ? "+" : ""}{pos.gain_loss_pct}%)
            </div>}
          </div>}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid #0f0f14", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pos.shares > 0 && <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "5px 10px" }}><div style={{ fontSize: 8, color: "#333", fontFamily: "monospace" }}>SHARES</div><div style={{ fontSize: 12, color: "#e0e0e0", fontFamily: "monospace" }}>{pos.shares}</div></div>}
        {pos.cost_basis > 0 && <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "5px 10px" }}><div style={{ fontSize: 8, color: "#333", fontFamily: "monospace" }}>COST BASIS</div><div style={{ fontSize: 12, color: "#e0e0e0", fontFamily: "monospace" }}>${pos.cost_basis}</div></div>}
        {pi.week52_high && <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "5px 10px" }}><div style={{ fontSize: 8, color: "#333", fontFamily: "monospace" }}>52W HIGH</div><div style={{ fontSize: 12, color: "#e0e0e0", fontFamily: "monospace" }}>{pi.week52_high}</div></div>}
        {pi.week52_low && <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "5px 10px" }}><div style={{ fontSize: 8, color: "#333", fontFamily: "monospace" }}>52W LOW</div><div style={{ fontSize: 12, color: "#e0e0e0", fontFamily: "monospace" }}>{pi.week52_low}</div></div>}
        {data.fundamentals?.analyst_rating && <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "5px 10px" }}><div style={{ fontSize: 8, color: "#333", fontFamily: "monospace" }}>ANALYST</div><div style={{ fontSize: 12, color: "#ffd740", fontFamily: "monospace" }}>{data.fundamentals.analyst_rating.toUpperCase()}</div></div>}
        {data.fundamentals?.target_mean && <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "5px 10px" }}><div style={{ fontSize: 8, color: "#333", fontFamily: "monospace" }}>TARGET</div><div style={{ fontSize: 12, color: "#00e676", fontFamily: "monospace" }}>${data.fundamentals.target_mean}</div></div>}
      </div>

      {/* Sentiment */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid #0f0f14" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "#00e676", fontFamily: "monospace" }}>▲ {data.sentiment?.bull_pct}% BULL</span>
          <span style={{ fontSize: 9, color: "#333", fontFamily: "monospace" }}>{data.sentiment?.total} MESSAGES</span>
          <span style={{ fontSize: 9, color: "#ff1744", fontFamily: "monospace" }}>BEAR {data.sentiment?.bear_pct}% ▼</span>
        </div>
        <div style={{ height: 2, background: "#111", display: "flex", overflow: "hidden", borderRadius: 1 }}>
          <div style={{ width: `${data.sentiment?.bull_pct}%`, background: "#00e676" }} />
          <div style={{ width: `${data.sentiment?.bear_pct}%`, background: "#ff1744" }} />
        </div>
      </div>

      {/* Summary */}
      {summary.length > 0 && (
        <div style={{ margin: "16px 24px 0", padding: "14px 18px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: cfg.color, fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>▸ KEY TAKEAWAYS</div>
          {summary.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5, alignItems: "flex-start" }}>
              <span style={{ color: cfg.color, fontSize: 10, flexShrink: 0, marginTop: 3 }}>▸</span>
              <span style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expand toggle */}
      <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 10, fontFamily: "monospace", padding: "12px 24px", width: "100%", textAlign: "left", letterSpacing: 0.5 }}>
        {expanded ? "▲ HIDE FULL REPORT" : "▼ SHOW FULL RESEARCH REPORT"}
      </button>

      {expanded && (
        <div style={{ padding: "0 24px 24px" }}>
          {renderReport(data.ai?.recommendation)}
        </div>
      )}

      <div style={{ padding: "8px 24px", borderTop: "1px solid #0a0a0a", fontSize: 9, color: "#1a1a1a", fontFamily: "monospace" }}>
        ⚠ NOT FINANCIAL ADVICE
      </div>
    </div>
  );
}

function PortfolioSummary({ results, fearGreed }) {
  if (!results.length) return null;
  const withValues = results.filter(r => r.position?.position_value);
  const totalValue = withValues.reduce((s, r) => s + (r.position?.position_value || 0), 0);
  const totalCost = withValues.reduce((s, r) => s + (r.position?.cost_total || 0), 0);
  const totalGL = totalValue - totalCost;
  const totalGLPct = totalCost > 0 ? round((totalGL / totalCost) * 100, 2) : null;

  const recs = results.map(r => parseRec(r.ai?.recommendation || "").rec).filter(Boolean);
  const recCounts = recs.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});

  function round(n, d) { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }

  return (
    <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: "#333", fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>PORTFOLIO SUMMARY</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {totalValue > 0 && <div>
              <div style={{ fontSize: 9, color: "#333", fontFamily: "monospace" }}>TOTAL VALUE</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>${totalValue.toLocaleString()}</div>
            </div>}
            {totalGL !== 0 && <div>
              <div style={{ fontSize: 9, color: "#333", fontFamily: "monospace" }}>TOTAL GAIN/LOSS</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: totalGL >= 0 ? "#00e676" : "#ff1744", fontFamily: "monospace" }}>
                {totalGL >= 0 ? "+" : ""}${totalGL.toLocaleString()} {totalGLPct != null ? `(${totalGL >= 0 ? "+" : ""}${totalGLPct}%)` : ""}
              </div>
            </div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {Object.entries(recCounts).map(([rec, count]) => {
            const cfg = REC_CONFIG[rec] || REC_CONFIG["WATCH"];
            return (
              <div key={rec} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 6, padding: "6px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color, fontFamily: "monospace" }}>{count}</div>
                <div style={{ fontSize: 9, color: cfg.color, fontFamily: "monospace", opacity: 0.7 }}>{rec}</div>
              </div>
            );
          })}
          {fearGreed && (
            <div style={{ background: "#060608", border: "1px solid #1a1a1a", borderRadius: 6, padding: "6px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: FEAR_COLORS[fearGreed.rating] || "#ffd740", fontFamily: "monospace" }}>{fearGreed.score}</div>
              <div style={{ fontSize: 9, color: "#333", fontFamily: "monospace" }}>FEAR/GREED</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PortfolioAdvisor() {
  const [portfolio, setPortfolio] = useState(loadPortfolio);
  const [newTicker, setNewTicker] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCost, setNewCost] = useState("");
  const [results, setResults] = useState([]);
  const [fearGreed, setFearGreed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [error, setError] = useState(null);

  const addPosition = () => {
    if (!newTicker.trim()) return;
    const pos = { ticker: newTicker.toUpperCase().trim(), shares: parseFloat(newShares) || 0, cost_basis: parseFloat(newCost) || 0 };
    const updated = [...portfolio.filter(p => p.ticker !== pos.ticker), pos];
    setPortfolio(updated);
    savePortfolio(updated);
    setNewTicker(""); setNewShares(""); setNewCost("");
  };

  const removePosition = (ticker) => {
    const updated = portfolio.filter(p => p.ticker !== ticker);
    setPortfolio(updated);
    savePortfolio(updated);
  };

  const runResearch = async () => {
    if (!portfolio.length) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const tickers = portfolio.map(p => p.ticker).join(",");
      const shares = portfolio.map(p => p.shares).join(",");
      const costs = portfolio.map(p => p.cost_basis).join(",");
      const resp = await fetch(`${BACKEND_URL}/portfolio?tickers=${encodeURIComponent(tickers)}&shares=${encodeURIComponent(shares)}&costs=${encodeURIComponent(costs)}`);
      const data = await resp.json();
      setResults(data.results || []);
      setFearGreed(data.fear_greed);
      setLastRun(new Date().toLocaleTimeString());
    } catch {
      setError("Cannot reach backend. Make sure Railway/Render is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#e0e0e0", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f0f14", padding: "18px 32px", background: "#040406", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: 2 }}>PORTFOLIO RESEARCH ADVISOR</div>
          <div style={{ fontSize: 10, color: "#2a2a2a", marginTop: 3, letterSpacing: 1, fontFamily: "monospace" }}>DAILY DEEP RESEARCH · AI RECOMMENDATIONS · POSITION TRACKING</div>
        </div>
        {lastRun && <div style={{ fontSize: 10, color: "#333", fontFamily: "monospace" }}>LAST RUN: {lastRun}</div>}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>

        {/* Add position */}
        <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#333", fontFamily: "monospace", letterSpacing: 1, marginBottom: 14 }}>ADD POSITION TO PORTFOLIO</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addPosition()} placeholder="TICKER" maxLength={8}
              style={{ width: 100, background: "#060608", border: "1px solid #1a1a1a", borderRadius: 6, padding: "10px 12px", color: "#e0e0e0", fontSize: 14, fontFamily: "'Space Mono', monospace", outline: "none", letterSpacing: 2 }} />
            <input value={newShares} onChange={e => setNewShares(e.target.value)} placeholder="Shares (optional)" type="number"
              style={{ width: 160, background: "#060608", border: "1px solid #1a1a1a", borderRadius: 6, padding: "10px 12px", color: "#e0e0e0", fontSize: 13, outline: "none" }} />
            <input value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="Cost basis/share (optional)" type="number"
              style={{ width: 200, background: "#060608", border: "1px solid #1a1a1a", borderRadius: 6, padding: "10px 12px", color: "#e0e0e0", fontSize: 13, outline: "none" }} />
            <button onClick={addPosition} disabled={!newTicker.trim()} style={{
              background: newTicker.trim() ? "linear-gradient(135deg, #00e676, #1de9b6)" : "#111",
              border: "none", borderRadius: 6, padding: "10px 20px",
              color: newTicker.trim() ? "#000" : "#333",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "monospace"
            }}>+ ADD</button>
          </div>

          {/* Portfolio list */}
          {portfolio.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: "#333", fontFamily: "monospace", marginBottom: 8 }}>YOUR HOLDINGS ({portfolio.length})</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {portfolio.map(p => (
                  <div key={p.ticker} style={{ background: "#0f0f14", border: "1px solid #1a1a1a", borderRadius: 6, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 13, color: "#e0e0e0", fontWeight: 700 }}>{p.ticker}</span>
                    {p.shares > 0 && <span style={{ fontSize: 11, color: "#444" }}>{p.shares} shares</span>}
                    {p.cost_basis > 0 && <span style={{ fontSize: 11, color: "#333" }}>@ ${p.cost_basis}</span>}
                    <button onClick={() => removePosition(p.ticker)} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Run button */}
        {portfolio.length > 0 && (
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <button onClick={runResearch} disabled={loading} style={{
              background: loading ? "#111" : "linear-gradient(135deg, #00e676, #1de9b6)",
              border: "none", borderRadius: 10, padding: "16px 48px",
              color: loading ? "#333" : "#000", fontSize: 14, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Space Mono', monospace", letterSpacing: 1,
              boxShadow: loading ? "none" : "0 0 40px rgba(0,230,118,0.2)"
            }}>
              {loading ? "RUNNING DEEP RESEARCH..." : `🔬 RUN DAILY RESEARCH (${portfolio.length} holdings)`}
            </button>
            {error && <div style={{ color: "#ff1744", fontSize: 12, fontFamily: "monospace", marginTop: 12 }}>{error}</div>}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 11, color: "#333", fontFamily: "monospace", marginBottom: 16, letterSpacing: 1 }}>ANALYZING {portfolio.length} HOLDINGS — THIS TAKES 1-2 MINUTES...</div>
            <div style={{ width: 260, height: 2, background: "#0f0f14", margin: "0 auto", overflow: "hidden", borderRadius: 2 }}>
              <div style={{ width: "40%", height: "100%", background: "linear-gradient(90deg, #00e676, #1de9b6)", animation: "slide 1.5s ease-in-out infinite" }} />
            </div>
            <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
          </div>
        )}

        {results.length > 0 && (
          <>
            <PortfolioSummary results={results} fearGreed={fearGreed} />
            {results.map(item => <PositionCard key={item.ticker} data={item} />)}
          </>
        )}

        {portfolio.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 14, color: "#222", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>ADD YOUR HOLDINGS</div>
            <div style={{ fontSize: 11, color: "#1a1a1a", lineHeight: 2, fontFamily: "monospace" }}>
              Enter each position above with optional shares and cost basis<br />
              Then click RUN DAILY RESEARCH for deep AI analysis on all holdings
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
