from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import asyncio

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
}
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

async def get_price_primary(ticker, client):
    """Yahoo Finance v8 quote endpoint - most reliable for price"""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y"
        resp = await client.get(url, headers=HEADERS, timeout=10)
        data = resp.json()
        result = data.get("chart", {}).get("result", [{}])[0]
        meta = result.get("meta", {})
        timestamps = result.get("timestamp", [])
        quotes = result.get("indicators", {}).get("quote", [{}])[0]
        closes = quotes.get("close", [])
        volumes = quotes.get("volume", [])

        # Get last valid close
        price = meta.get("regularMarketPrice") or meta.get("chartPreviousClose")
        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
        change_pct = ((price - prev_close) / prev_close * 100) if price and prev_close else None

        # 52 week high/low from historical data
        valid_closes = [c for c in closes if c]
        week52_high = max(valid_closes) if valid_closes else None
        week52_low = min(valid_closes) if valid_closes else None

        # Volume
        valid_vols = [v for v in volumes if v]
        avg_volume = sum(valid_vols) / len(valid_vols) if valid_vols else None
        current_volume = meta.get("regularMarketVolume")

        return {
            "price": round(price, 2) if price else None,
            "prev_close": round(prev_close, 2) if prev_close else None,
            "change_pct": round(change_pct, 2) if change_pct else None,
            "week52_high": round(week52_high, 2) if week52_high else None,
            "week52_low": round(week52_low, 2) if week52_low else None,
            "avg_volume": int(avg_volume) if avg_volume else None,
            "current_volume": current_volume,
            "market_cap": meta.get("marketCap"),
            "currency": meta.get("currency", "USD"),
            "exchange": meta.get("exchangeName", ""),
        }
    except Exception as e:
        return {}

