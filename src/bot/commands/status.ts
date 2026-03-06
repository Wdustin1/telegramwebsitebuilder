import { BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { InlineKeyboard } from "grammy";
import { logger } from "../../lib/logger.js";
import { esc } from "../../lib/html.js";

const log = logger.child({ module: "statusCommand" });

const STATUS_BADGE: Record<string, string> = {
  SCRAPING: "🟡 SCRAPING",
  READY: "🟢 READY",
  DONE: "✅ DONE",
};

export async function statusCommand(ctx: BotContext) {
  if (!ctx.from) return;

  log.info({ telegramId: ctx.from.id }, "status_query");

  const user = await prisma.user.findUnique({
    where: { telegramId: ctx.from.id },
  });

  if (!user) {
    await ctx.reply("Please run /start first.");
    return;
  }

  const campaigns = await prisma.campaign.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { leads: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (campaigns.length === 0) {
    await ctx.reply("No campaigns yet. Use /start to create one.");
    return;
  }

  let message = "📊 <b>Your Campaigns</b>\n";

  for (const campaign of campaigns) {
    const statusCounts = await prisma.lead.groupBy({
      by: ["status"],
      where: { campaignId: campaign.id },
      _count: { status: true },
    });

    const countMap = Object.fromEntries(
      statusCounts.map((s: any) => [s.status, s._count.status])
    );

    const totalLeads = campaign._count.leads;
    const websitesBuilt = totalLeads - (countMap["NEW"] ?? 0);
    const emailed = (countMap["EMAILED"] ?? 0) + (countMap["CALLED"] ?? 0) + (countMap["RESPONDED"] ?? 0);
    const called = (countMap["CALLED"] ?? 0) + (countMap["RESPONDED"] ?? 0);
    const responded = countMap["RESPONDED"] ?? 0;

    const badge = STATUS_BADGE[campaign.status] ?? campaign.status;

    message +=
      `\n${badge}\n` +
      `<b>${esc(campaign.niche)}</b> in <b>${esc(campaign.city)}</b>\n` +
      `👥 ${totalLeads} leads · 🌐 ${websitesBuilt} sites · 📧 ${emailed} emails · 📞 ${called} calls · 💬 ${responded} responses\n`;
  }

  const keyboard = new InlineKeyboard().text(
    "🚀 Create New Campaign",
    "new_campaign"
  );

  await ctx.reply(message, { reply_markup: keyboard, parse_mode: "HTML" });
}
