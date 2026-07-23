import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getWatchlist } from "../store.js";
import { fetchPrices, formatPrice } from "../price-api.js";
import { checkAndFireAlerts } from "../alerts.js";

registerMainMenuItem({ label: "💰 Prices", data: "price:show", order: 5 });

const composer = new Composer<Ctx>();

async function sendPrices(ctx: Ctx, tickers: string[], edit = false) {
  if (tickers.length === 0) {
    const msg = "No tickers. Tap ➕ Add Ticker to start.";
    const kb = inlineKeyboard([[inlineButton("➕ Add Ticker", "watchlist:add"), inlineButton("⬅️ Back to menu", "menu:main")]]);
    if (edit && ctx.callbackQuery?.message) {
      await ctx.editMessageText(msg, { reply_markup: kb });
    } else {
      await ctx.reply(msg, { reply_markup: kb });
    }
    return;
  }
  const prices = await fetchPrices(tickers);
  const lines = tickers.map((t) => formatPrice(prices[t.toUpperCase()] ?? null, t));
  const text = lines.join("\n");
  const kb = inlineKeyboard([
    [inlineButton("🔔 Manage Alerts", "alerts:manage"), inlineButton("🔄 Refresh", "price:refresh")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  if (edit && ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

composer.command("price", async (ctx) => {
  const arg = (ctx.message?.text || "").split(/\s+/)[1];
  const uid = ctx.from?.id ?? 0;
  await checkAndFireAlerts(uid, (t) => ctx.reply(t) as any);
  if (arg) {
    await sendPrices(ctx, [arg]);
    return;
  }
  const wl = await getWatchlist(uid);
  const tks = wl.map((w) => w.ticker);
  await sendPrices(ctx, tks);
});

composer.callbackQuery("price:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  await checkAndFireAlerts(uid, (t) => ctx.reply(t) as any);
  const wl = await getWatchlist(uid);
  const tks = wl.map((w) => w.ticker);
  await sendPrices(ctx, tks, true);
});

composer.callbackQuery("price:refresh", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  await checkAndFireAlerts(uid, (t) => ctx.reply(t) as any);
  const wl = await getWatchlist(uid);
  const tks = wl.map((w) => w.ticker);
  await sendPrices(ctx, tks, true);
});

export default composer;
