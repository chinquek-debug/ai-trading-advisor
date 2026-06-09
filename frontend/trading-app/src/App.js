import { useState } from "react";

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

const SECTOR_LABELS = {
  spin_offs: "🔄 Spin-Offs", energy: "⚡ Energy", biotech: "🧬 Biotech",
  defense: "🛡️ Defense", industrials: "🏭 Industrials", shipping: "🚢 Shipping",
  commodities: "⛏️ Commodities", beaten_down: "📉 Deep Value", financials: "🏦 Financials",
  healthcare: "💊 Healthcare", overlooked_tech: "💻 Overlooked Tech"
};

function loadPortfolio() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function savePortfolio(p) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {} }

function parseRec(text) {
  if (!text) return {};
  let rec = null;
  const patterns = [
    /\*\*RECOMMENDATION[:\s]*\[?(BUY MORE|BUY|HOLD|TRIM|SELL|WATCH)\]?\*\*/i,
    /RECOMMENDATION[:\s]*\[?(BUY MORE|BUY|HOLD|TRIM|SELL|WATCH)\]?/i,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) { rec = m[1].toUpperCase(); break; } }
  const conviction = (text.match(/CONVICTION[:\s]*\[?(HIGH|MEDIUM|LOW)\]?/i) || [])[1]?.toUpperCase();
  return { rec, conviction };
}

