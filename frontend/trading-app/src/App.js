import { useState } from "react";

const BACKEND_URL = "https://ai-trading-advisor-xx7b.onrender.com"; // UPDATE THIS AFTER DEPLOYING

const REC_CONFIG = {
  BUY:   { color: "#00e676", bg: "rgba(0,230,118,0.08)", border: "rgba(0,230,118,0.3)", glow: "rgba(0,230,118,0.15)" },
  SELL:  { color: "#ff1744", bg: "rgba(255,23,68,0.08)",  border: "rgba(255,23,68,0.3)",  glow: "rgba(255,23,68,0.15)" },
  HOLD:  { color: "#ffd740", bg: "rgba(255,215,64,0.08)", border: "rgba(255,215,64,0.3)", glow: "rgba(255,215,64,0.15)" },
  WATCH: { color: "#40c4ff", bg: "rgba(64,196,255,0.08)", border: "rgba(64,196,255,0.3)", glow: "rgba(64,196,255,0.15)" },
};

const CONVICTION_COLOR = { HIGH: "#00e676", MEDIUM: "#ffd740", LOW: "#ff6d00" };

const FEAR_COLORS = {
  "Extreme Fear": "#ff1744", "Fear": "#ff6d00",
  "Neutral": "#ffd740", "Greed": "#76ff03", "Extreme Greed": "#00e676"
};

function parseRecommendation(text) {
  if (!text) return {};
  const rec = (text.match(/\*\*RECOMMENDATION:\s*\[?(BUY|SELL|HOLD|WATCH)\]?\*\*/i) || [])[1]?.toUpperCase();
  const conviction = (text.match(/\*\*CONVICTION:\s*\[?(HIGH|MEDIUM|LOW)\]?\*\*/i) || [])[1]?.toUpperCase();
  const reasoning = (text.match(/\*\*REASONING\*\*\s*([\s\S]*?)(?=\*\*KEY RISK|\*\*PRICE|$)/i) || [])[1]?.trim();
  const risk = (text.match(/\*\*KEY RISK\*\*\s*([\s\S]*?)(?=\*\*PRICE TARGET|\*\*TIME|$)/i) || [])[1]?.trim();
  const target = (text.match(/\*\*PRICE TARGET\*\*\s*([\s\S]*?)(?=\*\*TIME HORIZON|$)/i) || [])[1]?.trim();
  const horizon = (text.match(/\*\*TIME HORIZON\*\*\s*([\s\S]*?)$/i) || [])[1]?.trim();
  return { rec, conviction, reasoning, risk, target, horizon };
}

