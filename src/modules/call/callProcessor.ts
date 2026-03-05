import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { makeCall } from "./blandClient.js";
import { env } from "../../config/env.js";

export interface CallJobData {
  leadId: number;
  telegramId: number;
}

function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

function msUntilNextBusinessHour(): number {
  const now = new Date();
  const next = new Date(now);

  if (now.getDay() === 5 && now.getHours() >= 17) {
    next.setDate(now.getDate() + 3); // Skip to Monday
  } else if (now.getDay() === 6) {
    next.setDate(now.getDate() + 2);
  } else if (now.getDay() === 0) {
    next.setDate(now.getDate() + 1);
  } else if (now.getHours() >= 17) {
    next.setDate(now.getDate() + 1);
  }

  next.setHours(9, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export async function processCallJob(job: Job<CallJobData>) {
  if (!isBusinessHours()) {
    const delay = msUntilNextBusinessHour();
    await job.moveToDelayed(Date.now() + delay);
    return { delayed: true, reason: "outside business hours" };
  }

  const { leadId } = job.data;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { website: true, campaign: true },
  });

  if (!lead.phone) {
    return { called: false, reason: "no phone number" };
  }

  const prompt =
    `You're calling ${lead.businessName}, a ${lead.campaign.niche.toLowerCase()} in ${lead.campaign.city}. ` +
    `You built them a free website at ${lead.website?.vercelUrl ?? "our platform"}. ` +
    `Your goal is to let them know about the website and see if they'd like to keep it for a small monthly fee. ` +
    `Be friendly, professional, and brief. If they're not interested, thank them and end the call.`;

  const result = await makeCall({
    phoneNumber: lead.phone,
    prompt,
    webhookUrl: `${env.WEBHOOK_BASE_URL}/webhooks/bland`,
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

  return { called: true, callId: result.call_id };
}
