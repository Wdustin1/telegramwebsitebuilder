import { InlineKeyboard } from "grammy";
import { BotConversation, BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { scrapeQueue } from "../../jobs/queues.js";
import { logger } from "../../lib/logger.js";
import { esc } from "../../lib/html.js";

const log = logger.child({ module: "newCampaign" });

const NICHES: { label: string; emoji: string }[] = [
  { label: "Plumber", emoji: "🔧" },
  { label: "Roofer", emoji: "🏠" },
  { label: "HVAC", emoji: "❄️" },
  { label: "Pressure Washer", emoji: "💦" },
  { label: "Electrician", emoji: "⚡" },
  { label: "Landscaper", emoji: "🌿" },
  { label: "Painter", emoji: "🎨" },
  { label: "Handyman", emoji: "🔨" },
];

export async function newCampaignConversation(
  conversation: BotConversation,
  ctx: BotContext
) {
  log.info({ telegramId: ctx.from?.id }, "conversation_started");

  // Step 1: Pick niche
  const nicheKeyboard = new InlineKeyboard();
  for (let i = 0; i < NICHES.length; i += 2) {
    const row = nicheKeyboard;
    row.text(`${NICHES[i].emoji} ${NICHES[i].label}`, `niche_${NICHES[i].label}`);
    if (NICHES[i + 1]) row.text(`${NICHES[i + 1].emoji} ${NICHES[i + 1].label}`, `niche_${NICHES[i + 1].label}`);
    nicheKeyboard.row();
  }

  await ctx.reply("🎯 <b>What type of business do you want to target?</b>", {
    reply_markup: nicheKeyboard,
    parse_mode: "HTML",
  });

  const nicheResponse = await conversation.waitForCallbackQuery(/^niche_/);
  const niche = nicheResponse.callbackQuery.data.replace("niche_", "");
  await nicheResponse.answerCallbackQuery();
  await nicheResponse.editMessageText(`✅ Niche selected: <b>${esc(niche)}</b>`, {
    parse_mode: "HTML",
  });

  // Step 2: Pick city
  await ctx.reply("📍 <b>What city do you want to target?</b>\n\nType the city name:", {
    parse_mode: "HTML",
  });
  const cityResponse = await conversation.waitFor("message:text");
  const city = cityResponse.message.text.trim();

  // Step 3: Confirm
  const confirmKeyboard = new InlineKeyboard()
    .text("✅ Yes, start scraping", "confirm_campaign")
    .text("❌ Cancel", "cancel_campaign");

  await ctx.reply(
    `🔍 Find <b>${esc(niche.toLowerCase())}s</b> in <b>${esc(city)}</b> without websites?`,
    { reply_markup: confirmKeyboard, parse_mode: "HTML" }
  );

  const confirmResponse = await conversation.waitForCallbackQuery(
    /^(confirm|cancel)_campaign$/
  );
  await confirmResponse.answerCallbackQuery();

  if (confirmResponse.callbackQuery.data === "cancel_campaign") {
    await confirmResponse.editMessageText("❌ Campaign cancelled.");
    return;
  }

  // Guard against missing user context
  if (!ctx.from) {
    await ctx.reply("Unable to identify user. Please try again.");
    return;
  }

  // Create campaign in DB
  const user = await prisma.user.findUnique({
    where: { telegramId: ctx.from.id },
  });

  if (!user) {
    await ctx.reply("Please run /start first.");
    return;
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      niche,
      city,
      status: "SCRAPING",
    },
  });

  log.info({ campaignId: campaign.id, niche, city }, "campaign_created");

  await confirmResponse.editMessageText(
    `🚀 <b>Campaign created!</b>\n\n` +
      `Scraping <b>${esc(niche.toLowerCase())}s</b> in <b>${esc(city)}</b>…\n` +
      `I'll notify you when results are ready.`,
    { parse_mode: "HTML" }
  );

  await scrapeQueue.add("scrape-campaign", {
    campaignId: campaign.id,
    niche,
    city,
    telegramId: ctx.from.id,
  });

  log.info({ campaignId: campaign.id }, "scrape_job_queued");
}
