import { env } from "./config/env.js";
import { createBot } from "./bot/bot.js";
import { startCommand } from "./bot/commands/start.js";
import { statusCommand } from "./bot/commands/status.js";
import { startWorkers } from "./jobs/workers.js";
import { startWebhookServer } from "./webhooks/server.js";
import { setBlandWebhookBot } from "./webhooks/blandWebhook.js";
import { setSendGridWebhookBot } from "./webhooks/sendgridWebhook.js";
import {
  handleViewLeads,
  handleBuildWebsites,
  handleConfirmBuild,
  handleStartEmails,
  handleConfirmEmails,
  handleStartCalls,
  handleConfirmCalls,
} from "./bot/handlers/campaignActions.js";

async function main() {
  const bot = createBot();

  // Commands
  bot.command("start", startCommand);
  bot.command("status", statusCommand);

  // Campaign creation
  bot.callbackQuery("new_campaign", async (ctx) => {
    await ctx.conversation.enter("newCampaignConversation");
  });

  // Campaign action routing
  bot.callbackQuery(/^view_leads_(\d+)$/, async (ctx) => {
    const campaignId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleViewLeads(ctx, campaignId);
  });

  bot.callbackQuery(/^build_websites_(\d+)$/, async (ctx) => {
    const campaignId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleBuildWebsites(ctx, campaignId);
  });

  bot.callbackQuery(/^confirm_build_(\d+)$/, async (ctx) => {
    const campaignId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleConfirmBuild(ctx, campaignId);
  });

  bot.callbackQuery(/^start_emails_(\d+)$/, async (ctx) => {
    const campaignId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleStartEmails(ctx, campaignId);
  });

  bot.callbackQuery(/^confirm_emails_(\d+)$/, async (ctx) => {
    const campaignId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleConfirmEmails(ctx, campaignId);
  });

  bot.callbackQuery(/^start_calls_(\d+)$/, async (ctx) => {
    const campaignId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleStartCalls(ctx, campaignId);
  });

  bot.callbackQuery(/^confirm_calls_(\d+)$/, async (ctx) => {
    const campaignId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await handleConfirmCalls(ctx, campaignId);
  });

  bot.callbackQuery("cancel_action", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Action cancelled.");
  });

  // Start workers with bot for notifications
  const workers = startWorkers(bot);

  // Start webhook server
  setBlandWebhookBot(bot);
  setSendGridWebhookBot(bot);
  const webhookServer = startWebhookServer(3000);

  // Graceful shutdown
  async function shutdown() {
    console.log("Shutting down gracefully...");
    bot.stop();
    for (const worker of workers) {
      await worker.close();
    }
    webhookServer.close();
    const { prisma } = await import("./db/client.js");
    await prisma.$disconnect();
    console.log("Shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Start bot
  bot.start();
  console.log("Bot is running...");
}

main().catch(console.error);
