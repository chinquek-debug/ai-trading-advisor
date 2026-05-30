from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import asyncio

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

TOP_TICKERS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "AMD", "META", "AMZN", "MSFT", "PLTR", "SOFI", "HBAN"]

async def get_unusual_whales(ticker: str, client: httpx.AsyncClient):
    try:
        url = f"https://phx.unusualwhales.com/api/historic_chains/{ticker}?limit=5"
        resp = await client.get(url, headers=HEADERS, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            flows = data.get("data", [])[:5]
            summary = []
            for f in flows:
                side = f.get("put_call", "")
                strike = f.get("strike", "")
                expiry = f.get("expiry", "")
                premium = f.get("premium", 0)
                if premium and side:
                    try:
                        summary.append(f"{side.upper()} ${strike} exp {expiry} — ${int(float(premium)):,} premium")
                    except Exception:
                        pass
            return summary
    except Exception:
        pass
    return []

async def get_stocktwits(ticker: str, client: httpx.AsyncClient):
    try:
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
        resp = await client.get(url, headers=HEADERS, timeout=8)
        data = resp.json()
        messages = data.get("messages", [])
        bull, bear = 0, 0
        samples = []
        for msg in messages[:20]:
            sentiment = msg.get("entities", {}).get("sentiment", {})
            basic = sentiment.get("basic", "") if sentiment else ""
            if basic == "Bullish":
                bull += 1
            elif basic == "Bearish":
                bear += 1
            if len(samples) < 3 and msg.get("body"):
                samples.append(msg["body"][:100])
        total = bull + bear or 1
        return {
            "bull_pct": round(bull / total * 100),
            "bear_pct": round(bear / total * 100),
            "total": len(messages),
            "samples": samples
        }
    except Exception:
        return {"bull_pct": 50, "bear_pct": 50, "total": 0, "samples": []}

async def get_yahoo(ticker: str, client: httpx.AsyncClient):
    try:
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={ticker}&newsCount=4&quotesCount=1"
        resp = await client.get(url, headers=HEADERS, timeout=8)
        data = resp.json()
        quotes = data.get("quotes", [])
        news = data.get("news", [])
        price_info = {}
        if quotes:
            q = quotes[0]
            price_info = {
                "price": q.get("regularMarketPrice"),
                "change_pct": q.get("regularMarketChangePercent"),
                "name": q.get("longname") or q.get("shortname", ticker),
            }
        headlines = [n.get("title", "") for n in news[:4] if n.get("title")]
        return {"price_info": price_info, "headlines": headlines}
    except Exception:
        return {"price_info": {}, "headlines": []}

async def get_fear_greed(client: httpx.AsyncClient):
    try:
        url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
        resp = await client.get(url, headers=HEADERS, timeout=8)
        data = resp.json()
        score = data.get("fear_and_greed", {}).get("score", 50)
        rating = data.get("fear_and_greed", {}).get("rating", "Neutral")
        return {"score": round(score), "rating": rating}
    except Exception:
        return {"score": 50, "rating": "Neutral"}

async def get_ai_recommendation(ticker, sentiment, yahoo, options_flow, fear_greed, client):
    if not ANTHROPIC_API_KEY:
        return {"error": "No ANTHROPIC_API_KEY set in Railway environment variables"}

    price = yahoo.get("price_info", {}).get("price", "N/A")
    change = yahoo.get("price_info", {}).get("change_pct", 0)
    change_str = f"{change:.2f}%" if isinstance(change, (int, float)) else "N/A"
    headlines = "\n".join(yahoo.get("headlines", [])) or "No recent news"
    options_text = "\n".join(options_flow) if options_flow else "No unusual options activity detected"
    samples_text = "\n".join(f'- "{s}"' for s in sentiment.get("samples", [])) or "No messages"

    prompt = f"""You are an expert stock market analyst. Analyze ALL of the following live market data for {ticker} and give a clear, actionable recommendation.

PRICE DATA:
- Current price: ${price}
- Today's change: {change_str}

TRADER SENTIMENT (Stocktwits - real retail traders):
- Bullish: {sentiment['bull_pct']}% | Bearish: {sentiment['bear_pct']}%
- Total messages: {sentiment['total']}
- Sample trader comments:
{samples_text}

UNUSUAL OPTIONS FLOW (what big money is betting):
{options_text}

BREAKING NEWS:
{headlines}

MARKET MOOD:
- CNN Fear & Greed: {fear_greed['score']}/100 — {fear_greed['rating']}

Provide:
**RECOMMENDATION: [BUY / SELL / HOLD / WATCH]**
**CONVICTION: [HIGH / MEDIUM / LOW]**
**REASONING**
3-4 sentences referencing specific data points above.
**KEY RISK**
Single biggest risk to this call.
**PRICE TARGET**
Realistic 30-day target.
**TIME HORIZON**
Short-term trade or longer hold?

Be decisive. Max 250 words."""

    try:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=30
        )
        result = resp.json()
        text = "".join(c.get("text", "") for c in result.get("content", []))
        return {"recommendation": text}
    except Exception as e:
        return {"error": str(e)}

@app.get("/analyze/{ticker}")
async def analyze_ticker(ticker: str):
    ticker = ticker.upper()
    async with httpx.AsyncClient() as client:
        sentiment, yahoo, options, fear_greed = await asyncio.gather(
            get_stocktwits(ticker, client),
            get_yahoo(ticker, client),
            get_unusual_whales(ticker, client),
            get_fear_greed(client)
        )
        ai_result = await get_ai_recommendation(ticker, sentiment, yahoo, options, fear_greed, client)

    return {
        "ticker": ticker,
        "price_info": yahoo.get("price_info", {}),
        "sentiment": sentiment,
        "options_flow": options,
        "headlines": yahoo.get("headlines", []),
        "fear_greed": fear_greed,
        "ai": ai_result
    }

@app.get("/scan")
async def scan_market():
    async with httpx.AsyncClient() as client:
        fear_greed = await get_fear_greed(client)
        results = []
        for ticker in TOP_TICKERS[:6]:
            try:
                sentiment, yahoo, options = await asyncio.gather(
                    get_stocktwits(ticker, client),
                    get_yahoo(ticker, client),
                    get_unusual_whales(ticker, client)
                )
                ai_result = await get_ai_recommendation(ticker, sentiment, yahoo, options, fear_greed, client)
                results.append({
                    "ticker": ticker,
                    "price_info": yahoo.get("price_info", {}),
                    "sentiment": sentiment,
                    "options_flow": options,
                    "headlines": yahoo.get("headlines", []),
                    "ai": ai_result
                })
            except Exception:
                continue

    return {"results": results, "fear_greed": fear_greed}

@app.get("/health")
async def health():
    return {"status": "ok"}
