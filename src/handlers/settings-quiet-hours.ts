import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, saveProfile } from "../store.js";

registerMainMenuItem({ label: "🔕 Quiet Hours", data: "settings:quiet_hours", order: 30 });

const composer = new Composer<Ctx>();

composer.callbackQuery("settings:quiet_hours", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  const p = await getProfile(uid);
  const q = p.quietHours ? `${p.quietHours.start}-${p.quietHours.end}` : "off";
  const sum = p.summaryInQuiet ? "deliver summary in quiet" : "queue alerts, send after";
  const text = `Quiet hours: ${q}\nSummary: ${sum}`;
  await ctx.reply(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("Set start", "quiet:start"), inlineButton("Set end", "quiet:end")],
      [inlineButton("Summary in quiet: toggle", "quiet:toggle")],
      [inlineButton("⬅️ Back", "menu:main")],
    ]),
  });
});

composer.callbackQuery("quiet:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_quiet_start";
  await ctx.reply("Send quiet start HH:MM (e.g. 22:00)", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cancel", "settings:quiet_hours")]]) });
});

composer.callbackQuery("quiet:end", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_quiet_end";
  await ctx.reply("Send quiet end HH:MM (e.g. 07:00)", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cancel", "settings:quiet_hours")]]) });
});

composer.callbackQuery("quiet:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  const p = await getProfile(uid);
  const newPref = !p.summaryInQuiet;
  await saveProfile(uid, { summaryInQuiet: newPref });
  await ctx.editMessageText(`Summary in quiet: ${newPref ? "on" : "off (queue)"}`, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "settings:quiet_hours")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (step !== "awaiting_quiet_start" && step !== "awaiting_quiet_end") return next();
  const t = ctx.message.text.trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) {
    await ctx.reply("Use HH:MM");
    return;
  }
  const uid = ctx.from?.id ?? 0;
  const p = await getProfile(uid);
  const q = p.quietHours || { start: "22:00", end: "07:00" };
  if (step === "awaiting_quiet_start") {
    q.start = t;
  } else {
    q.end = t;
  }
  await saveProfile(uid, { quietHours: q });
  ctx.session.step = undefined;
  await ctx.reply(`Quiet hours updated to ${q.start}-${q.end}.`, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "settings:quiet_hours")]]),
  });
});

export default composer;
