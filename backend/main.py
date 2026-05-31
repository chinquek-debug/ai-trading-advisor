from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import asyncio

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

HEADERS = {"User-Agent": "Mozilla/5.0"}
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

async def get_stocktwits(ticker, client):
    try:
        resp = await client.get(f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json", headers=HEADERS, timeout=8)
        messages = resp.json().get("messages", [])
        bull, bear, samples = 0, 0, []
        for msg in messages[:20]:
            s = msg.get("entities", {}).get("sentiment", {})
            b = s.get("basic", "") if s else ""
            if b == "Bullish": bull += 1
            elif b == "Bearish": bear += 1
            if len(samples) < 3 and msg.get("body"): samples.append(msg["body"][:100])
        total = bull + bear or 1
        return {"bull_pct": round(bull/total*100), "bear_pct": round(bear/total*100), "total": len(messages), "samples": samples}
    except:
        return {"bull_pct": 50, "bear_pct": 50, "total": 0, "samples": []}

async def get_yahoo(ticker, client):
    try:
        resp = await client.get(f"https://query1.finance.yahoo.com/v1/finance/search?q={ticker}&newsCount=4&quotesCount=1", headers=HEADERS, timeout=8)
        data = resp.json()
        q = data.get("quotes", [{}])[0] if data.get("quotes") else {}
        price_info = {"price": q.get("regularMarketPrice"), "change_pct": q.get("regularMarketChangePercent"), "name": q.get("longname") or q.get("shortname", ticker)}
        headlines = [n.get("title","") for n in data.get("news",[])[:4] if n.get("title")]
        return {"price_info": price_info, "headlines": headlines}
    except:
        return {"price_info": {}, "headlines": []}

async def get_fear_greed(client):
    try:
        resp = await client.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", headers=HEADERS, timeout=8)
        fg = resp.json().get("fear_and_greed", {})
        return {"score": round(fg.get("score", 50)), "rating": fg.get("rating", "Neutral")}
    except:
        return {"score": 50, "rating": "Neutral"}

async def get_ai_rec(ticker, sentiment, yahoo, fear_greed, client):
    if not ANTHROPIC_API_KEY:
        return {"error": "No ANTHROPIC_API_KEY set"}
    price = yahoo.get("price_info", {}).get("price", "N/A")
    change = yahoo.get("price_info", {}).get("change_pct", 0)
    change_str = f"{change:.2f}%" if isinstance(change, (int, float)) else "N/A"
    headlines = "\n".join(yahoo.get("headlines", [])) or "No news"
    samples = "\n".join(f'- "{s}"' for s in sentiment.get("samples", [])) or "None"
    prompt = f"""Analyze this live market data for {ticker} and give a clear recommendation.

PRICE: ${price} ({change_str} today)
SENTIMENT: {sentiment['bull_pct']}% Bull / {sentiment['bear_pct']}% Bear ({sentiment['total']} messages)
TRADER COMMENTS: {samples}
NEWS: {headlines}
FEAR & GREED: {fear_greed['score']}/100 — {fear_greed['rating']}

Respond with:
**RECOMMENDATION: [BUY / SELL / HOLD / WATCH]**
**CONVICTION: [HIGH / MEDIUM / LOW]**
**REASONING**
2-3 sentences using the data above.
**KEY RISK**
One sentence.
**PRICE TARGET**
30-day target price.
**TIME HORIZON**
Short-term or long-term.

Be decisive. Under 200 words."""
    try:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 1000, "messages": [{"role": "user", "content": prompt}]},
            timeout=30
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
        sentiment, yahoo, fear_greed = await asyncio.gather(get_stocktwits(ticker, client), get_yahoo(ticker, client), get_fear_greed(client))
        ai = await get_ai_rec(ticker, sentiment, yahoo, fear_greed, client)
    return {"ticker": ticker, "price_info": yahoo.get("price_info", {}), "sentiment": sentiment, "headlines": yahoo.get("headlines", []), "fear_greed": fear_greed, "ai": ai}

@app.get("/health")
async def health():
    return {"status": "ok"}
