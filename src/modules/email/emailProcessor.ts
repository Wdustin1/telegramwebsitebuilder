import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { findEmailByName } from "./hunterLookup.js";
import { sendEmail } from "./sendEmail.js";
import { getEmailSequence } from "./emailTemplates.js";
import { emailSendQueue, emailFollowupQueue } from "../../jobs/queues.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "emailProcessor" });

export interface EmailFindJobData {
  leadId: number;
  telegramId: number;
  campaignId: number;
}

export async function processEmailFindJob(job: Job<EmailFindJobData>) {
  const { leadId } = job.data;

  log.info({ leadId, jobId: job.id }, "email_find_started");

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
  });

  if (lead.ownerEmail) {
    log.info({ leadId, email: lead.ownerEmail }, "email_already_exists");
    return { email: lead.ownerEmail, alreadyHad: true };
  }

  // Extract domain from website URL if the lead has one (rare for our targets,
  // but Outscraper occasionally returns a site field even for low-quality sites).
  let domain: string | undefined;
  const leadWithSite = lead as typeof lead & { site?: string };
  if (leadWithSite.site) {
    try {
      domain = new URL(leadWithSite.site).hostname.replace(/^www\./, "");
    } catch {
      // invalid URL — skip domain
    }
  }

  const email = await findEmailByName(lead.businessName, domain);

  if (!email) {
    log.info({ leadId }, "email_not_found");
    return { email: null, found: false };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { ownerEmail: email },
  });

  log.info({ leadId, email }, "email_found");

  return { email, found: true };
}

export interface EmailSendJobData {
  leadId: number;
  sequenceNumber: number;
  telegramId: number;
}

export async function processEmailSendJob(job: Job<EmailSendJobData>) {
  const { leadId, sequenceNumber, telegramId } = job.data;

  log.info({ leadId, sequenceNumber, jobId: job.id }, "email_send_started");

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { website: true, campaign: true },
  });

  if (!lead.ownerEmail || !lead.website) {
    log.warn({ leadId }, "email_send_skipped_missing_data");
    return { sent: false, reason: "no email or website" };
  }

  // Check if previous email bounced
  const bouncedEmail = await prisma.email.findFirst({
    where: { leadId, status: "BOUNCED" },
  });
  if (bouncedEmail) {
    log.warn({ leadId }, "email_send_skipped_bounce");
    return { sent: false, reason: "previous bounce" };
  }

  const sequence = getEmailSequence({
    businessName: lead.businessName,
    niche: lead.campaign.niche,
    city: lead.campaign.city,
    websiteUrl: lead.website.vercelUrl,
    unsubscribeUrl: `${env.WEBHOOK_BASE_URL}/unsubscribe?email=${encodeURIComponent(lead.ownerEmail)}`,
  });

  const template = sequence.find((s) => s.sequenceNumber === sequenceNumber);
  if (!template) return { sent: false, reason: "invalid sequence number" };

  await sendEmail(lead.ownerEmail, template.subject, template.body);

  await prisma.email.create({
    data: {
      leadId,
      subject: template.subject,
      body: template.body,
      status: "SENT",
      sequenceNumber,
      sentAt: new Date(),
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "EMAILED" },
  });

  // Schedule next follow-up if not the last email
  const nextTemplate = sequence.find(
    (s) => s.sequenceNumber === sequenceNumber + 1
  );
  if (nextTemplate) {
    log.info({ leadId, nextSequence: sequenceNumber + 1, delayMs: nextTemplate.delay }, "followup_scheduled");
    await emailFollowupQueue.add(
      `followup-${leadId}-${sequenceNumber + 1}`,
      { leadId, sequenceNumber: sequenceNumber + 1, telegramId },
      { delay: nextTemplate.delay }
    );
  }

  log.info({ leadId, sequenceNumber, recipient: lead.ownerEmail }, "email_sent");

  return { sent: true, sequenceNumber };
}
