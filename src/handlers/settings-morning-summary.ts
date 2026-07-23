import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, saveProfile, getWatchlist } from "../store.js";
import { fetchPrices, formatPrice } from "../price-api.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "🌅 Morning Summary", data: "settings:morning_summary", order: 25 });

const composer = new Composer<Ctx>();

composer.callbackQuery("settings:morning_summary", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  const p = await getProfile(uid);
  const enabled = !!p.morningTime;
  const tm = p.morningTime || "08:00";
  const text = enabled
    ? `Morning summary enabled at ${tm} local.\nTap to change or disable.`
    : "Morning summary disabled. Set a delivery time to enable.";
  await ctx.reply(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("⏰ Set time", "morning:set"), inlineButton(enabled ? "Disable" : "Enable 08:00", enabled ? "morning:disable" : "morning:enable")],
      [inlineButton("👁 Preview summary", "morning:preview"), inlineButton("⬅️ Back", "menu:main")],
    ]),
  });
});

composer.callbackQuery("morning:set", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_morning_time";
  await ctx.reply("Send time as HH:MM (e.g. 07:30) in your local time.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Cancel", "settings:morning_summary")]]),
  });
});

composer.callbackQuery("morning:enable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  await saveProfile(uid, { morningTime: "08:00" });
  await ctx.editMessageText("Morning summary enabled at 08:00.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "menu:main")]]),
  });
});

composer.callbackQuery("morning:disable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  await saveProfile(uid, { morningTime: undefined });
  await ctx.editMessageText("Morning summary disabled.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "menu:main")]]),
  });
});

composer.callbackQuery("morning:preview", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  const wl = await getWatchlist(uid);
  const tks = wl.map((w) => w.ticker);
  const prices = await fetchPrices(tks);
  const lines = tks.length ? tks.map((t) => formatPrice(prices[t] ?? null, t)) : ["No tickers."];
  const text = `Morning summary preview (${now().toISOString().slice(0,10)}):\n` + lines.join("\n");
  await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "settings:morning_summary")]]) });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_morning_time") return next();
  const t = ctx.message.text.trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) {
    await ctx.reply("Format HH:MM e.g. 09:15");
    return;
  }
  const uid = ctx.from?.id ?? 0;
  await saveProfile(uid, { morningTime: t });
  ctx.session.step = undefined;
  await ctx.reply(`Morning summary set for ${t}.`, {
    reply_markup: inlineKeyboard([[inlineButton("👁 Preview", "morning:preview"), inlineButton("⬅️ Menu", "menu:main")]]),
  });
});

export default composer;
