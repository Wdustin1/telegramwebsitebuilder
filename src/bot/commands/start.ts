import { BotContext } from "../bot.js";
import { InlineKeyboard } from "grammy";
import { prisma } from "../../db/client.js";

export async function startCommand(ctx: BotContext) {
  if (!ctx.from) return;

  await prisma.user.upsert({
    where: { telegramId: ctx.from.id },
    update: { username: ctx.from.username ?? null },
    create: {
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
    },
  });

  const keyboard = new InlineKeyboard().text(
    "Create New Campaign",
    "new_campaign"
  );

  await ctx.reply(
    "Welcome to Website Builder Bot!\n\n" +
      "I help you find local businesses without websites, " +
      "build professional sites for them, and reach out via email and phone.\n\n" +
      "Tap below to get started.",
    { reply_markup: keyboard }
  );
}
