import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, confirmKeyboard } from "../toolkit/index.js";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "../store.js";
import { resolveCoinId } from "../price-api.js";

registerMainMenuItem({ label: "➕ Add Ticker", data: "watchlist:add", order: 10 });

const composer = new Composer<Ctx>();

composer.callbackQuery("watchlist:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  const wl = await getWatchlist(uid);
  const lines = wl.length ? wl.map((w, i) => `${i + 1}. ${w.ticker}${w.nickname ? ` (${w.nickname})` : ""}`).join("\n") : "Watchlist empty.";
  const text = `Your watchlist:\n${lines}\n\nSend ticker symbol (BTC, ETH, SOL...) or tap remove.`;
  const removes = wl.slice(0, 5).map((w) => inlineButton(`🗑 ${w.ticker}`, `watchlist:remove:${w.ticker}`));
  const rows = removes.length ? [removes] : [];
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
  ctx.session.step = "awaiting_ticker";
});

composer.callbackQuery(/^watchlist:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = ctx.match[1];
  const uid = ctx.from?.id ?? 0;
  await removeFromWatchlist(uid, t);
  await ctx.editMessageText(`Removed ${t}.`, {
    reply_markup: inlineKeyboard([[inlineButton("➕ Add more", "watchlist:add"), inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
  ctx.session.step = undefined;
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_ticker") return next();
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) {
    ctx.session.step = undefined;
    return next();
  }
  const uid = ctx.from?.id ?? 0;
  const parts = text.split(/\s+/, 2);
  const ticker = parts[0].toUpperCase();
  const nick = parts[1];
  const id = await resolveCoinId(ticker);
  if (!id) {
    ctx.session.pendingTicker = ticker;
    ctx.session.step = "awaiting_price_confirm";
    await ctx.reply(`Ticker ${ticker} not found on price feed. Add anyway?`, {
      reply_markup: confirmKeyboard("watchlist:confirm"),
    });
    return;
  }
  ctx.session.pendingTicker = ticker;
  if (nick) {
    await addToWatchlist(uid, { ticker, nickname: nick });
    ctx.session.step = undefined;
    await ctx.reply(`Added ${ticker} as "${nick}".`, {
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 Set alerts", "alerts:manage"), inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  } else {
    ctx.session.step = "awaiting_nickname";
    await ctx.reply(`Added ${ticker}. Nickname? (or tap skip)`, {
      reply_markup: inlineKeyboard([[inlineButton("Skip", "watchlist:nick:skip")], [inlineButton("⬅️ Cancel", "menu:main")]]),
    });
  }
});

composer.callbackQuery("watchlist:nick:skip", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  const t = ctx.session.pendingTicker;
  if (t) await addToWatchlist(uid, { ticker: t });
  ctx.session.step = undefined;
  ctx.session.pendingTicker = undefined;
  await ctx.editMessageText(`Added ${t}.`, {
    reply_markup: inlineKeyboard([[inlineButton("🔔 Set alerts", "alerts:manage"), inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery(/^watchlist:confirm:(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const choice = ctx.match[1];
  const uid = ctx.from?.id ?? 0;
  const t = ctx.session.pendingTicker;
  ctx.session.step = undefined;
  ctx.session.pendingTicker = undefined;
  if (choice === "yes" && t) {
    await addToWatchlist(uid, { ticker: t });
    await ctx.editMessageText(`Added ${t} (unconfirmed).`, {
      reply_markup: inlineKeyboard([[inlineButton("🔔 Set alerts", "alerts:manage"), inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
  } else {
    await ctx.editMessageText("Not added.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) });
  }
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_nickname") return next();
  const nick = ctx.message.text.trim();
  const uid = ctx.from?.id ?? 0;
  const t = ctx.session.pendingTicker;
  if (t && nick && !nick.startsWith("/")) {
    await addToWatchlist(uid, { ticker: t, nickname: nick });
  } else if (t) {
    await addToWatchlist(uid, { ticker: t });
  }
  ctx.session.step = undefined;
  ctx.session.pendingTicker = undefined;
  await ctx.reply(`Added ${t}${nick && !nick.startsWith("/") ? ` as "${nick}"` : ""}.`, {
    reply_markup: inlineKeyboard([[inlineButton("🔔 Set alerts", "alerts:manage"), inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