function parseSummary(text) {
  if (!text) return [];
  const match = text.match(/## SUMMARY\n([\s\S]*?)(?=\n##)/);
  if (!match) return [];
  return match[1].trim().split("\n")
    .map(l => l.trim().replace(/^[•\-\*]\s*/, "").replace(/\*\*/g, ""))
    .filter(l => l.length > 5).slice(0, 5);
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
    if (t.startsWith("## PRICE") || t.startsWith("## VALUATION")) inReport = true;
    if (!inReport) continue;
    if (t.startsWith("## ") || t.startsWith("# ")) {
      elements.push(<div key={key++} style={{ fontSize: 11, fontWeight: 700, color: "#ccc", fontFamily: "monospace", letterSpacing: 1.5, marginTop: 22, marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #222", textTransform: "uppercase" }}>{t.replace(/^#+\s*/, "")}</div>);
    } else if (t.startsWith("**") && t.endsWith("**") && t.slice(2,-2).indexOf("**") === -1) {
      const h = t.replace(/\*\*/g, "");
      if (h.match(/^(RECOMMENDATION|CONVICTION)/i)) continue;
      elements.push(<div key={key++} style={{ fontSize: 10, fontWeight: 700, color: "#999", fontFamily: "monospace", letterSpacing: 1, marginTop: 14, marginBottom: 6, textTransform: "uppercase" }}>{h}</div>);
    } else if (t.startsWith("•") || t.match(/^[-*]\s/)) {
      const c = t.replace(/^[•\-\*]\s*/, "");
      const isRisk = /risk|downside|concern|warning|danger/i.test(c);
      const isBull = /upside|growth|positive|bull|opportunity|strong/i.test(c);
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
          <span style={{ color: isRisk ? "#ff1744" : isBull ? "#00e676" : "#999", fontSize: 13, lineHeight: 1.5, flexShrink: 0, marginTop: 2 }}>•</span>
          <span style={{ fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>{formatInline(c)}</span>
        </div>
      );
    } else if (t.match(/^\d+\.\s/)) {
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
          <span style={{ color: "#aaa", fontSize: 11, fontFamily: "monospace", flexShrink: 0, marginTop: 3 }}>{t.match(/^\d+/)[0]}.</span>
          <span style={{ fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>{formatInline(t.replace(/^\d+\.\s*/, ""))}</span>
        </div>
      );
    } else {
      elements.push(<div key={key++} style={{ fontSize: 13, color: "#999", lineHeight: 1.75, marginBottom: 6 }}>{formatInline(t)}</div>);
    }
  }
  return elements;
}

function renderScanAnalysis(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let key = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t === "---") { elements.push(<div key={key++} style={{ height: 8 }} />); continue; }
    if (t.startsWith("**") && t.endsWith("**") && t.slice(2,-2).indexOf("**") === -1) {
      const h = t.replace(/\*\*/g, "");
      const isVerdict = h.startsWith("SECTOR VERDICT");
      elements.push(
        <div key={key++} style={{ fontSize: isVerdict ? 11 : 12, fontWeight: 700, color: isVerdict ? "#ffd740" : "#00e676", fontFamily: "monospace", marginTop: isVerdict ? 16 : 12, marginBottom: 6, letterSpacing: 0.5 }}>{h}</div>
      );
    } else if (t.startsWith("•") || t.match(/^[-*]\s/)) {
      const c = t.replace(/^[•\-\*]\s*/, "");
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "flex-start" }}>
          <span style={{ color: "#999", fontSize: 12, flexShrink: 0, marginTop: 2 }}>•</span>
          <span style={{ fontSize: 12, color: "#aaa", lineHeight: 1.65 }}>{formatInline(c)}</span>
        </div>
      );
    } else {
      elements.push(<div key={key++} style={{ fontSize: 12, color: "#999", lineHeight: 1.7, marginBottom: 5 }}>{formatInline(t)}</div>);
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
  if (data.error) return (
    <div style={{ background: "#0f0f14", border: "1px solid #222", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
      <span style={{ fontFamily: "monospace", color: "#aaa" }}>{data.ticker}</span>
      <span style={{ fontSize: 12, color: "#ff1744", marginLeft: 12 }}>Error: {data.error}</span>
    </div>
  );
  return (
    <div style={{ background: "#08080d", border: `1px solid ${cfg.border}`, borderRadius: 14, marginBottom: 16, overflow: "hidden", boxShadow: `0 0 40px ${cfg.glow}` }}>
      <div style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.border}`, padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 2 }}>{data.ticker}</div>
            {pi.name && pi.name !== data.ticker && <div style={{ fontSize: 10, color: "#bbb", marginTop: 1 }}>{pi.name}</div>}
          </div>
          <div style={{ fontSize: 24, fontFamily: "'Space Mono', monospace", fontWeight: 700, color: cfg.color, textShadow: `0 0 20px ${cfg.color}44` }}>{parsed.rec || "—"}</div>
          {parsed.conviction && <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 5, padding: "3px 10px" }}>
            <div style={{ fontSize: 8, color: "#999", fontFamily: "monospace" }}>CONVICTION</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: CONV_COLORS[parsed.conviction] || "#ccc", fontFamily: "monospace" }}>{parsed.conviction}</div>
          </div>}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {pi.price && <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>${typeof pi.price === "number" ? pi.price.toFixed(2) : pi.price}</div>
            {pi.change_pct != null && <div style={{ fontSize: 10, color: pi.change_pct >= 0 ? "#00e676" : "#ff1744", fontFamily: "monospace" }}>{pi.change_pct >= 0 ? "▲" : "▼"} {Math.abs(typeof pi.change_pct === "number" ? pi.change_pct.toFixed(2) : pi.change_pct)}%</div>}
          </div>}
          {pos.position_value && <div style={{ textAlign: "right", borderLeft: "1px solid #2a2a2a", paddingLeft: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>${pos.position_value.toLocaleString()}</div>
            {pos.gain_loss != null && <div style={{ fontSize: 10, color: isGain ? "#00e676" : "#ff1744", fontFamily: "monospace" }}>{isGain ? "+" : ""}${pos.gain_loss.toLocaleString()} ({isGain ? "+" : ""}{pos.gain_loss_pct}%)</div>}
          </div>}
        </div>
      </div>
      <div style={{ padding: "8px 22px", borderBottom: "1px solid #1e1e24", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pos.shares > 0 && <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 4, padding: "4px 8px" }}><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>SHARES</div><div style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>{pos.shares}</div></div>}
        {pos.cost_basis > 0 && <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 4, padding: "4px 8px" }}><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>COST</div><div style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>${pos.cost_basis}</div></div>}
        {pi.week52_high && <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 4, padding: "4px 8px" }}><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>52W HI</div><div style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>{pi.week52_high}</div></div>}
        {pi.week52_low && <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 4, padding: "4px 8px" }}><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>52W LO</div><div style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>{pi.week52_low}</div></div>}
        {data.fundamentals?.analyst_rating && <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 4, padding: "4px 8px" }}><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>ANALYST</div><div style={{ fontSize: 11, color: "#ffd740", fontFamily: "monospace" }}>{data.fundamentals.analyst_rating.toUpperCase()}</div></div>}
        {data.fundamentals?.target_mean && <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 4, padding: "4px 8px" }}><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>TARGET</div><div style={{ fontSize: 11, color: "#00e676", fontFamily: "monospace" }}>${data.fundamentals.target_mean}</div></div>}
      </div>
      <div style={{ padding: "8px 22px", borderBottom: "1px solid #1e1e24" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "#00e676", fontFamily: "monospace" }}>▲ {data.sentiment?.bull_pct}% BULL</span>
          <span style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>{data.sentiment?.total} MESSAGES</span>
          <span style={{ fontSize: 9, color: "#ff1744", fontFamily: "monospace" }}>BEAR {data.sentiment?.bear_pct}% ▼</span>
        </div>
        <div style={{ height: 2, background: "#111", display: "flex", overflow: "hidden", borderRadius: 1 }}>
          <div style={{ width: `${data.sentiment?.bull_pct}%`, background: "#00e676" }} />
          <div style={{ width: `${data.sentiment?.bear_pct}%`, background: "#ff1744" }} />
        </div>
      </div>
      {summary.length > 0 && (
        <div style={{ margin: "14px 22px 0", padding: "12px 16px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: cfg.color, fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>▸ KEY TAKEAWAYS</div>
          {summary.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5, alignItems: "flex-start" }}>
              <span style={{ color: cfg.color, fontSize: 10, flexShrink: 0, marginTop: 3 }}>▸</span>
              <span style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>{line}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 10, fontFamily: "monospace", padding: "10px 22px", width: "100%", textAlign: "left", letterSpacing: 0.5 }}>
        {expanded ? "▲ HIDE FULL REPORT" : "▼ SHOW FULL RESEARCH REPORT"}
      </button>
      {expanded && <div style={{ padding: "0 22px 22px" }}>{renderReport(data.ai?.recommendation)}</div>}
      <div style={{ padding: "6px 22px", borderTop: "1px solid #2a2a2a", fontSize: 9, color: "#999", fontFamily: "monospace" }}>⚠ NOT FINANCIAL ADVICE</div>
    </div>
  );
}

function PortfolioSummary({ results, fearGreed }) {
  if (!results.length) return null;
  const withValues = results.filter(r => r.position?.position_value);
  const totalValue = withValues.reduce((s, r) => s + (r.position?.position_value || 0), 0);
  const totalCost = withValues.reduce((s, r) => s + (r.position?.cost_total || 0), 0);
  const totalGL = totalValue - totalCost;
  const totalGLPct = totalCost > 0 ? Math.round((totalGL / totalCost) * 1000) / 10 : null;
  const recs = results.map(r => parseRec(r.ai?.recommendation || "").rec).filter(Boolean);
  const recCounts = recs.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
  return (
    <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>PORTFOLIO SUMMARY</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {totalValue > 0 && <div><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>TOTAL VALUE</div><div style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>${totalValue.toLocaleString()}</div></div>}
            {totalGL !== 0 && <div><div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>TOTAL GAIN/LOSS</div><div style={{ fontSize: 20, fontWeight: 700, color: totalGL >= 0 ? "#00e676" : "#ff1744", fontFamily: "monospace" }}>{totalGL >= 0 ? "+" : ""}${totalGL.toLocaleString()} {totalGLPct != null ? `(${totalGL >= 0 ? "+" : ""}${totalGLPct}%)` : ""}</div></div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {Object.entries(recCounts).map(([rec, count]) => {
            const cfg = REC_CONFIG[rec] || REC_CONFIG["WATCH"];
            return <div key={rec} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 6, padding: "5px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color, fontFamily: "monospace" }}>{count}</div>
              <div style={{ fontSize: 8, color: cfg.color, fontFamily: "monospace", opacity: 0.7 }}>{rec}</div>
            </div>;
          })}
          {fearGreed && <div style={{ background: "#060608", border: "1px solid #2a2a2a", borderRadius: 6, padding: "5px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: FEAR_COLORS[fearGreed.rating] || "#ffd740", fontFamily: "monospace" }}>{fearGreed.score}</div>
            <div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace" }}>FEAR/GREED</div>
          </div>}
        </div>
      </div>
    </div>
  );
}

function SectorCard({ sector_data }) {
  const [expanded, setExpanded] = useState(false);
  const label = SECTOR_LABELS[sector_data.sector] || sector_data.sector;
  const top = sector_data.opportunities[0];
  const score = sector_data.top_score;
  const scoreColor = score >= 40 ? "#00e676" : score >= 20 ? "#ffd740" : "#aaa";

  return (
    <div style={{ background: "#08080d", border: "1px solid #2a2a2a", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0", fontFamily: "'Space Mono', monospace" }}>{label}</div>
          <div style={{ background: "#0a0a0f", border: `1px solid ${scoreColor}44`, borderRadius: 5, padding: "3px 10px" }}>
            <span style={{ fontSize: 10, color: scoreColor, fontFamily: "monospace" }}>OPP SCORE: {score}</span>
          </div>
          <span style={{ fontSize: 11, color: "#777", fontFamily: "monospace" }}>{sector_data.opportunities.length} stocks scanned</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sector_data.opportunities.slice(0, 5).map(o => (
            <div key={o.ticker} style={{ background: "#0f0f14", border: "1px solid #2a2a2a", borderRadius: 4, padding: "3px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>{o.ticker}</div>
              <div style={{ fontSize: 9, color: o.pct_from_high < -30 ? "#00e676" : "#aaa", fontFamily: "monospace" }}>{o.pct_from_high}%</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 10, fontFamily: "monospace", padding: "10px 20px", width: "100%", textAlign: "left", letterSpacing: 0.5 }}>
        {expanded ? "▲ HIDE AI ANALYSIS" : "▼ SHOW AI OPPORTUNITY ANALYSIS"}
      </button>
      {expanded && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace", marginBottom: 8, letterSpacing: 1 }}>TOP STOCKS BY OPPORTUNITY SCORE</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sector_data.opportunities.map(o => (
                <div key={o.ticker} style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 6, padding: "8px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>{o.ticker}</div>
                  <div style={{ fontSize: 10, color: "#e0e0e0", fontFamily: "monospace" }}>${o.price}</div>
                  <div style={{ fontSize: 9, color: o.pct_from_high < -30 ? "#00e676" : "#ccc", fontFamily: "monospace" }}>{o.pct_from_high}% from hi</div>
                  <div style={{ fontSize: 9, color: o.vol_ratio > 1.5 ? "#ffd740" : "#aaa", fontFamily: "monospace" }}>{o.vol_ratio}x vol</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid #222", paddingTop: 14 }}>
            <div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace", marginBottom: 10, letterSpacing: 1 }}>AI OPPORTUNITY ANALYSIS</div>
            {renderScanAnalysis(sector_data.ai_analysis)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [portfolio, setPortfolio] = useState(loadPortfolio);
  const [newTicker, setNewTicker] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCost, setNewCost] = useState("");
  const [results, setResults] = useState([]);
  const [fearGreed, setFearGreed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [error, setError] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);

  const addPosition = () => {
    if (!newTicker.trim()) return;
    const pos = { ticker: newTicker.toUpperCase().trim(), shares: parseFloat(newShares) || 0, cost_basis: parseFloat(newCost) || 0 };
    const updated = [...portfolio.filter(p => p.ticker !== pos.ticker), pos];
    setPortfolio(updated); savePortfolio(updated);
    setNewTicker(""); setNewShares(""); setNewCost("");
  };

  const removePosition = (ticker) => {
    const updated = portfolio.filter(p => p.ticker !== ticker);
    setPortfolio(updated); savePortfolio(updated);
  };

  const runResearch = async () => {
    if (!portfolio.length) return;
    setLoading(true); setError(null); setResults([]);
    try {
      const tickers = portfolio.map(p => p.ticker).join(",");
      const shares = portfolio.map(p => p.shares).join(",");
      const costs = portfolio.map(p => p.cost_basis).join(",");
      const resp = await fetch(`${BACKEND_URL}/portfolio?tickers=${encodeURIComponent(tickers)}&shares=${encodeURIComponent(shares)}&costs=${encodeURIComponent(costs)}`);
      const data = await resp.json();
      setResults(data.results || []); setFearGreed(data.fear_greed); setLastRun(new Date().toLocaleTimeString());
    } catch { setError("Cannot reach backend."); }
    finally { setLoading(false); }
  };

  const runScan = async () => {
    setScanning(true); setScanError(null); setScanResults(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/scan/opportunities`);
      const data = await resp.json();
      setScanResults(data);
    } catch { setScanError("Cannot reach backend."); }
    finally { setScanning(false); }
  };

  const tabStyle = (t) => ({
    background: tab === t ? "#0f0f14" : "none",
    border: `1px solid ${tab === t ? "#777" : "#555"}`,
    color: tab === t ? "#e0e0e0" : "#999",
    borderRadius: 6, padding: "8px 20px", fontSize: 11,
    cursor: "pointer", fontFamily: "monospace", letterSpacing: 0.5,
    transition: "all 0.15s"
  });

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#e0e0e0", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e1e24", padding: "16px 32px", background: "#040406", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: 2 }}>AI TRADING ADVISOR</div>
          <div style={{ fontSize: 9, color: "#999", marginTop: 2, letterSpacing: 1, fontFamily: "monospace" }}>PORTFOLIO RESEARCH · OPPORTUNITY SCANNER · AI RECOMMENDATIONS</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={tabStyle("portfolio")} onClick={() => setTab("portfolio")}>📊 MY PORTFOLIO</button>
          <button style={tabStyle("scanner")} onClick={() => setTab("scanner")}>🔍 OPPORTUNITY SCANNER</button>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 20px" }}>

        {/* PORTFOLIO TAB */}
        {tab === "portfolio" && (
          <>
            <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 12, padding: "18px 22px", marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: "#bbb", fontFamily: "monospace", letterSpacing: 1, marginBottom: 12 }}>ADD POSITION</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addPosition()} placeholder="TICKER" maxLength={8}
                  style={{ width: 90, background: "#060608", border: "1px solid #2a2a2a", borderRadius: 6, padding: "9px 10px", color: "#e0e0e0", fontSize: 13, fontFamily: "'Space Mono', monospace", outline: "none", letterSpacing: 2 }} />
                <input value={newShares} onChange={e => setNewShares(e.target.value)} placeholder="Shares (opt)" type="number"
                  style={{ width: 140, background: "#060608", border: "1px solid #2a2a2a", borderRadius: 6, padding: "9px 10px", color: "#e0e0e0", fontSize: 12, outline: "none" }} />
                <input value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="Cost/share (opt)" type="number"
                  style={{ width: 160, background: "#060608", border: "1px solid #2a2a2a", borderRadius: 6, padding: "9px 10px", color: "#e0e0e0", fontSize: 12, outline: "none" }} />
                <button onClick={addPosition} disabled={!newTicker.trim()} style={{ background: newTicker.trim() ? "linear-gradient(135deg, #00e676, #1de9b6)" : "#111", border: "none", borderRadius: 6, padding: "9px 18px", color: newTicker.trim() ? "#000" : "#777", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>+ ADD</button>
              </div>
              {portfolio.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 9, color: "#aaa", fontFamily: "monospace", marginBottom: 6 }}>YOUR HOLDINGS ({portfolio.length})</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {portfolio.map(p => (
                      <div key={p.ticker} style={{ background: "#0f0f14", border: "1px solid #2a2a2a", borderRadius: 5, padding: "5px 10px", display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#e0e0e0", fontWeight: 700 }}>{p.ticker}</span>
                        {p.shares > 0 && <span style={{ fontSize: 11, color: "#bbb" }}>{p.shares} sh</span>}
                        {p.cost_basis > 0 && <span style={{ fontSize: 10, color: "#777" }}>@${p.cost_basis}</span>}
                        <button onClick={() => removePosition(p.ticker)} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {portfolio.length > 0 && (
              <div style={{ textAlign: "center", marginBottom: 22 }}>
                <button onClick={runResearch} disabled={loading} style={{ background: loading ? "#111" : "linear-gradient(135deg, #00e676, #1de9b6)", border: "none", borderRadius: 10, padding: "14px 40px", color: loading ? "#777" : "#000", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Space Mono', monospace", letterSpacing: 1, boxShadow: loading ? "none" : "0 0 30px rgba(0,230,118,0.2)" }}>
                  {loading ? "RUNNING DEEP RESEARCH..." : `🔬 RUN DAILY RESEARCH (${portfolio.length} holdings)`}
                </button>
                {lastRun && <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace", marginTop: 6 }}>LAST RUN: {lastRun}</div>}
                {error && <div style={{ color: "#ff1744", fontSize: 11, fontFamily: "monospace", marginTop: 8 }}>{error}</div>}
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <div style={{ fontSize: 11, color: "#777", fontFamily: "monospace", marginBottom: 12, letterSpacing: 1 }}>ANALYZING {portfolio.length} HOLDINGS — 1-2 MINUTES...</div>
                <div style={{ width: 240, height: 2, background: "#0f0f14", margin: "0 auto", overflow: "hidden", borderRadius: 2 }}>
                  <div style={{ width: "40%", height: "100%", background: "linear-gradient(90deg, #00e676, #1de9b6)", animation: "slide 1.5s ease-in-out infinite" }} />
                </div>
                <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
              </div>
            )}

            {results.length > 0 && <><PortfolioSummary results={results} fearGreed={fearGreed} />{results.map(item => <PositionCard key={item.ticker} data={item} />)}</>}

            {portfolio.length === 0 && <div style={{ textAlign: "center", padding: "50px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 13, color: "#bbb", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>ADD YOUR HOLDINGS ABOVE</div>
              <div style={{ fontSize: 10, color: "#aaa", lineHeight: 2, fontFamily: "monospace" }}>Then click RUN DAILY RESEARCH for deep AI analysis on all positions</div>
            </div>}
          </>
        )}

        {/* OPPORTUNITY SCANNER TAB */}
        {tab === "scanner" && (
          <>
            <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "'Space Mono', monospace", fontWeight: 700, marginBottom: 6 }}>NEXT SNDK FINDER</div>
              <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.7, marginBottom: 16 }}>
                Scans 100+ stocks across 11 sectors — energy, biotech, defense, industrials, shipping, commodities, overlooked tech, and more. Identifies deep value, reversal setups, unusual volume, and opportunities the market is ignoring.
              </div>
              <button onClick={runScan} disabled={scanning} style={{ background: scanning ? "#111" : "linear-gradient(135deg, #00e676, #1de9b6)", border: "none", borderRadius: 8, padding: "12px 32px", color: scanning ? "#777" : "#000", fontSize: 12, fontWeight: 700, cursor: scanning ? "not-allowed" : "pointer", fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>
                {scanning ? "SCANNING 80+ STOCKS..." : "🔍 SCAN ALL SECTORS"}
              </button>
              {scanError && <div style={{ color: "#ff1744", fontSize: 11, fontFamily: "monospace", marginTop: 8 }}>{scanError}</div>}
            </div>

            {scanning && (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 11, color: "#777", fontFamily: "monospace", marginBottom: 12, letterSpacing: 1 }}>SCANNING 10 SECTORS · AI ANALYZING OPPORTUNITIES...</div>
                <div style={{ width: 260, height: 2, background: "#0f0f14", margin: "0 auto", overflow: "hidden", borderRadius: 2 }}>
                  <div style={{ width: "35%", height: "100%", background: "linear-gradient(90deg, #00e676, #1de9b6)", animation: "slide 1.5s ease-in-out infinite" }} />
                </div>
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 10, fontFamily: "monospace" }}>This takes 2-3 minutes — scanning energy, biotech, defense, shipping, commodities...</div>
              </div>
            )}

            {scanResults && (
              <>
                <div style={{ background: "#0a0a0f", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 18px", marginBottom: 18, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace" }}>{scanResults.total_scanned} STOCKS SCANNED ACROSS {scanResults.sectors?.length} SECTORS</div>
                  {scanResults.fear_greed && <div style={{ fontSize: 11, color: FEAR_COLORS[scanResults.fear_greed.rating] || "#ffd740", fontFamily: "monospace" }}>MARKET: {scanResults.fear_greed.rating} ({scanResults.fear_greed.score})</div>}
                </div>
                {scanResults.sectors?.map(s => <SectorCard key={s.sector} sector_data={s} />)}
              </>
            )}

            {!scanResults && !scanning && (
              <div style={{ textAlign: "center", padding: "50px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 13, color: "#bbb", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>FIND THE NEXT SNDK</div>
                <div style={{ fontSize: 10, color: "#aaa", lineHeight: 2, fontFamily: "monospace" }}>
                  ENERGY · BIOTECH · DEFENSE · INDUSTRIALS · SHIPPING<br />
                  COMMODITIES · DEEP VALUE · SPIN-OFFS · FINANCIALS · HEALTHCARE
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
