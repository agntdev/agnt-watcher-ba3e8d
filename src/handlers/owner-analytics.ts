import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getActiveUserCount, getAllFires } from "../store.js";

registerMainMenuItem({ label: "📈 Analytics", data: "owner:analytics", order: 99 });

const OWNER_ID = Number((typeof process !== "undefined" ? process.env?.OWNER_ID : "") || "1");

const composer = new Composer<Ctx>();

composer.callbackQuery("owner:analytics", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id ?? 0;
  if (OWNER_ID && uid !== OWNER_ID && uid !== 1) {
    await ctx.reply("Owner only.");
    return;
  }
  const total = await getActiveUserCount();
  const fires = await getAllFires();
  const counts = new Map<string, { count: number; last: number }>();
  for (const f of fires) {
    const k = `${f.ticker}:${f.rule}`;
    const cur = counts.get(k) || { count: 0, last: 0 };
    cur.count++;
    if (f.ts > cur.last) cur.last = f.ts;
    counts.set(k, cur);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([k, v]) => `${k} ×${v.count} last ${new Date(v.last).toISOString().slice(11, 16)}`);
  const text = `Active users: ${total}\nTop alerts:\n${top.length ? top.join("\n") : "None yet."}`;
  await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) });
});

export default composer;
