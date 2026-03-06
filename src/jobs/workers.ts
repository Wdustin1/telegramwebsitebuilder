import { Worker } from "bullmq";
import { InlineKeyboard, Bot } from "grammy";
import { redisConnection } from "./connection.js";
import { emailSendQueue } from "./queues.js";
import { processScrapeJob, ScrapeJobData } from "../modules/find/scrapeProcessor.js";
import { processBuildJob, BuildJobData } from "../modules/build/buildProcessor.js";
import { processEmailFindJob, processEmailSendJob, EmailFindJobData, EmailSendJobData } from "../modules/email/emailProcessor.js";
import { processCallJob, CallJobData } from "../modules/call/callProcessor.js";
import { BotContext } from "../bot/bot.js";
import { logger } from "../lib/logger.js";
import { esc } from "../lib/html.js";

const log = logger.child({ module: "workers" });

export function startWorkers(bot: Bot<BotContext>) {
  const scrapeWorker = new Worker<ScrapeJobData>(
    "scrape",
    processScrapeJob,
    { connection: redisConnection, concurrency: 1 }
  );

  scrapeWorker.on("completed", async (job) => {
    if (!job) return;
    log.info({ jobId: job.id, jobName: job.name }, "job_completed");
    const { telegramId } = job.data;
    const result = job.returnvalue;
    const keyboard = new InlineKeyboard()
      .text("📋 View Leads", `view_leads_${job.data.campaignId}`)
      .text("🔨 Build Websites", `build_websites_${job.data.campaignId}`);

    await bot.api.sendMessage(
      telegramId,
      `🎯 <b>Scraping complete!</b>\n\n` +
        `👥 Found <b>${result.totalFound}</b> businesses\n` +
        `🚫 <b>${result.withoutWebsite}</b> don't have websites`,
      { reply_markup: keyboard, parse_mode: "HTML" }
    );
  });

  scrapeWorker.on("failed", async (job) => {
    if (!job) return;
    log.error({ jobId: job.id, jobName: job.name, reason: job.failedReason }, "job_failed");
    await bot.api.sendMessage(
      job.data.telegramId,
      `❌ <b>Scraping failed</b>\n\n${esc(job.failedReason ?? "Unknown error")}. Please try again.`,
      { parse_mode: "HTML" }
    );
  });

  const buildWorker = new Worker<BuildJobData>(
    "build",
    processBuildJob,
    { connection: redisConnection, concurrency: 3 }
  );

  buildWorker.on("completed", async (job) => {
    if (!job) return;
    log.info({ jobId: job.id, jobName: job.name }, "job_completed");
    const { telegramId } = job.data;
    const result = job.returnvalue;
    await bot.api.sendMessage(
      telegramId,
      `🌐 <b>Website built!</b>\n\n` +
        `Lead #${result.leadId}: <a href="${esc(result.vercelUrl)}">${esc(result.vercelUrl)}</a>`,
      { parse_mode: "HTML" }
    );
  });

  buildWorker.on("failed", async (job) => {
    if (!job) return;
    log.error({ jobId: job.id, jobName: job.name, reason: job.failedReason }, "job_failed");
    await bot.api.sendMessage(
      job.data.telegramId,
      `❌ <b>Website build failed</b> for lead #${job.data.leadId}\n\n${esc(job.failedReason ?? "Unknown error")}`,
      { parse_mode: "HTML" }
    );
  });

  const emailFindWorker = new Worker<EmailFindJobData>(
    "email-find",
    processEmailFindJob,
    { connection: redisConnection, concurrency: 5 }
  );

  emailFindWorker.on("completed", async (job) => {
    if (!job) return;
    log.info({ jobId: job.id, jobName: job.name }, "job_completed");
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
    log.info({ jobId: job.id, jobName: job.name }, "job_completed");
    const result = job.returnvalue;
    if (result.sent) {
      await bot.api.sendMessage(
        job.data.telegramId,
        `📧 <b>Email sent!</b>\n\nSequence #${result.sequenceNumber} → Lead #${job.data.leadId}`,
        { parse_mode: "HTML" }
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
    log.error({ jobId: job.id, jobName: job.name, reason: job.failedReason }, "job_failed");
    await bot.api.sendMessage(
      job.data.telegramId,
      `❌ <b>Call failed</b> for lead #${job.data.leadId}\n\n${esc(job.failedReason ?? "Unknown error")}`,
      { parse_mode: "HTML" }
    );
  });

  log.info("workers_started");

  return [
    scrapeWorker,
    buildWorker,
    emailFindWorker,
    emailSendWorker,
    emailFollowupWorker,
    callWorker,
  ];
}
