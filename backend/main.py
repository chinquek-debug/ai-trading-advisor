from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import asyncio

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# Multiple sources - use whichever responds
async def get_price_data(ticker, client):
    """Try multiple free APIs for price data"""
    
    # Source 1: Yahoo Finance v8 chart (most data)
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "*/*",
            "Referer": "https://finance.yahoo.com"
        }
        resp = await client.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result = data.get("chart", {}).get("result", [None])[0]
            if result:
                meta = result.get("meta", {})
                closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
                volumes = result.get("indicators", {}).get("quote", [{}])[0].get("volume", [])
                valid_closes = [c for c in closes if c]
                valid_vols = [v for v in volumes if v]
                price = meta.get("regularMarketPrice") or meta.get("chartPreviousClose")
                prev = meta.get("chartPreviousClose") or meta.get("previousClose")
                chg = round((price - prev) / prev * 100, 2) if price and prev and prev != 0 else None
                return {
                    "price": round(price, 2) if price else None,
                    "change_pct": chg,
                    "week52_high": round(max(valid_closes), 2) if valid_closes else None,
                    "week52_low": round(min(valid_closes), 2) if valid_closes else None,
                    "avg_volume": int(sum(valid_vols)/len(valid_vols)) if valid_vols else None,
                    "current_volume": meta.get("regularMarketVolume"),
                    "market_cap": meta.get("marketCap"),
                    "source": "yahoo_v8"
                }
    except Exception as e:
        pass

    # Source 2: Yahoo Finance v7 quote
    try:
        url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={ticker}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = await client.get(url, headers=headers, timeout=8)
        if resp.status_code == 200:
            q = resp.json().get("quoteResponse", {}).get("result", [{}])[0]
            if q.get("regularMarketPrice"):
                price = q.get("regularMarketPrice")
                prev = q.get("regularMarketPreviousClose")
                chg = round((price - prev) / prev * 100, 2) if price and prev else None
                return {
                    "price": round(price, 2),
                    "change_pct": chg,
                    "week52_high": q.get("fiftyTwoWeekHigh"),
                    "week52_low": q.get("fiftyTwoWeekLow"),
                    "avg_volume": q.get("averageDailyVolume3Month"),
                    "current_volume": q.get("regularMarketVolume"),
                    "market_cap": q.get("marketCap"),
                    "source": "yahoo_v7"
                }
    except:
        pass

    # Source 3: Styvio free API (no key needed)
    try:
        url = f"https://styvio.com/api/stock/{ticker}"
        resp = await client.get(url, timeout=8)
        if resp.status_code == 200:
            d = resp.json()
            price = d.get("price") or d.get("currentPrice")
            if price:
                return {
                    "price": float(price),
                    "change_pct": d.get("changePercent"),
                    "week52_high": d.get("52WeekHigh"),
                    "week52_low": d.get("52WeekLow"),
                    "market_cap": d.get("marketCap"),
                    "source": "styvio"
                }
    except:
        pass

    return {"price": None, "source": "none"}

async def get_fundamentals(ticker, client):
    """Get fundamentals from Yahoo Finance quoteSummary"""
    try:
        modules = "summaryDetail,defaultKeyStatistics,financialData,recommendationTrend,upgradeDowngradeHistory"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Referer": "https://finance.yahoo.com/"
        }
        # Try both query1 and query2
        for host in ["query2", "query1"]:
            try:
                url = f"https://{host}.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules={modules}"
                resp = await client.get(url, headers=headers, timeout=12)
                if resp.status_code == 200:
                    data = resp.json()
                    result = data.get("quoteSummary", {}).get("result", [None])
                    if result and result[0]:
                        sd = result[0]
                        detail = sd.get("summaryDetail", {})
                        keystats = sd.get("defaultKeyStatistics", {})
                        findata = sd.get("financialData", {})
                        rec = sd.get("recommendationTrend", {}).get("trend", [{}])[0] if sd.get("recommendationTrend") else {}
                        upgrades = sd.get("upgradeDowngradeHistory", {}).get("history", [])[:4]

                        def v(d, k):
                            val = d.get(k, {})
                            if isinstance(val, dict):
                                return val.get("fmt") or val.get("raw")
                            return val

                        return {
                            "pe_ratio": v(detail, "trailingPE"),
                            "forward_pe": v(detail, "forwardPE"),
                            "dividend_yield": v(detail, "dividendYield"),
                            "beta": v(detail, "beta"),
                            "short_ratio": v(keystats, "shortRatio"),
                            "short_pct_float": v(keystats, "shortPercentOfFloat"),
                            "profit_margin": v(findata, "profitMargins"),
                            "operating_margin": v(findata, "operatingMargins"),
                            "debt_to_equity": v(findata, "debtToEquity"),
                            "return_on_equity": v(findata, "returnOnEquity"),
                            "revenue_growth": v(findata, "revenueGrowth"),
                            "earnings_growth": v(findata, "earningsGrowth"),
                            "free_cashflow": v(findata, "freeCashflow"),
                            "target_mean": v(findata, "targetMeanPrice"),
                            "target_low": v(findata, "targetLowPrice"),
                            "target_high": v(findata, "targetHighPrice"),
                            "analyst_rating": v(findata, "recommendationKey"),
                            "buy_count": (rec.get("strongBuy") or 0) + (rec.get("buy") or 0),
                            "hold_count": rec.get("hold") or 0,
                            "sell_count": (rec.get("sell") or 0) + (rec.get("strongSell") or 0),
                            "recent_upgrades": [f"{u.get('firm','')} → {u.get('toGrade','')} ({u.get('action','')})" for u in upgrades],
                        }
            except:
                continue
    except:
        pass
    return {}

