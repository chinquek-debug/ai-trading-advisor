from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import asyncio

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

async def get_price_data(ticker, client):
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "*/*", "Referer": "https://finance.yahoo.com"}
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
                # Cap unrealistic daily moves (data glitch protection)
                if chg and abs(chg) > 25:
                    chg = None
                return {
                    "price": round(price, 2) if price else None,
                    "change_pct": chg,
                    "week52_high": round(max(valid_closes), 2) if valid_closes else None,
                    "week52_low": round(min(valid_closes), 2) if valid_closes else None,
                    "avg_volume": int(sum(valid_vols)/len(valid_vols)) if valid_vols else None,
                    "current_volume": meta.get("regularMarketVolume"),
                    "market_cap": meta.get("marketCap"),
                }
    except:
        pass
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
                return {"price": round(price, 2), "change_pct": chg, "week52_high": q.get("fiftyTwoWeekHigh"), "week52_low": q.get("fiftyTwoWeekLow"), "avg_volume": q.get("averageDailyVolume3Month"), "current_volume": q.get("regularMarketVolume"), "market_cap": q.get("marketCap")}
    except:
        pass
    return {"price": None}

async def get_fundamentals(ticker, client):
    try:
        modules = "summaryDetail,defaultKeyStatistics,financialData,recommendationTrend,upgradeDowngradeHistory"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json", "Referer": "https://finance.yahoo.com/"}
        for host in ["query2", "query1"]:
            try:
                url = f"https://{host}.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules={modules}"
                resp = await client.get(url, headers=headers, timeout=12)
                if resp.status_code == 200:
                    result = resp.json().get("quoteSummary", {}).get("result", [None])
                    if result and result[0]:
                        sd = result[0]
                        detail = sd.get("summaryDetail", {})
                        keystats = sd.get("defaultKeyStatistics", {})
                        findata = sd.get("financialData", {})
                        rec = sd.get("recommendationTrend", {}).get("trend", [{}])[0] if sd.get("recommendationTrend") else {}
                        upgrades = sd.get("upgradeDowngradeHistory", {}).get("history", [])[:4]
                        def v(d, k):
                            val = d.get(k, {})
                            if isinstance(val, dict): return val.get("fmt") or val.get("raw")
                            return val
                        return {
                            "pe_ratio": v(detail, "trailingPE"), "forward_pe": v(detail, "forwardPE"),
                            "dividend_yield": v(detail, "dividendYield"), "beta": v(detail, "beta"),
                            "short_ratio": v(keystats, "shortRatio"), "short_pct_float": v(keystats, "shortPercentOfFloat"),
                            "profit_margin": v(findata, "profitMargins"), "operating_margin": v(findata, "operatingMargins"),
                            "debt_to_equity": v(findata, "debtToEquity"), "return_on_equity": v(findata, "returnOnEquity"),
                            "revenue_growth": v(findata, "revenueGrowth"), "earnings_growth": v(findata, "earningsGrowth"),
                            "free_cashflow": v(findata, "freeCashflow"), "target_mean": v(findata, "targetMeanPrice"),
                            "target_low": v(findata, "targetLowPrice"), "target_high": v(findata, "targetHighPrice"),
                            "analyst_rating": v(findata, "recommendationKey"),
                            "buy_count": (rec.get("strongBuy") or 0) + (rec.get("buy") or 0),
                            "hold_count": rec.get("hold") or 0,
                            "sell_count": (rec.get("sell") or 0) + (rec.get("strongSell") or 0),
                            "recent_upgrades": [f"{u.get('firm','')} → {u.get('toGrade','')} ({u.get('action','')})" for u in upgrades],
                        }
            except: continue
    except: pass
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
            if len(samples) < 5 and msg.get("body"): samples.append(msg["body"][:150])
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

