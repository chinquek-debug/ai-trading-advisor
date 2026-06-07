import { useState } from "react";

const BACKEND_URL = "https://ai-trading-advisor-xx7b.onrender.com";

const REC_CONFIG = {
  BUY:   { color: "#00e676", bg: "rgba(0,230,118,0.08)", border: "rgba(0,230,118,0.25)", glow: "rgba(0,230,118,0.12)" },
  SELL:  { color: "#ff1744", bg: "rgba(255,23,68,0.08)",  border: "rgba(255,23,68,0.25)",  glow: "rgba(255,23,68,0.12)" },
  HOLD:  { color: "#ffd740", bg: "rgba(255,215,64,0.08)", border: "rgba(255,215,64,0.25)", glow: "rgba(255,215,64,0.12)" },
  WATCH: { color: "#40c4ff", bg: "rgba(64,196,255,0.08)", border: "rgba(64,196,255,0.25)", glow: "rgba(64,196,255,0.12)" },
};

const FEAR_COLORS = {
  "Extreme Fear": "#ff1744", "Fear": "#ff6d00",
  "Neutral": "#ffd740", "Greed": "#76ff03", "Extreme Greed": "#00e676"
};

function parseRec(text) {
  if (!text) return {};
  const rec = (text.match(/RECOMMENDATION[:\s]*\[?(BUY|SELL|HOLD|WATCH)\]?/i) || [])[1]?.toUpperCase();
  const conviction = (text.match(/CONVICTION[:\s]*\[?(HIGH|MEDIUM|LOW)\]?/i) || [])[1]?.toUpperCase();
  return { rec, conviction };
}

function parseSummary(text) {
  if (!text) return [];
  const match = text.match(/\*\*SUMMARY\*\*([\s\S]*?)(?=\n##|\n\*\*[A-Z][A-Z])/);
  if (!match) return [];
  return match[1].trim().split("\n")
    .map(l => l.trim().replace(/^[•\-\*]\s*/, "").replace(/\*\*/g, ""))
    .filter(l => l.length > 5);
}

function formatInline(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: "#ccc", fontWeight: 600 }}>{part}</strong>
      : part
  );
}

