import { BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { InlineKeyboard } from "grammy";

export async function statusCommand(ctx: BotContext) {
  if (!ctx.from) return;

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

  let message = "Your Campaigns:\n\n";

  for (const campaign of campaigns) {
    const leads = await prisma.lead.findMany({
      where: { campaignId: campaign.id },
    });

    const websitesBuilt = leads.filter(
      (l) => l.status !== "NEW"
    ).length;
    const emailed = leads.filter(
      (l) => l.status === "EMAILED" || l.status === "CALLED" || l.status === "RESPONDED"
    ).length;
    const called = leads.filter(
      (l) => l.status === "CALLED" || l.status === "RESPONDED"
    ).length;
    const responded = leads.filter(
      (l) => l.status === "RESPONDED"
    ).length;

    message +=
      `${campaign.niche} in ${campaign.city} [${campaign.status}]\n` +
      `  Leads: ${campaign._count.leads} | Sites: ${websitesBuilt} | ` +
      `Emails: ${emailed} | Calls: ${called} | Responses: ${responded}\n\n`;
  }

  const keyboard = new InlineKeyboard().text(
    "Create New Campaign",
    "new_campaign"
  );

  await ctx.reply(message, { reply_markup: keyboard });
}