async def get_ai_rec(ticker, name, price_data, fundamentals, headlines, sentiment, fear_greed, shares, cost_basis, client):
    if not ANTHROPIC_API_KEY:
        return {"error": "No ANTHROPIC_API_KEY set"}

    price = price_data.get("price")
    high = price_data.get("week52_high")
    low = price_data.get("week52_low")

    def pct(p, r):
        try: return round((p - r) / r * 100, 1)
        except: return None

    from_high = pct(price, high) if price and high else None
    from_low = pct(price, low) if price and low else None
    analyst_upside = pct(price, fundamentals.get("target_mean")) if price and fundamentals.get("target_mean") else None

    # Portfolio position math
    position_value = round(price * shares, 2) if price and shares else None
    cost_total = round(cost_basis * shares, 2) if cost_basis and shares else None
    gain_loss = round(position_value - cost_total, 2) if position_value and cost_total else None
    gain_loss_pct = round((gain_loss / cost_total) * 100, 2) if gain_loss and cost_total else None

    headlines_str = "\n".join(f"- {h}" for h in headlines) or "- No recent headlines"
    samples_str = "\n".join(f'- "{s}"' for s in sentiment.get("samples", [])) or "- None"
    upgrades_str = "\n".join(f"  - {u}" for u in fundamentals.get("recent_upgrades", [])) or "  - None"

    portfolio_section = ""
    if shares:
        portfolio_section = f"""
=== YOUR POSITION ===
- Shares held: {shares}
- Cost basis per share: ${cost_basis if cost_basis else 'N/A'}
- Total cost: ${cost_total if cost_total else 'N/A'}
- Current position value: ${position_value if position_value else 'N/A'}
- Unrealized gain/loss: ${gain_loss if gain_loss else 'N/A'} ({gain_loss_pct if gain_loss_pct else 'N/A'}%)
"""

    prompt = f"""You are a senior portfolio manager conducting daily research on a client's holding in {ticker} ({name}).
{portfolio_section}
=== PRICE DATA ===
- Current Price: ${price if price else 'N/A'}
- Today's Change: {price_data.get('change_pct', 'N/A')}%
- 52-Week High: ${high} ({from_high}% from high)
- 52-Week Low: ${low} (+{from_low}% above low)
- Volume: {price_data.get('current_volume', 'N/A')} (avg: {price_data.get('avg_volume', 'N/A')})
- Market Cap: {price_data.get('market_cap', 'N/A')}

=== VALUATION ===
- P/E (TTM): {fundamentals.get('pe_ratio', 'N/A')}
- Forward P/E: {fundamentals.get('forward_pe', 'N/A')}
- Beta: {fundamentals.get('beta', 'N/A')}
- Dividend Yield: {fundamentals.get('dividend_yield', 'N/A')}
- Short % Float: {fundamentals.get('short_pct_float', 'N/A')}

=== FUNDAMENTALS ===
- Profit Margin: {fundamentals.get('profit_margin', 'N/A')}
- Revenue Growth: {fundamentals.get('revenue_growth', 'N/A')}
- Earnings Growth: {fundamentals.get('earnings_growth', 'N/A')}
- ROE: {fundamentals.get('return_on_equity', 'N/A')}
- Debt/Equity: {fundamentals.get('debt_to_equity', 'N/A')}
- Free Cash Flow: {fundamentals.get('free_cashflow', 'N/A')}

=== WALL STREET ===
- Rating: {fundamentals.get('analyst_rating', 'N/A')}
- Buy/Hold/Sell: {fundamentals.get('buy_count', 0)}/{fundamentals.get('hold_count', 0)}/{fundamentals.get('sell_count', 0)}
- Mean Target: ${fundamentals.get('target_mean', 'N/A')} ({analyst_upside}% from current)
- Target Range: ${fundamentals.get('target_low', 'N/A')} — ${fundamentals.get('target_high', 'N/A')}
- Recent Changes: {upgrades_str}

=== RETAIL SENTIMENT ===
- Bullish: {sentiment['bull_pct']}% | Bearish: {sentiment['bear_pct']}% ({sentiment['total']} messages)
- Comments: {samples_str}

=== NEWS ===
{headlines_str}

=== MARKET ===
- Fear & Greed: {fear_greed['score']}/100 — {fear_greed['rating']}

---
You are advising a real investor who holds this position. Be direct, specific, and reference their actual position data. Use training knowledge to supplement any missing data.

**RECOMMENDATION: [BUY MORE / HOLD / TRIM / SELL]**
**CONVICTION: [HIGH / MEDIUM / LOW]**

## SUMMARY
IMPORTANT: You MUST write exactly 5 bullet points here, each on its own line starting with •. Do not combine them.
• [One sentence overall verdict including current price and % gain/loss on position]
• [Most important bullish signal from the specific data above]
• [Most important bearish risk to watch right now]
• [Specific action: what should this investor do with their position and why]
• [What to watch in next 30 days that could change this thesis]

## PRICE & TECHNICAL ANALYSIS
• Price position in 52-week range
• Volume and momentum assessment
• Near-term technical outlook

## VALUATION
• Current valuation vs historical and sector norms
• Over/undervalued assessment at current price

## FUNDAMENTAL HEALTH
• Revenue and earnings trajectory
• Margin and balance sheet quality

## WALL STREET VIEW
• Analyst consensus and price target upside
• Recent rating changes significance

## RETAIL SENTIMENT
• What traders are saying and reliability of signal

## NEWS & CATALYSTS
• Impact of recent headlines on thesis
• Key upcoming catalysts

## PORTFOLIO IMPACT
• How this position affects your overall portfolio
• Whether sizing is appropriate
• Hold, add, or reduce recommendation with specific reasoning tied to your cost basis

## RISK FACTORS
• Risk 1
• Risk 2
• Risk 3

## BULL CASE
• Reason 1
• Reason 2

## BEAR CASE
• Reason 1
• Reason 2

## PRICE TARGETS
• 30-day target: $X (Y% from current)
• 90-day target: $X (Y% from current)
• Stop-loss suggestion: $X
• Time horizon: [short/medium/long-term]

Be thorough. Reference specific numbers and the client's actual position throughout."""

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
async def analyze(ticker: str, shares: float = 0, cost_basis: float = 0):
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
        ai = await get_ai_rec(ticker, name, price_data, fundamentals, headlines, sentiment, fear_greed, shares, cost_basis, client)

    price = price_data.get("price")
    position_value = round(price * shares, 2) if price and shares else None
    cost_total = round(cost_basis * shares, 2) if cost_basis and shares else None
    gain_loss = round(position_value - cost_total, 2) if position_value and cost_total else None
    gain_loss_pct = round((gain_loss / cost_total) * 100, 2) if gain_loss and cost_total else None

    return {
        "ticker": ticker,
        "price_info": {**price_data, "name": name},
        "fundamentals": fundamentals,
        "sentiment": sentiment,
        "headlines": headlines,
        "fear_greed": fear_greed,
        "position": {"shares": shares, "cost_basis": cost_basis, "position_value": position_value, "cost_total": cost_total, "gain_loss": gain_loss, "gain_loss_pct": gain_loss_pct},
        "ai": ai
    }