async def get_news_and_name(ticker, client):
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={ticker}&newsCount=6&quotesCount=1"
        resp = await client.get(url, headers=headers, timeout=8)
        data = resp.json()
        quotes = data.get("quotes", [])
        name = (quotes[0].get("longname") or quotes[0].get("shortname", ticker)) if quotes else ticker
        headlines = [n.get("title", "") for n in data.get("news", [])[:6] if n.get("title")]
        return {"name": name, "headlines": headlines}
    except:
        return {"name": ticker, "headlines": []}

async def get_stocktwits(ticker, client):
    try:
        clean = ticker.replace("-USD", "").replace("/", ".")
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{clean}.json"
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=8)
        messages = resp.json().get("messages", [])
        bull, bear, samples = 0, 0, []
        for msg in messages[:30]:
            s = msg.get("entities", {}).get("sentiment", {})
            b = s.get("basic", "") if s else ""
            if b == "Bullish": bull += 1
            elif b == "Bearish": bear += 1
            if len(samples) < 5 and msg.get("body"):
                samples.append(msg["body"][:150])
        total = bull + bear or 1
        return {"bull_pct": round(bull/total*100), "bear_pct": round(bear/total*100), "total": len(messages), "samples": samples}
    except:
        return {"bull_pct": 50, "bear_pct": 50, "total": 0, "samples": []}

async def get_fear_greed(client):
    try:
        resp = await client.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", headers={"User-Agent": "Mozilla/5.0"}, timeout=8)
        fg = resp.json().get("fear_and_greed", {})
        return {"score": round(fg.get("score", 50)), "rating": fg.get("rating", "Neutral")}
    except:
        return {"score": 50, "rating": "Neutral"}

