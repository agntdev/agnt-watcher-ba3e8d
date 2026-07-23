import { now } from "./clock.js";
import {
  getThresholdAlerts, getPercentAlerts, getLastPrice, setLastPrice,
  getLastAlertAt, setLastAlertAt, recordFiredAlert, getProfile,
  queueAlert, getQueuedAlerts, clearQueuedAlerts, FiredAlert,
  makeRuleKey,
} from "./store.js";
import { fetchPrices } from "./price-api.js";

const COOLDOWN_MS = 30 * 60 * 1000;

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  return { h: h || 0, m: m || 0 };
}

function isInQuiet(nowDt: Date, start: string, end: string): boolean {
  const nh = nowDt.getUTCHours(); // simplistic, ignore tz for v1; real would use tz
  const nm = nowDt.getUTCMinutes();
  const { h: sh, m: sm } = parseHM(start);
  const { h: eh, m: em } = parseHM(end);
  const nmin = nh * 60 + nm;
  const smin = sh * 60 + sm;
  const emin = eh * 60 + em;
  if (smin < emin) return nmin >= smin && nmin < emin;
  // overnight
  return nmin >= smin || nmin < emin;
}

export async function checkAndFireAlerts(userId: number, ctxReply: (text: string) => Promise<unknown>): Promise<void> {
  const ths = await getThresholdAlerts(userId);
  const pcts = await getPercentAlerts(userId);
  if (ths.length === 0 && pcts.length === 0) return;
  const tickers = [...new Set([...ths.map((a) => a.ticker), ...pcts.map((a) => a.ticker)])];
  const prices = await fetchPrices(tickers);
  const profile = await getProfile(userId);
  const quiet = profile.quietHours ? isInQuiet(now(), profile.quietHours.start, profile.quietHours.end) : false;
  const cooldown = (profile as any).cooldownMins ? (profile as any).cooldownMins * 60000 : COOLDOWN_MS;

  for (const t of tickers) {
    const pi = prices[t.toUpperCase()];
    if (!pi) continue;
    const newP = pi.price;
    const oldP = (await getLastPrice(userId, t)) ?? newP;
    await setLastPrice(userId, t, newP);
    const pctCh = oldP ? ((newP - oldP) / oldP) * 100 : 0;

    // threshold
    for (const a of ths.filter((x) => x.ticker === t)) {
      const crossed = (a.direction === "above" && oldP < a.usd && newP >= a.usd) ||
                      (a.direction === "below" && oldP > a.usd && newP <= a.usd);
      if (crossed) {
        const rule = makeRuleKey("thresh", `${a.direction}:${a.usd}`);
        const last = (await getLastAlertAt(userId, rule)) ?? 0;
        if (now().getTime() - last < cooldown) continue;
        const fire: FiredAlert = {
          ts: now().getTime(), userId, ticker: t, rule,
          oldPrice: oldP, newPrice: newP, pct: pctCh,
        };
        await setLastAlertAt(userId, rule, now().getTime());
        await recordFiredAlert(fire);
        if (quiet && !profile.summaryInQuiet) {
          await queueAlert(userId, fire);
        } else {
          await ctxReply(`Alert: ${t} ${a.direction} $${a.usd} — now $${newP.toFixed(2)} (${pctCh.toFixed(1)}%)`);
        }
      }
    }

    // percent
    for (const a of pcts.filter((x) => x.ticker === t)) {
      if (Math.abs(pi.change1h) >= a.percent) {
        const rule = makeRuleKey("pct", `${a.percent}`);
        const last = (await getLastAlertAt(userId, rule)) ?? 0;
        if (now().getTime() - last < cooldown) continue;
        const fire: FiredAlert = {
          ts: now().getTime(), userId, ticker: t, rule,
          oldPrice: oldP, newPrice: newP, pct: pi.change1h,
        };
        await setLastAlertAt(userId, rule, now().getTime());
        await recordFiredAlert(fire);
        if (quiet && !profile.summaryInQuiet) {
          await queueAlert(userId, fire);
        } else {
          await ctxReply(`Alert: ${t} moved ${pi.change1h.toFixed(1)}% in 1h (target ${a.percent}%) — $${newP.toFixed(2)}`);
        }
      }
    }
  }

  // deliver queued if not quiet anymore
  if (!quiet) {
    const queued = await clearQueuedAlerts(userId);
    if (queued.length > 0) {
      const lines = queued.map((f) => `${f.ticker} ${f.rule} @$${f.newPrice.toFixed(2)}`);
      await ctxReply(`Quiet ended. Alerts during quiet:\n${lines.join("\n")}`);
    }
  }
}

export async function maybeDeliverMorning(userId: number, ctxReply: (text: string) => Promise<unknown>): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile.morningTime) return;
  const d = now();
  const today = d.toISOString().slice(0, 10);
  if (profile.lastMorning === today) return;
  const { h, m } = parseHM(profile.morningTime);
  if (d.getUTCHours() !== h || d.getUTCMinutes() < m) return; // simplistic match hour
  // deliver
  const { getWatchlist, saveProfile } = await import("./store.js");
  const { fetchPrices, formatPrice } = await import("./price-api.js");
  const wl = await getWatchlist(userId);
  const tks = wl.map((w: any) => w.ticker);
  const prices = await fetchPrices(tks);
  const lines = tks.length ? tks.map((t: string) => formatPrice(prices[t] ?? null, t)) : ["No tickers."];
  await ctxReply(`Good morning. Summary:\n${lines.join("\n")}`);
  await saveProfile(userId, { lastMorning: today } as any);
}
