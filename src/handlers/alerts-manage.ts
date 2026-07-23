import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, confirmKeyboard } from "../toolkit/index.js";
import { getWatchlist, getThresholdAlerts, getPercentAlerts, addThresholdAlert, addPercentAlert, removeThresholdAlert, removePercentAlert } from "../store.js";

registerMainMenuItem({ label: "🔔 Manage Alerts", data: "alerts:manage", order: 15 });

const composer = new Composer<Ctx>();

function alertsMenu(kbExtra: any[] = []) {
  return inlineKeyboard([
    ...kbExtra,
    [inlineButton("➕ Threshold", "alerts:threshold"), inlineButton("📈 Percent", "alerts:percent")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
}

composer.callbackQuery("alerts:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  const wl = await getWatchlist(uid);
  const ths = await getThresholdAlerts(uid);
  const pcts = await getPercentAlerts(uid);
  let text = "Alerts:\n";
  if (ths.length === 0 && pcts.length === 0) text += "No alerts set.\n";
  for (const a of ths) text += `• ${a.ticker} ${a.direction} $${a.usd}\n`;
  for (const a of pcts) text += `• ${a.ticker} ±${a.percent}%\n`;
  const tickerBtns = wl.slice(0, 6).map((w) => inlineButton(w.ticker, `alerts:pick:${w.ticker}`));
  const rows = tickerBtns.length ? [tickerBtns] : [];
  await ctx.reply(text.trim(), { reply_markup: inlineKeyboard([...rows, ...alertsMenu()[ "inline_keyboard" ]]) });
});

composer.callbackQuery(/^alerts:pick:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = ctx.match[1];
  ctx.session.pendingAlertTicker = t;
  await ctx.editMessageText(`Alerts for ${t}. Choose type:`, {
    reply_markup: alertsMenu(),
  });
});

composer.callbackQuery("alerts:threshold", async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = ctx.session.pendingAlertTicker;
  if (!t) {
    await ctx.reply("Select ticker first from watchlist.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "alerts:manage")]]) });
    return;
  }
  ctx.session.step = "awaiting_threshold_price";
  ctx.session.pendingAlertType = "threshold";
  await ctx.reply(`Enter USD target for ${t} (e.g. 65000):`, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cancel", "alerts:manage")]]) });
});

composer.callbackQuery("alerts:percent", async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = ctx.session.pendingAlertTicker;
  if (!t) {
    await ctx.reply("Select ticker first.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cancel", "alerts:manage")]]) });
    return;
  }
  ctx.session.step = "awaiting_percent";
  ctx.session.pendingAlertType = "percent";
  await ctx.reply(`Enter percent move for ${t} over 1h (e.g. 5):`, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cancel", "alerts:manage")]]) });
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (step !== "awaiting_threshold_price" && step !== "awaiting_percent") return next();
  const val = parseFloat(ctx.message.text.trim());
  const uid = ctx.from?.id ?? 0;
  const t = ctx.session.pendingAlertTicker || "";
  if (!t || isNaN(val) || val <= 0) {
    await ctx.reply("Invalid. Enter a positive number.");
    return;
  }
  if (step === "awaiting_threshold_price") {
    ctx.session.step = "awaiting_dir";
    (ctx.session as any).pendingPrice = val;
    await ctx.reply(`For ${t} at $${val}, direction?`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬆️ Above", "alerts:setdir:above"), inlineButton("⬇️ Below", "alerts:setdir:below")],
      ]),
    });
  } else if (step === "awaiting_percent") {
    ctx.session.step = "idle";
    await addPercentAlert(uid, { ticker: t, percent: val });
    ctx.session.pendingAlertTicker = undefined;
    ctx.session.pendingAlertType = undefined;
    await ctx.reply(`Percent alert set: ${t} ±${val}% (1h)`, {
      reply_markup: inlineKeyboard([[inlineButton("Manage Alerts", "alerts:manage"), inlineButton("⬅️ Menu", "menu:main")]]),
    });
  }
});

composer.callbackQuery(/^alerts:setdir:(above|below)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const dir = ctx.match[1] as "above" | "below";
  const uid = ctx.from?.id ?? 0;
  const t = ctx.session.pendingAlertTicker || "";
  const price = (ctx.session as any).pendingPrice as number;
  if (t && price) {
    await addThresholdAlert(uid, { ticker: t, direction: dir, usd: price });
  }
  ctx.session.step = "idle";
  ctx.session.pendingAlertTicker = undefined;
  (ctx.session as any).pendingPrice = undefined;
  await ctx.editMessageText(`Threshold set: ${t} ${dir} $${price}`, {
    reply_markup: inlineKeyboard([[inlineButton("Manage Alerts", "alerts:manage"), inlineButton("⬅️ Menu", "menu:main")]]),
  });
});

composer.callbackQuery(/^alerts:remove:t:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const uid = ctx.from?.id ?? 0;
  await removeThresholdAlert(uid, id);
  await ctx.editMessageText("Threshold removed.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "alerts:manage")]]) });
});

composer.callbackQuery(/^alerts:remove:p:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const uid = ctx.from?.id ?? 0;
  await removePercentAlert(uid, id);
  await ctx.editMessageText("Percent alert removed.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "alerts:manage")]]) });
});

export default composer;
