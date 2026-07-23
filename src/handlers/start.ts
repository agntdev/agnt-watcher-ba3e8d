import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { ensureUserIndexed, getWatchlist, addToWatchlist } from "../store.js";
import { maybeDeliverMorning, checkAndFireAlerts } from "../alerts.js";

const composer = new Composer<Ctx>();

const WELCOME = "CryptoWatch — track prices, set alerts, receive summaries.\nWatchlist seeded with BTC, ETH, TON.";

async function seedDefaults(userId: number): Promise<void> {
  await ensureUserIndexed(userId);
  const wl = await getWatchlist(userId);
  if (wl.length === 0) {
    await addToWatchlist(userId, { ticker: "BTC" });
    await addToWatchlist(userId, { ticker: "ETH" });
    await addToWatchlist(userId, { ticker: "TON" });
  }
}

composer.command("start", async (ctx) => {
  const uid = ctx.from?.id ?? 0;
  await seedDefaults(uid);
  await checkAndFireAlerts(uid, (t) => ctx.reply(t) as any);
  await maybeDeliverMorning(uid, (t) => ctx.reply(t) as any);
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  await seedDefaults(uid);
  await checkAndFireAlerts(uid, (t) => ctx.reply(t) as any);
  await maybeDeliverMorning(uid, (t) => ctx.reply(t) as any);
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