async def get_ai_rec(ticker, name, price_data, fundamentals, headlines, sentiment, fear_greed, client):
    if not ANTHROPIC_API_KEY:
        return {"error": "No ANTHROPIC_API_KEY set"}

    price = price_data.get("price")
    high = price_data.get("week52_high")
    low = price_data.get("week52_low")

    def pct_from(p, ref):
        try: return round((p - ref) / ref * 100, 1)
        except: return None

    from_high = pct_from(price, high) if price and high else None
    from_low = pct_from(price, low) if price and low else None
    analyst_upside = pct_from(price, fundamentals.get("target_mean")) if price and fundamentals.get("target_mean") else None

    headlines_str = "\n".join(f"- {h}" for h in headlines) or "- No recent headlines available"
    samples_str = "\n".join(f'- "{s}"' for s in sentiment.get("samples", [])) or "- No messages"
    upgrades_str = "\n".join(f"  - {u}" for u in fundamentals.get("recent_upgrades", [])) or "  - None"

    prompt = f"""You are a senior Wall Street analyst. Produce a thorough research report for {ticker} ({name}).

=== PRICE DATA (Source: {price_data.get('source', 'unknown')}) ===
- Current Price: ${price if price else 'UNAVAILABLE'}
- Today's Change: {price_data.get('change_pct', 'N/A')}%
- 52-Week High: ${high} ({from_high}% from high) 
- 52-Week Low: ${low} (+{from_low}% above low)
- Current Volume: {price_data.get('current_volume', 'N/A')}
- Avg Daily Volume: {price_data.get('avg_volume', 'N/A')}
- Market Cap: {price_data.get('market_cap', 'N/A')}

=== VALUATION ===
- P/E Ratio (TTM): {fundamentals.get('pe_ratio', 'N/A')}
- Forward P/E: {fundamentals.get('forward_pe', 'N/A')}
- Beta: {fundamentals.get('beta', 'N/A')}
- Dividend Yield: {fundamentals.get('dividend_yield', 'N/A')}
- Short % of Float: {fundamentals.get('short_pct_float', 'N/A')}
- Short Ratio: {fundamentals.get('short_ratio', 'N/A')}

=== FUNDAMENTALS ===
- Profit Margin: {fundamentals.get('profit_margin', 'N/A')}
- Operating Margin: {fundamentals.get('operating_margin', 'N/A')}
- Revenue Growth YoY: {fundamentals.get('revenue_growth', 'N/A')}
- Earnings Growth: {fundamentals.get('earnings_growth', 'N/A')}
- Return on Equity: {fundamentals.get('return_on_equity', 'N/A')}
- Debt-to-Equity: {fundamentals.get('debt_to_equity', 'N/A')}
- Free Cash Flow: {fundamentals.get('free_cashflow', 'N/A')}

=== WALL STREET CONSENSUS ===
- Analyst Rating: {fundamentals.get('analyst_rating', 'N/A')}
- Buy: {fundamentals.get('buy_count', 0)} | Hold: {fundamentals.get('hold_count', 0)} | Sell: {fundamentals.get('sell_count', 0)}
- Mean Price Target: ${fundamentals.get('target_mean', 'N/A')} ({analyst_upside}% from current)
- Target Range: ${fundamentals.get('target_low', 'N/A')} — ${fundamentals.get('target_high', 'N/A')}
- Recent Rating Changes:
{upgrades_str}

=== RETAIL SENTIMENT (Stocktwits) ===
- Bullish: {sentiment['bull_pct']}% | Bearish: {sentiment['bear_pct']}%
- Messages analyzed: {sentiment['total']}
- Sample comments:
{samples_str}

=== LATEST NEWS ===
{headlines_str}

=== MARKET MOOD ===
- CNN Fear & Greed: {fear_greed['score']}/100 — {fear_greed['rating']}

---
INSTRUCTIONS: Use ALL data above. Where data says N/A, note it briefly but still produce a full analysis using what IS available. Use your training knowledge about {ticker} to supplement where needed. Be decisive.

**RECOMMENDATION: [BUY / SELL / HOLD / WATCH]**
**CONVICTION: [HIGH / MEDIUM / LOW]**

**PRICE & TECHNICAL ANALYSIS**
• Price position within 52-week range
• Volume vs average assessment
• Momentum and trend

**VALUATION**
• P/E vs sector and historical norms
• Over or undervalued at current price
• Key valuation insight

**FUNDAMENTAL HEALTH**
• Revenue and earnings trajectory
• Margin quality
• Balance sheet strength

**WALL STREET VIEW**
• Analyst consensus and what it means
• Price target upside/downside from current
• Notable rating changes

**RETAIL SENTIMENT**
• What traders are saying
• Alignment or divergence from fundamentals

**NEWS & CATALYSTS**
• Impact of recent headlines
• Key upcoming catalysts

**MARKET CONTEXT**
• Fear & Greed positioning
• Macro environment impact

**RISK FACTORS**
• Risk 1
• Risk 2
• Risk 3
• Risk 4

**BULL CASE**
• Reason 1
• Reason 2
• Reason 3

**BEAR CASE**
• Reason 1
• Reason 2
• Reason 3

**PRICE TARGETS**
• 30-day target: $[X] ([Y]% from current)
• 90-day target: $[X] ([Y]% from current)
• Time horizon: [short/medium/long-term]

Reference specific numbers throughout. Be thorough and decisive."""

    try:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 2500, "messages": [{"role": "user", "content": prompt}]},
            timeout=60
        )
        result = resp.json()
        text = "".join(c.get("text", "") for c in result.get("content", []))
        return {"recommendation": text if text else f"Error: {result}"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/analyze/{ticker}")
async def analyze(ticker: str):
    ticker = ticker.upper()
    async with httpx.AsyncClient() as client:
        price_data, fundamentals, news_data, sentiment, fear_greed = await asyncio.gather(
            get_price_data(ticker, client),
            get_fundamentals(ticker, client),
            get_news_and_name(ticker, client),
            get_stocktwits(ticker, client),
            get_fear_greed(client)
        )
        name = news_data.get("name", ticker)
        headlines = news_data.get("headlines", [])
        ai = await get_ai_rec(ticker, name, price_data, fundamentals, headlines, sentiment, fear_greed, client)

    return {
        "ticker": ticker,
        "price_info": {**price_data, "name": name},
        "fundamentals": fundamentals,
        "sentiment": sentiment,
        "headlines": headlines,
        "fear_greed": fear_greed,
        "ai": ai
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
