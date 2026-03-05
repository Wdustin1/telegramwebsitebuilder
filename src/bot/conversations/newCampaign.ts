import { InlineKeyboard } from "grammy";
import { BotConversation, BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { scrapeQueue } from "../../jobs/queues.js";

const NICHES = [
  "Plumber",
  "Roofer",
  "HVAC",
  "Pressure Washer",
  "Electrician",
  "Landscaper",
  "Painter",
  "Handyman",
];

export async function newCampaignConversation(
  conversation: BotConversation,
  ctx: BotContext
) {
  // Step 1: Pick niche
  const nicheKeyboard = new InlineKeyboard();
  for (let i = 0; i < NICHES.length; i += 2) {
    const row = nicheKeyboard;
    row.text(NICHES[i], `niche_${NICHES[i]}`);
    if (NICHES[i + 1]) row.text(NICHES[i + 1], `niche_${NICHES[i + 1]}`);
    nicheKeyboard.row();
  }

  await ctx.reply("What type of business do you want to target?", {
    reply_markup: nicheKeyboard,
  });

  const nicheResponse = await conversation.waitForCallbackQuery(/^niche_/);
  const niche = nicheResponse.callbackQuery.data.replace("niche_", "");
  await nicheResponse.answerCallbackQuery();
  await nicheResponse.editMessageText(`Niche selected: ${niche}`);

  // Step 2: Pick city
  await ctx.reply("What city do you want to target? Type the city name:");
  const cityResponse = await conversation.waitFor("message:text");
  const city = cityResponse.message.text.trim();

  // Step 3: Confirm
  const confirmKeyboard = new InlineKeyboard()
    .text("Yes, start scraping", "confirm_campaign")
    .text("Cancel", "cancel_campaign");

  await ctx.reply(
    `Find ${niche.toLowerCase()}s in ${city} without websites?`,
    { reply_markup: confirmKeyboard }
  );

  const confirmResponse = await conversation.waitForCallbackQuery(
    /^(confirm|cancel)_campaign$/
  );
  await confirmResponse.answerCallbackQuery();

  if (confirmResponse.callbackQuery.data === "cancel_campaign") {
    await confirmResponse.editMessageText("Campaign cancelled.");
    return;
  }

  // Create campaign in DB
  const user = await prisma.user.findUnique({
    where: { telegramId: ctx.from!.id },
  });

  const campaign = await prisma.campaign.create({
    data: {
      userId: user!.id,
      niche,
      city,
      status: "SCRAPING",
    },
  });

  await confirmResponse.editMessageText(
    `Campaign created! Scraping ${niche.toLowerCase()}s in ${city}...\n` +
      "I'll notify you when results are ready."
  );

  await scrapeQueue.add("scrape-campaign", {
    campaignId: campaign.id,
    niche,
    city,
    telegramId: ctx.from!.id,
  });
}