async def get_yahoo_fundamentals(ticker, client):
    """Yahoo Finance quoteSummary for fundamentals and analyst data"""
    try:
        crumb = None
        try:
            crumb_resp = await client.get("https://query1.finance.yahoo.com/v1/test/getcrumb", headers=HEADERS, timeout=8)
            if crumb_resp.status_code == 200:
                crumb = crumb_resp.text.strip()
        except:
            pass
        modules = "summaryDetail,defaultKeyStatistics,financialData,recommendationTrend,upgradeDowngradeHistory"
        crumb_param = f"&crumb={crumb}" if crumb else ""
        url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules={modules}{crumb_param}"
        resp = await client.get(url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            url2 = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules={modules}{crumb_param}"
            resp = await client.get(url2, headers=HEADERS, timeout=12)

        sd = resp.json().get("quoteSummary", {}).get("result", [{}])[0] if resp.status_code == 200 else {}
        detail = sd.get("summaryDetail", {})
        keystats = sd.get("defaultKeyStatistics", {})
        findata = sd.get("financialData", {})
        rec_trend = sd.get("recommendationTrend", {}).get("trend", [{}])[0] if sd.get("recommendationTrend") else {}
        upgrades = sd.get("upgradeDowngradeHistory", {}).get("history", [])[:5]

        def val(d, k):
            v = d.get(k, {})
            if isinstance(v, dict):
                return v.get("fmt") or v.get("raw")
            return v

        return {
            "name": None,  # will fill from search
            "pe_ratio": val(detail, "trailingPE"),
            "forward_pe": val(detail, "forwardPE"),
            "dividend_yield": val(detail, "dividendYield"),
            "beta": val(detail, "beta"),
            "short_ratio": val(keystats, "shortRatio"),
            "short_pct_float": val(keystats, "shortPercentOfFloat"),
            "profit_margin": val(findata, "profitMargins"),
            "operating_margin": val(findata, "operatingMargins"),
            "debt_to_equity": val(findata, "debtToEquity"),
            "return_on_equity": val(findata, "returnOnEquity"),
            "return_on_assets": val(findata, "returnOnAssets"),
            "revenue_growth": val(findata, "revenueGrowth"),
            "earnings_growth": val(findata, "earningsGrowth"),
            "free_cashflow": val(findata, "freeCashflow"),
            "target_mean": val(findata, "targetMeanPrice"),
            "target_low": val(findata, "targetLowPrice"),
            "target_high": val(findata, "targetHighPrice"),
            "analyst_rating": val(findata, "recommendationKey"),
            "buy_count": (rec_trend.get("strongBuy", 0) or 0) + (rec_trend.get("buy", 0) or 0),
            "hold_count": rec_trend.get("hold", 0) or 0,
            "sell_count": (rec_trend.get("sell", 0) or 0) + (rec_trend.get("strongSell", 0) or 0),
            "recent_upgrades": [f"{u.get('firm','')} → {u.get('toGrade','')} ({u.get('action','')})" for u in upgrades[:4]],
        }
    except Exception as e:
        return {}

async def get_yahoo_news_and_name(ticker, client):
    """Get news headlines and company name"""
    try:
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={ticker}&newsCount=6&quotesCount=1"
        resp = await client.get(url, headers=HEADERS, timeout=8)
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
        resp = await client.get(url, headers=HEADERS, timeout=8)
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
        resp = await client.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", headers=HEADERS, timeout=8)
        fg = resp.json().get("fear_and_greed", {})
        return {"score": round(fg.get("score", 50)), "rating": fg.get("rating", "Neutral")}
    except:
        return {"score": 50, "rating": "Neutral"}

def pct_from_high(price, high):
    try:
        return round((price - high) / high * 100, 1)
    except:
        return None

def pct_from_low(price, low):
    try:
        return round((price - low) / low * 100, 1)
    except:
        return None

async def get_ai_rec(ticker, price_data, fundamentals, news_data, sentiment, fear_greed, client):
    if not ANTHROPIC_API_KEY:
        return {"error": "No ANTHROPIC_API_KEY set"}

    price = price_data.get("price")
    high = price_data.get("week52_high")
    low = price_data.get("week52_low")
    from_high = pct_from_high(price, high) if price and high else None
    from_low = pct_from_low(price, low) if price and low else None

    headlines = "\n".join(f"- {h}" for h in news_data.get("headlines", [])) or "- No recent news"
    samples = "\n".join(f'- "{s}"' for s in sentiment.get("samples", [])) or "- None"
    upgrades = "\n".join(f"  - {u}" for u in fundamentals.get("recent_upgrades", [])) or "  - None available"

    prompt = f"""You are a senior Wall Street analyst conducting a full research report on {ticker} ({news_data.get('name', ticker)}).

=== PRICE & TECHNICAL DATA ===
- Current Price: ${price if price else 'N/A'}
- Previous Close: ${price_data.get('prev_close', 'N/A')}
- Today's Change: {price_data.get('change_pct', 'N/A')}%
- 52-Week High: ${high if high else 'N/A'} ({f"{from_high}% from high" if from_high else 'N/A'})
- 52-Week Low: ${low if low else 'N/A'} ({f"+{from_low}% from low" if from_low else 'N/A'})
- Current Volume: {str(price_data.get('current_volume', 'N/A'))}
- Avg Volume: {str(price_data.get('avg_volume', 'N/A'))}
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
- Revenue Growth (YoY): {fundamentals.get('revenue_growth', 'N/A')}
- Earnings Growth: {fundamentals.get('earnings_growth', 'N/A')}
- Return on Equity: {fundamentals.get('return_on_equity', 'N/A')}
- Return on Assets: {fundamentals.get('return_on_assets', 'N/A')}
- Debt-to-Equity: {fundamentals.get('debt_to_equity', 'N/A')}
- Free Cash Flow: {fundamentals.get('free_cashflow', 'N/A')}

=== WALL STREET CONSENSUS ===
- Analyst Rating: {fundamentals.get('analyst_rating', 'N/A')}
- Buy: {fundamentals.get('buy_count', 0)} | Hold: {fundamentals.get('hold_count', 0)} | Sell: {fundamentals.get('sell_count', 0)}
- Price Target Mean: ${fundamentals.get('target_mean', 'N/A')}
- Price Target Range: ${fundamentals.get('target_low', 'N/A')} — ${fundamentals.get('target_high', 'N/A')}
- Recent Upgrades/Downgrades:
{upgrades}

=== RETAIL SENTIMENT (Stocktwits) ===
- Bullish: {sentiment['bull_pct']}% | Bearish: {sentiment['bear_pct']}%
- Messages analyzed: {sentiment['total']}
- Sample comments:
{samples}

=== LATEST NEWS ===
{headlines}

=== MARKET MOOD ===
- CNN Fear & Greed Index: {fear_greed['score']}/100 — {fear_greed['rating']}

---

Produce a THOROUGH research report in BULLET FORMAT. Be specific — reference actual numbers from the data above. Do not say data is unavailable if it's provided above.

**RECOMMENDATION: [BUY / SELL / HOLD / WATCH]**
**CONVICTION: [HIGH / MEDIUM / LOW]**

**PRICE & TECHNICAL ANALYSIS**
• Current price vs 52-week range positioning
• Volume analysis vs average
• Momentum and trend assessment

**VALUATION ANALYSIS**
• P/E assessment vs historical and sector norms
• Whether stock appears over/undervalued at current price
• Key valuation metrics interpretation

**FUNDAMENTAL HEALTH**
• Revenue and earnings growth trajectory
• Margin quality and trends
• Balance sheet strength (debt, cash flow)

**WALL STREET VIEW**
• Analyst consensus breakdown
• Price target upside/downside from current price
• Notable recent rating changes

**RETAIL SENTIMENT ANALYSIS**
• What traders are saying and why
• Sentiment alignment or divergence from fundamentals

**NEWS CATALYST ANALYSIS**
• How recent headlines impact the investment thesis
• Key upcoming catalysts to watch

**MARKET CONTEXT**
• Fear & Greed impact on this stock
• Macro tailwinds or headwinds

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

**PRICE TARGETS & TIMELINE**
• 30-day target: $[price] ([X]% from current)
• 90-day target: $[price] ([X]% from current)
• Analyst mean target: $[price] ([X]% upside/downside)
• Recommended time horizon: [short/medium/long-term]

Be decisive and thorough. Every bullet must reference specific data."""

    try:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 2500, "messages": [{"role": "user", "content": prompt}]},
            timeout=60
        )
        result = resp.json()
        text = "".join(c.get("text", "") for c in result.get("content", []))
        return {"recommendation": text if text else f"Empty response: {result}"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/analyze/{ticker}")
async def analyze(ticker: str):
    ticker = ticker.upper()
    async with httpx.AsyncClient() as client:
        price_data, fundamentals, news_data, sentiment, fear_greed = await asyncio.gather(
            get_price_primary(ticker, client),
            get_yahoo_fundamentals(ticker, client),
            get_yahoo_news_and_name(ticker, client),
            get_stocktwits(ticker, client),
            get_fear_greed(client)
        )
        # Merge name
        if news_data.get("name"):
            fundamentals["name"] = news_data["name"]

        # Merge price into a combined price_info for frontend
        price_info = {**price_data, "name": news_data.get("name", ticker)}
        fundamentals_merged = {**fundamentals, **{k: v for k, v in price_data.items() if k not in fundamentals}}

        ai = await get_ai_rec(ticker, price_data, fundamentals, news_data, sentiment, fear_greed, client)

    return {
        "ticker": ticker,
        "price_info": price_info,
        "fundamentals": fundamentals_merged,
        "sentiment": sentiment,
        "headlines": news_data.get("headlines", []),
        "fear_greed": fear_greed,
        "ai": ai
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