function RecommendationCard({ data, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseRecommendation(data.ai?.recommendation);
  const cfg = REC_CONFIG[parsed.rec] || REC_CONFIG.WATCH;
  const price = data.price_info?.price;
  const change = data.price_info?.change_pct;
  const convColor = CONVICTION_COLOR[parsed.conviction] || "#888";

  if (data.ai?.error) {
    return (
      <div style={{ background: "#0f0f14", border: "1px solid #2a2a2a", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#555" }}>{data.ticker}</span>
          <button onClick={onRemove} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#ff1744", marginTop: 8 }}>⚠ {data.ai.error}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#0a0a0f",
      border: `1px solid ${cfg.border}`,
      borderRadius: 12,
      marginBottom: 16,
      overflow: "hidden",
      boxShadow: `0 0 40px ${cfg.glow}`,
      transition: "box-shadow 0.3s"
    }}>
      {/* Top bar */}
      <div style={{ background: cfg.bg, padding: "16px 24px", borderBottom: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: 2 }}>{data.ticker}</span>
          {data.price_info?.name && <span style={{ fontSize: 11, color: "#555" }}>{data.price_info.name}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {price && (
            <span style={{ fontFamily: "monospace", fontSize: 16, color: "#e0e0e0", fontWeight: 600 }}>
              ${typeof price === "number" ? price.toFixed(2) : price}
              {change !== undefined && (
                <span style={{ fontSize: 12, marginLeft: 8, color: change >= 0 ? "#00e676" : "#ff1744" }}>
                  {change >= 0 ? "+" : ""}{typeof change === "number" ? change.toFixed(2) : change}%
                </span>
              )}
            </span>
          )}
          <button onClick={onRemove} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      </div>

      {/* Recommendation hero */}
      <div style={{ padding: "24px", borderBottom: `1px solid #111` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{
            fontSize: 32, fontFamily: "'Space Mono', monospace", fontWeight: 700,
            color: cfg.color, letterSpacing: 3,
            textShadow: `0 0 20px ${cfg.color}66`
          }}>
            {parsed.rec || "ANALYZING"}
          </div>
          {parsed.conviction && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>CONVICTION</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: convColor, fontFamily: "monospace" }}>{parsed.conviction}</span>
            </div>
          )}
          {parsed.target && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>30-DAY TARGET</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", fontFamily: "monospace" }}>{parsed.target}</span>
            </div>
          )}
          {parsed.horizon && (
            <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", background: "#0f0f14", padding: "3px 10px", borderRadius: 4 }}>
              {parsed.horizon}
            </div>
          )}
        </div>

        {/* Sentiment bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "#00e676", fontFamily: "monospace" }}>▲ {data.sentiment?.bull_pct}% BULL</span>
            <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>{data.sentiment?.total} trader messages</span>
            <span style={{ fontSize: 10, color: "#ff1744", fontFamily: "monospace" }}>BEAR {data.sentiment?.bear_pct}% ▼</span>
          </div>
          <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2, display: "flex", overflow: "hidden" }}>
            <div style={{ width: `${data.sentiment?.bull_pct}%`, background: "#00e676" }} />
            <div style={{ width: `${data.sentiment?.bear_pct}%`, background: "#ff1744" }} />
          </div>
        </div>

        {/* Reasoning */}
        {parsed.reasoning && (
          <div style={{ fontSize: 13, color: "#888", lineHeight: 1.7, borderLeft: `2px solid ${cfg.color}44`, paddingLeft: 12 }}>
            {parsed.reasoning}
          </div>
        )}
      </div>

      {/* Expandable details */}
      <div style={{ padding: "0 24px" }}>
        <button onClick={() => setExpanded(!expanded)} style={{
          background: "none", border: "none", color: "#444", cursor: "pointer",
          fontSize: 11, fontFamily: "monospace", padding: "12px 0", width: "100%",
          textAlign: "left", letterSpacing: 0.5
        }}>
          {expanded ? "▲ HIDE DETAILS" : "▼ SHOW DETAILS (options flow, news, risk)"}
        </button>

        {expanded && (
          <div style={{ paddingBottom: 20 }}>
            {/* Options flow */}
            {data.options_flow?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginBottom: 8, letterSpacing: 1 }}>OPTIONS FLOW</div>
                {data.options_flow.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#666", fontFamily: "monospace", marginBottom: 4, padding: "4px 8px", background: "#0f0f14", borderRadius: 4 }}>
                    💰 {f}
                  </div>
                ))}
              </div>
            )}

            {/* News */}
            {data.headlines?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginBottom: 8, letterSpacing: 1 }}>LATEST NEWS</div>
                {data.headlines.map((h, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#555", marginBottom: 4, lineHeight: 1.5 }}>📰 {h}</div>
                ))}
              </div>
            )}

            {/* Risk */}
            {parsed.risk && (
              <div style={{ background: "rgba(255,23,68,0.04)", border: "1px solid rgba(255,23,68,0.15)", borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#ff1744", fontFamily: "monospace", marginBottom: 4 }}>⚠ KEY RISK</div>
                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>{parsed.risk}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AITradingAdvisor() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [fearGreed, setFearGreed] = useState(null);
  const [error, setError] = useState(null);

  const analyze = async (t) => {
    const sym = (t || ticker).toUpperCase().trim();
    if (!sym) return;
    setLoading(sym);
    setError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/analyze/${sym}`);
      const data = await resp.json();
      setResults(prev => {
        const exists = prev.findIndex(r => r.ticker === sym);
        if (exists >= 0) {
          const updated = [...prev];
          updated[exists] = data;
          return updated;
        }
        return [data, ...prev];
      });
    } catch {
      setError("Cannot reach backend. Check Railway is running.");
    } finally {
      setLoading(false);
      setTicker("");
    }
  };

  const scanMarket = async () => {
    setScanning(true);
    setError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/scan`);
      const data = await resp.json();
      setResults(data.results || []);
      setFearGreed(data.fear_greed);
    } catch {
      setError("Cannot reach backend. Check Railway is running.");
    } finally {
      setScanning(false);
    }
  };

  const remove = (ticker) => setResults(prev => prev.filter(r => r.ticker !== ticker));

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#e0e0e0", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f0f14", padding: "20px 32px", background: "#040406", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 2 }}>
            AI TRADING ADVISOR
          </div>
          <div style={{ fontSize: 11, color: "#333", marginTop: 3, letterSpacing: 1 }}>
            OPTIONS FLOW · SENTIMENT · NEWS · AI RECOMMENDATIONS
          </div>
        </div>
        {fearGreed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 8, padding: "8px 16px" }}>
            <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>FEAR & GREED</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: FEAR_COLORS[fearGreed.rating] || "#ffd740", fontFamily: "monospace" }}>{fearGreed.score}</span>
            <span style={{ fontSize: 11, color: FEAR_COLORS[fearGreed.rating] || "#ffd740" }}>{fearGreed.rating}</span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>

        {/* Input */}
        <div style={{ background: "#0a0a0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "24px", marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: "#444", fontFamily: "monospace", letterSpacing: 1, marginBottom: 14 }}>
            ANALYZE ANY TICKER — GET AI RECOMMENDATION
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && analyze()}
              placeholder="e.g. HBAN, XRP, NVDA, SPY..."
              maxLength={6}
              style={{ flex: 1, minWidth: 200, background: "#060608", border: "1px solid #222", borderRadius: 8, padding: "12px 16px", color: "#e0e0e0", fontSize: 16, fontFamily: "'Space Mono', monospace", outline: "none", letterSpacing: 2 }}
            />
            <button onClick={() => analyze()} disabled={!!loading || !ticker.trim()} style={{
              background: ticker.trim() ? "linear-gradient(135deg, #00e676, #1de9b6)" : "#111",
              border: "none", borderRadius: 8, padding: "12px 24px",
              color: ticker.trim() ? "#000" : "#333",
              fontSize: 13, fontWeight: 700, cursor: ticker.trim() ? "pointer" : "not-allowed",
              fontFamily: "'Space Mono', monospace", letterSpacing: 1,
              transition: "all 0.2s"
            }}>
              {loading ? "ANALYZING..." : "ANALYZE →"}
            </button>
            <button onClick={scanMarket} disabled={scanning} style={{
              background: "transparent", border: "1px solid #222", borderRadius: 8,
              padding: "12px 20px", color: scanning ? "#333" : "#666",
              fontSize: 12, cursor: scanning ? "not-allowed" : "pointer",
              fontFamily: "'Space Mono', monospace", letterSpacing: 0.5,
              transition: "all 0.2s"
            }}>
              {scanning ? "SCANNING..." : "📡 SCAN TOP 6"}
            </button>
          </div>

          {/* Quick picks */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {["SPY", "NVDA", "TSLA", "AAPL", "HBAN", "PLTR", "AMD", "META"].map(t => (
              <button key={t} onClick={() => analyze(t)} disabled={!!loading} style={{
                background: "none", border: "1px solid #1a1a1a", borderRadius: 5,
                padding: "4px 12px", color: "#444", fontSize: 11,
                cursor: "pointer", fontFamily: "monospace",
                transition: "all 0.15s"
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#333"; e.target.style.color = "#888"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#1a1a1a"; e.target.style.color = "#444"; }}
              >{t}</button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(255,23,68,0.05)", border: "1px solid rgba(255,23,68,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#ff1744", fontFamily: "monospace" }}>
            ⚠ {error}
          </div>
        )}

        {/* Loading state */}
        {(loading || scanning) && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 12, color: "#444", fontFamily: "monospace", marginBottom: 16, letterSpacing: 1 }}>
              {scanning ? "SCANNING MARKET & GENERATING AI RECOMMENDATIONS..." : `ANALYZING ${loading}...`}
            </div>
            <div style={{ width: 200, height: 2, background: "#0f0f14", borderRadius: 2, margin: "0 auto", overflow: "hidden" }}>
              <div style={{ width: "50%", height: "100%", background: "linear-gradient(90deg, #00e676, #1de9b6)", animation: "slide 1s ease-in-out infinite" }} />
            </div>
            <style>{`@keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(250%)} }`}</style>
            <div style={{ fontSize: 11, color: "#2a2a2a", marginTop: 12, fontFamily: "monospace" }}>
              Pulling options flow + sentiment + news → feeding to AI
            </div>
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !loading && !scanning && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
            <div style={{ fontSize: 16, color: "#333", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>READY TO ANALYZE</div>
            <div style={{ fontSize: 12, color: "#2a2a2a", lineHeight: 1.8 }}>
              Enter a ticker above or click "SCAN TOP 6"<br />
              AI will analyze options flow, trader sentiment,<br />
              and news — then give you a clear recommendation.
            </div>
          </div>
        )}

        {/* Results */}
        {results.map((item) => (
          <RecommendationCard key={item.ticker} data={item} onRemove={() => remove(item.ticker)} />
        ))}

        <div style={{ fontSize: 10, color: "#1a1a1a", textAlign: "center", marginTop: 32, fontFamily: "monospace", lineHeight: 1.8 }}>
          ⚠ NOT FINANCIAL ADVICE. AI recommendations are for informational purposes only.<br />
          Always do your own research before making investment decisions.
        </div>
      </div>
    </div>
  );
}