function renderReport(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let key = 0;
  let pastSummary = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t === "--" || t === "---") {
      elements.push(<div key={key++} style={{ height: 6 }} />);
      continue;
    }

    // Skip summary section — shown separately
    if (t.match(/^\*\*SUMMARY\*\*$/)) { pastSummary = false; continue; }
    if (!pastSummary && t.match(/^##\s/)) pastSummary = true;
    if (!pastSummary) continue;

    // ## headers
    if (t.startsWith("## ") || t.startsWith("# ")) {
      const h = t.replace(/^#+\s*/, "");
      elements.push(
        <div key={key++} style={{ fontSize: 11, fontWeight: 700, color: "#555", fontFamily: "monospace", letterSpacing: 1.5, marginTop: 24, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #111", textTransform: "uppercase" }}>
          {h}
        </div>
      );
    }
    // **Heading** whole line
    else if (t.startsWith("**") && t.endsWith("**") && t.slice(2, -2).indexOf("**") === -1) {
      const h = t.replace(/\*\*/g, "");
      if (h.match(/^(RECOMMENDATION|CONVICTION|Date):/i)) continue;
      elements.push(
        <div key={key++} style={{ fontSize: 11, fontWeight: 700, color: "#555", fontFamily: "monospace", letterSpacing: 1.5, marginTop: 20, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #111", textTransform: "uppercase" }}>
          {h}
        </div>
      );
    }
    // Bullet
    else if (t.startsWith("•") || t.match(/^[-*]\s/)) {
      const c = t.replace(/^[•\-\*]\s*/, "");
      const isRisk = /risk|downside|concern|warning|danger/i.test(c);
      const isBull = /upside|growth|positive|bull|opportunity/i.test(c);
      const dot = isRisk ? "#ff1744" : isBull ? "#00e676" : "#444";
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
          <span style={{ color: dot, fontSize: 14, lineHeight: 1.5, flexShrink: 0, marginTop: 2 }}>•</span>
          <span style={{ fontSize: 13, color: "#888", lineHeight: 1.7 }}>{formatInline(c)}</span>
        </div>
      );
    }
    // Numbered list
    else if (t.match(/^\d+\.\s/)) {
      const num = t.match(/^\d+/)[0];
      const c = t.replace(/^\d+\.\s*/, "");
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
          <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace", flexShrink: 0, marginTop: 3 }}>{num}.</span>
          <span style={{ fontSize: 13, color: "#888", lineHeight: 1.7 }}>{formatInline(c)}</span>
        </div>
      );
    }
    // Paragraph
    else {
      elements.push(
        <div key={key++} style={{ fontSize: 13, color: "#666", lineHeight: 1.75, marginBottom: 6 }}>{formatInline(t)}</div>
      );
    }
  }
  return elements;
}

function StatPill({ label, value, highlight }) {
  if (!value || value === "N/A" || value === null) return null;
  return (
    <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 6, padding: "8px 12px", minWidth: 90 }}>
      <div style={{ fontSize: 9, color: "#333", fontFamily: "monospace", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: highlight || "#e0e0e0", fontFamily: "monospace" }}>{String(value)}</div>
    </div>
  );
}

function RecommendationCard({ data, onRemove }) {
  const parsed = parseRec(data.ai?.recommendation || "");
  const summary = parseSummary(data.ai?.recommendation || "");
  const cfg = REC_CONFIG[parsed.rec] || REC_CONFIG.WATCH;
  const pi = data.price_info || {};
  const convColors = { HIGH: "#00e676", MEDIUM: "#ffd740", LOW: "#ff6d00" };

  if (data.ai?.error) {
    return (
      <div style={{ background: "#0f0f14", border: "1px solid #2a2a2a", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "monospace", fontSize: 20, color: "#555" }}>{data.ticker}</span>
          <button onClick={onRemove} style={{ background: "none", border: "none", color: "#333", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#ff1744", marginTop: 8 }}>Error: {data.ai.error}</div>
      </div>
    );
  }

  return (
    <div style={{ background: "#08080d", border: `1px solid ${cfg.border}`, borderRadius: 14, marginBottom: 20, overflow: "hidden", boxShadow: `0 0 60px ${cfg.glow}` }}>

      {/* Header */}
      <div style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.border}`, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: 3 }}>{data.ticker}</div>
            {pi.name && pi.name !== data.ticker && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{pi.name}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 36, fontFamily: "'Space Mono', monospace", fontWeight: 700, color: cfg.color, letterSpacing: 2, textShadow: `0 0 30px ${cfg.color}55` }}>
              {parsed.rec || "—"}
            </div>
            {parsed.conviction && (
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "4px 12px" }}>
                <div style={{ fontSize: 9, color: "#444", fontFamily: "monospace", marginBottom: 2 }}>CONVICTION</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: convColors[parsed.conviction] || "#888", fontFamily: "monospace" }}>{parsed.conviction}</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {pi.price && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>${typeof pi.price === "number" ? pi.price.toFixed(2) : pi.price}</div>
              {pi.change_pct != null && (
                <div style={{ fontSize: 13, color: pi.change_pct >= 0 ? "#00e676" : "#ff1744", fontFamily: "monospace" }}>
                  {pi.change_pct >= 0 ? "▲" : "▼"} {Math.abs(typeof pi.change_pct === "number" ? pi.change_pct.toFixed(2) : pi.change_pct)}%
                </div>
              )}
            </div>
          )}
          <button onClick={onRemove} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ padding: "14px 28px", borderBottom: "1px solid #0f0f14", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatPill label="52W HIGH" value={pi.week52_high} />
        <StatPill label="52W LOW" value={pi.week52_low} />
        <StatPill label="P/E" value={data.fundamentals?.pe_ratio} />
        <StatPill label="FWD P/E" value={data.fundamentals?.forward_pe} />
        <StatPill label="BETA" value={data.fundamentals?.beta} />
        <StatPill label="ANALYST TARGET" value={data.fundamentals?.target_mean} highlight="#00e676" />
        <StatPill label="ANALYST RATING" value={data.fundamentals?.analyst_rating?.toUpperCase()} highlight="#ffd740" />
        <StatPill label="SHORT RATIO" value={data.fundamentals?.short_ratio} />
        <StatPill label="REV GROWTH" value={data.fundamentals?.revenue_growth} />
      </div>

      {/* Sentiment bar */}
      <div style={{ padding: "12px 28px", borderBottom: "1px solid #0f0f14" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: "#00e676", fontFamily: "monospace" }}>▲ {data.sentiment?.bull_pct}% BULL</span>
          <span style={{ fontSize: 10, color: "#333", fontFamily: "monospace" }}>{data.sentiment?.total} STOCKTWITS MESSAGES</span>
          <span style={{ fontSize: 10, color: "#ff1744", fontFamily: "monospace" }}>BEAR {data.sentiment?.bear_pct}% ▼</span>
        </div>
        <div style={{ height: 3, background: "#111", borderRadius: 2, display: "flex", overflow: "hidden" }}>
          <div style={{ width: `${data.sentiment?.bull_pct}%`, background: "#00e676" }} />
          <div style={{ width: `${data.sentiment?.bear_pct}%`, background: "#ff1744" }} />
        </div>
      </div>

      {/* Key Takeaways */}
      {summary.length > 0 && (
        <div style={{ margin: "20px 28px 0", padding: "16px 20px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: cfg.color, fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>▸ KEY TAKEAWAYS</div>
          {summary.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
              <span style={{ color: cfg.color, fontSize: 11, flexShrink: 0, marginTop: 3 }}>▸</span>
              <span style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Full report */}
      <div style={{ padding: "24px 28px" }}>
        {renderReport(data.ai?.recommendation)}
      </div>

      <div style={{ padding: "12px 28px", borderTop: "1px solid #0a0a0a", fontSize: 10, color: "#1a1a1a", fontFamily: "monospace" }}>
        ⚠ NOT FINANCIAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY
      </div>
    </div>
  );
}

export default function AITradingAdvisor() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [fearGreed, setFearGreed] = useState(null);
  const [error, setError] = useState(null);

  const analyze = async (t) => {
    const sym = (t || ticker).toUpperCase().trim();
    if (!sym || loading) return;
    setLoading(sym);
    setError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/analyze/${sym}`);
      const data = await resp.json();
      if (data.fear_greed) setFearGreed(data.fear_greed);
      setResults(prev => {
        const idx = prev.findIndex(r => r.ticker === sym);
        if (idx >= 0) { const u = [...prev]; u[idx] = data; return u; }
        return [data, ...prev];
      });
    } catch {
      setError("Cannot reach backend.");
    } finally {
      setLoading(false);
      setTicker("");
    }
  };

  const QUICK = ["SPY", "NVDA", "TSLA", "AAPL", "HBAN", "AMD", "META", "PLTR", "AMZN", "XRP-USD"];

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#e0e0e0", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

      <div style={{ borderBottom: "1px solid #0f0f14", padding: "18px 32px", background: "#040406", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: 2 }}>AI TRADING ADVISOR</div>
          <div style={{ fontSize: 10, color: "#2a2a2a", marginTop: 3, letterSpacing: 1, fontFamily: "monospace" }}>DEEP RESEARCH · SENTIMENT · FUNDAMENTALS · AI RECOMMENDATION</div>
        </div>
        {fearGreed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 8, padding: "8px 16px" }}>
            <span style={{ fontSize: 9, color: "#333", fontFamily: "monospace", letterSpacing: 1 }}>FEAR & GREED</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: FEAR_COLORS[fearGreed.rating] || "#ffd740", fontFamily: "monospace" }}>{fearGreed.score}</span>
            <span style={{ fontSize: 11, color: FEAR_COLORS[fearGreed.rating] || "#ffd740" }}>{fearGreed.rating}</span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>

        <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "22px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#333", fontFamily: "monospace", letterSpacing: 1, marginBottom: 12 }}>ENTER ANY TICKER FOR DEEP AI ANALYSIS</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && analyze()}
              placeholder="AAPL, NVDA, XRP-USD..."
              maxLength={8}
              style={{ flex: 1, minWidth: 180, background: "#060608", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 16px", color: "#e0e0e0", fontSize: 16, fontFamily: "'Space Mono', monospace", outline: "none", letterSpacing: 2 }}
            />
            <button onClick={() => analyze()} disabled={!!loading || !ticker.trim()} style={{
              background: ticker.trim() && !loading ? "linear-gradient(135deg, #00e676, #1de9b6)" : "#111",
              border: "none", borderRadius: 8, padding: "12px 28px",
              color: ticker.trim() && !loading ? "#000" : "#333",
              fontSize: 13, fontWeight: 700, cursor: ticker.trim() ? "pointer" : "not-allowed",
              fontFamily: "'Space Mono', monospace", letterSpacing: 1
            }}>
              {loading ? "ANALYZING..." : "ANALYZE →"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {QUICK.map(t => (
              <button key={t} onClick={() => analyze(t)} disabled={!!loading} style={{
                background: "none", border: "1px solid #1a1a1a", borderRadius: 4,
                padding: "3px 10px", color: "#333", fontSize: 10,
                cursor: "pointer", fontFamily: "monospace"
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#333"; e.target.style.color = "#777"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#1a1a1a"; e.target.style.color = "#333"; }}
              >{t}</button>
            ))}
          </div>
        </div>

        {error && <div style={{ color: "#ff1744", fontSize: 12, fontFamily: "monospace", marginBottom: 16, padding: "10px 14px", background: "rgba(255,23,68,0.05)", borderRadius: 6 }}>⚠ {error}</div>}

        {loading && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontSize: 11, color: "#333", fontFamily: "monospace", letterSpacing: 2, marginBottom: 16 }}>RUNNING DEEP ANALYSIS ON {loading}...</div>
            <div style={{ width: 220, height: 2, background: "#0f0f14", borderRadius: 2, margin: "0 auto", overflow: "hidden" }}>
              <div style={{ width: "45%", height: "100%", background: "linear-gradient(90deg, #00e676, #1de9b6)", animation: "slide 1.2s ease-in-out infinite" }} />
            </div>
            <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(280%)}}`}</style>
            <div style={{ fontSize: 10, color: "#1a1a1a", marginTop: 12, fontFamily: "monospace" }}>Pulling price · fundamentals · sentiment · news → AI synthesis</div>
          </div>
        )}

        {results.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>🔬</div>
            <div style={{ fontSize: 14, color: "#222", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>DEEP RESEARCH ENGINE</div>
            <div style={{ fontSize: 11, color: "#1a1a1a", lineHeight: 2, fontFamily: "monospace" }}>
              PRICE · TECHNICALS · FUNDAMENTALS · SENTIMENT<br />
              ANALYST CONSENSUS · NEWS · BULL/BEAR CASE · TARGETS
            </div>
          </div>
        )}

        {results.map(item => (
          <RecommendationCard key={item.ticker} data={item} onRemove={() => setResults(prev => prev.filter(r => r.ticker !== item.ticker))} />
        ))}
      </div>
    </div>
  );
}
