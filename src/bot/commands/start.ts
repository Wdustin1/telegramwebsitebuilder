import { BotContext } from "../bot.js";
import { InlineKeyboard } from "grammy";
import { prisma } from "../../db/client.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "startCommand" });

export async function startCommand(ctx: BotContext) {
  if (!ctx.from) return;

  log.info({ telegramId: ctx.from.id }, "user_start");

  await prisma.user.upsert({
    where: { telegramId: ctx.from.id },
    update: { username: ctx.from.username ?? null },
    create: {
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
    },
  });

  log.info({ telegramId: ctx.from.id, username: ctx.from.username }, "user_upserted");

  const keyboard = new InlineKeyboard().text(
    "🚀 Create New Campaign",
    "new_campaign"
  );

  await ctx.reply(
    `🏗 <b>Website Builder Bot</b>\n\n` +
      `I help you grow your business in 3 steps:\n\n` +
      `🔍 <b>Find</b> — discover local businesses without websites\n` +
      `🌐 <b>Build</b> — generate professional sites for them\n` +
      `📣 <b>Outreach</b> — email &amp; call to offer your services\n\n` +
      `Tap below to get started.`,
    { reply_markup: keyboard, parse_mode: "HTML" }
  );
}
