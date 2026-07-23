import { now } from "./clock.js";

const CG_BASE = "https://api.coingecko.com/api/v3";

const TICKER_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  TON: "the-open-network",
  SOL: "solana",
  USDT: "tether",
  BNB: "binancecoin",
  XRP: "ripple",
  DOGE: "dogecoin",
};

export interface PriceInfo {
  price: number;
  change1h: number; // percent, e.g. 0.5 for +0.5%
}

export async function resolveCoinId(ticker: string): Promise<string | null> {
  const t = ticker.toUpperCase().trim();
  if (TICKER_MAP[t]) return TICKER_MAP[t];
  // try search
  try {
    const r = await fetch(`${CG_BASE}/search?query=${encodeURIComponent(ticker)}`);
    if (!r.ok) return null;
    const j: any = await r.json();
    const coins: any[] = j.coins || [];
    const exact = coins.find((c: any) => (c.symbol || "").toUpperCase() === t);
    if (exact) return exact.id;
    if (coins[0]) return coins[0].id;
    return null;
  } catch {
    return null;
  }
}

export async function fetchPrice(ticker: string): Promise<PriceInfo | null> {
  return fetchPrices([ticker]).then((m) => m[ticker.toUpperCase()] ?? null);
}

export async function fetchPrices(tickers: string[]): Promise<Record<string, PriceInfo>> {
  if (tickers.length === 0) return {};
  const ids: string[] = [];
  const tickerToId: Record<string, string> = {};
  for (const tk of tickers) {
    const t = tk.toUpperCase();
    const id = TICKER_MAP[t] || (await resolveCoinId(t));
    if (id) {
      if (!ids.includes(id)) ids.push(id);
      tickerToId[t] = id;
    }
  }
  if (ids.length === 0) return {};
  const url = `${CG_BASE}/coins/markets?vs_currency=usd&ids=${ids.join(",")}&price_change_percentage=1h&sparkline=false`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`cg ${r.status}`);
      const arr: any[] = await r.json();
      const out: Record<string, PriceInfo> = {};
      for (const a of arr) {
        const id = a.id as string;
        const tks = Object.keys(tickerToId).filter((k) => tickerToId[k] === id);
        const p = Number(a.current_price);
        const ch = Number(a.price_change_percentage_1h_in_currency ?? 0);
        for (const tk of tks) {
          out[tk] = { price: p, change1h: ch };
        }
      }
      return out;
    } catch (e) {
      lastErr = e;
      // silent retry
      await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
    }
  }
  // all retries failed, return empty (caller handles)
  return {};
}

export function formatPrice(p: PriceInfo | null, ticker: string): string {
  if (!p) return `${ticker}: unavailable`;
  const ch = p.change1h >= 0 ? `+${p.change1h.toFixed(1)}%` : `${p.change1h.toFixed(1)}%`;
  return `${ticker}: $${p.price.toLocaleString()} (${ch} 1h)`;
}
