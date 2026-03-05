import { Worker } from "bullmq";
import { InlineKeyboard, Bot } from "grammy";
import { redisConnection } from "./connection.js";
import { emailSendQueue } from "./queues.js";
import { processScrapeJob, ScrapeJobData } from "../modules/find/scrapeProcessor.js";
import { processBuildJob, BuildJobData } from "../modules/build/buildProcessor.js";
import { processEmailFindJob, processEmailSendJob, EmailFindJobData, EmailSendJobData } from "../modules/email/emailProcessor.js";
import { processCallJob, CallJobData } from "../modules/call/callProcessor.js";
import { BotContext } from "../bot/bot.js";

export function startWorkers(bot: Bot<BotContext>) {
  const scrapeWorker = new Worker<ScrapeJobData>(
    "scrape",
    processScrapeJob,
    { connection: redisConnection, concurrency: 1 }
  );

  scrapeWorker.on("completed", async (job) => {
    if (!job) return;
    const { telegramId } = job.data;
    const result = job.returnvalue;
    const keyboard = new InlineKeyboard()
      .text("View Leads", `view_leads_${job.data.campaignId}`)
      .text("Build Websites", `build_websites_${job.data.campaignId}`);

    await bot.api.sendMessage(
      telegramId,
      `Scraping complete!\n\n` +
        `Found ${result.totalFound} businesses.\n` +
        `${result.withoutWebsite} don't have websites.`,
      { reply_markup: keyboard }
    );
  });

  scrapeWorker.on("failed", async (job) => {
    if (!job) return;
    await bot.api.sendMessage(
      job.data.telegramId,
      `Scraping failed: ${job.failedReason}. Please try again.`
    );
  });

  const buildWorker = new Worker<BuildJobData>(
    "build",
    processBuildJob,
    { connection: redisConnection, concurrency: 3 }
  );

  buildWorker.on("completed", async (job) => {
    if (!job) return;
    const { telegramId } = job.data;
    const result = job.returnvalue;
    await bot.api.sendMessage(
      telegramId,
      `Website built for lead #${result.leadId}: ${result.vercelUrl}`
    );
  });

  buildWorker.on("failed", async (job) => {
    if (!job) return;
    await bot.api.sendMessage(
      job.data.telegramId,
      `Website build failed for lead #${job.data.leadId}: ${job.failedReason}`
    );
  });

  const emailFindWorker = new Worker<EmailFindJobData>(
    "email-find",
    processEmailFindJob,
    { connection: redisConnection, concurrency: 5 }
  );

  emailFindWorker.on("completed", async (job) => {
    if (!job) return;
    const result = job.returnvalue;
    if (result.email) {
      await emailSendQueue.add(`send-email-${job.data.leadId}-1`, {
        leadId: job.data.leadId,
        sequenceNumber: 1,
        telegramId: job.data.telegramId,
      });
    }
  });

  const emailSendWorker = new Worker<EmailSendJobData>(
    "email-send",
    processEmailSendJob,
    {
      connection: redisConnection,
      limiter: { max: 10, duration: 60000 },
    }
  );

  emailSendWorker.on("completed", async (job) => {
    if (!job) return;
    const result = job.returnvalue;
    if (result.sent) {
      await bot.api.sendMessage(
        job.data.telegramId,
        `Email #${result.sequenceNumber} sent to lead #${job.data.leadId}`
      );
    }
  });

  const emailFollowupWorker = new Worker<EmailSendJobData>(
    "email-followup",
    processEmailSendJob,
    {
      connection: redisConnection,
      limiter: { max: 10, duration: 60000 },
    }
  );

  const callWorker = new Worker<CallJobData>(
    "call",
    processCallJob,
    { connection: redisConnection, concurrency: 1 }
  );

  callWorker.on("failed", async (job) => {
    if (!job) return;
    await bot.api.sendMessage(
      job.data.telegramId,
      `Call failed for lead #${job.data.leadId}: ${job.failedReason}`
    );
  });

  console.log("All workers started");

  return [
    scrapeWorker,
    buildWorker,
    emailFindWorker,
    emailSendWorker,
    emailFollowupWorker,
    callWorker,
  ];
}