@app.get("/portfolio")
async def analyze_portfolio(tickers: str, shares: str = "", costs: str = ""):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    shares_list = [float(s.strip()) if s.strip() else 0 for s in shares.split(",")] if shares else [0] * len(ticker_list)
    costs_list = [float(c.strip()) if c.strip() else 0 for c in costs.split(",")] if costs else [0] * len(ticker_list)

    while len(shares_list) < len(ticker_list): shares_list.append(0)
    while len(costs_list) < len(ticker_list): costs_list.append(0)

    async with httpx.AsyncClient() as client:
        fear_greed = await get_fear_greed(client)
        results = []
        for i, ticker in enumerate(ticker_list):
            try:
                price_data, fundamentals, news_data, sentiment = await asyncio.gather(
                    get_price_data(ticker, client),
                    get_fundamentals(ticker, client),
                    get_news_and_name(ticker, client),
                    get_stocktwits(ticker, client)
                )
                name = news_data.get("name", ticker)
                headlines = news_data.get("headlines", [])
                sh = shares_list[i]
                cb = costs_list[i]
                ai = await get_ai_rec(ticker, name, price_data, fundamentals, headlines, sentiment, fear_greed, sh, cb, client)

                price = price_data.get("price")
                position_value = round(price * sh, 2) if price and sh else None
                cost_total = round(cb * sh, 2) if cb and sh else None
                gain_loss = round(position_value - cost_total, 2) if position_value and cost_total else None
                gain_loss_pct = round((gain_loss / cost_total) * 100, 2) if gain_loss and cost_total else None

                results.append({
                    "ticker": ticker,
                    "price_info": {**price_data, "name": name},
                    "fundamentals": fundamentals,
                    "sentiment": sentiment,
                    "headlines": headlines,
                    "position": {"shares": sh, "cost_basis": cb, "position_value": position_value, "cost_total": cost_total, "gain_loss": gain_loss, "gain_loss_pct": gain_loss_pct},
                    "ai": ai
                })
            except Exception as e:
                results.append({"ticker": ticker, "error": str(e)})

    return {"results": results, "fear_greed": fear_greed}

@app.get("/health")
async def health():
    return {"status": "ok"}
# updated Sun Jun  7 03:27:09 UTC 2026
