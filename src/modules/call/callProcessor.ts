import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { makeCall } from "./blandClient.js";
import { env } from "../../config/env.js";
import { callQueue } from "../../jobs/queues.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "callProcessor" });

export interface CallJobData {
  leadId: number;
  telegramId: number;
  retryCount?: number;
}

/**
 * Check if it's currently business hours in the configured timezone.
 * Set CALL_TIMEZONE in env (e.g. "America/Chicago"). Defaults to "America/New_York".
 */
export function isBusinessHours(): boolean {
  const tz = env.CALL_TIMEZONE ?? "America/New_York";
  const now = new Date();

  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(now),
    10
  );

  const day = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    })
      .format(now)
      .replace(/[^0-9]/g, "") || "0",
    10
  );

  // Intl weekday short: Mon=1..Fri=5..Sat=6..Sun=0 — use numeric day instead
  const dayNum = new Date(
    now.toLocaleString("en-US", { timeZone: tz })
  ).getDay(); // 0=Sun, 1=Mon..5=Fri, 6=Sat

  return dayNum >= 1 && dayNum <= 5 && hour >= 9 && hour < 17;
}

export function msUntilNextBusinessHour(): number {
  const tz = env.CALL_TIMEZONE ?? "America/New_York";
  const now = new Date();

  // Get current time in target timezone
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const next = new Date(localNow);

  const day = localNow.getDay();
  const hour = localNow.getHours();

  if (day === 6) {
    // Saturday → Monday 9am
    next.setDate(localNow.getDate() + 2);
  } else if (day === 0) {
    // Sunday → Monday 9am
    next.setDate(localNow.getDate() + 1);
  } else if (day === 5 && hour >= 17) {
    // Friday after 5pm → Monday 9am
    next.setDate(localNow.getDate() + 3);
  } else if (hour >= 17) {
    // Weekday after 5pm → next day 9am
    next.setDate(localNow.getDate() + 1);
  }

  next.setHours(9, 0, 0, 0);

  // Convert back to UTC delta
  const nextUtc = new Date(
    next.toLocaleString("en-US", { timeZone: "UTC" })
  );

  return Math.max(0, next.getTime() - localNow.getTime());
}

export async function processCallJob(job: Job<CallJobData>) {
  const { leadId } = job.data;

  log.info({ leadId, jobId: job.id }, "call_job_started");

  if (!isBusinessHours()) {
    const delay = msUntilNextBusinessHour();

    log.info({ leadId, delayMs: delay }, "call_delayed_outside_hours");

    // Re-queue with delay instead of using job.moveToDelayed() which requires
    // the worker token and can throw in BullMQ v5 when called inside a processor.
    await callQueue.add(
      `call-delayed-${job.data.leadId}-${Date.now()}`,
      job.data,
      { delay, jobId: `call-bh-${job.data.leadId}` }
    );

    return { delayed: true, reason: "outside business hours", delayMs: delay };
  }

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { website: true, campaign: true },
  });

  if (!lead.phone) {
    log.warn({ leadId }, "call_skipped_no_phone");
    return { called: false, reason: "no phone number" };
  }

  const prompt =
    `You're calling ${lead.businessName}, a ${lead.campaign.niche.toLowerCase()} in ${lead.campaign.city}. ` +
    `You built them a free website at ${lead.website?.vercelUrl ?? "our platform"}. ` +
    `Your goal is to let them know about the website and see if they'd like to keep it for a small monthly fee. ` +
    `Be friendly, professional, and brief. If they're not interested, thank them and end the call.`;

  log.info({ leadId, phone: lead.phone }, "call_dispatching");

  const result = await makeCall({
    phoneNumber: lead.phone,
    prompt,
    webhookUrl: env.BLAND_WEBHOOK_SECRET
      ? `${env.WEBHOOK_BASE_URL}/webhooks/bland?secret=${env.BLAND_WEBHOOK_SECRET}`
      : `${env.WEBHOOK_BASE_URL}/webhooks/bland`,
  });

  await prisma.call.create({
    data: {
      leadId,
      blandCallId: result.call_id,
      status: "IN_PROGRESS",
      calledAt: new Date(),
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "CALLED" },
  });

  log.info({ leadId, callId: result.call_id }, "call_dispatched");

  return { called: true, callId: result.call_id };
}
