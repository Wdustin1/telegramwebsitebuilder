import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { findEmailByName } from "./hunterLookup.js";
import { sendEmail } from "./sendEmail.js";
import { getEmailSequence } from "./emailTemplates.js";
import { emailSendQueue, emailFollowupQueue } from "../../jobs/queues.js";

export interface EmailFindJobData {
  leadId: number;
  telegramId: number;
  campaignId: number;
}

export async function processEmailFindJob(job: Job<EmailFindJobData>) {
  const { leadId } = job.data;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
  });

  if (lead.ownerEmail) return { email: lead.ownerEmail, alreadyHad: true };

  const email = await findEmailByName(lead.businessName);

  if (!email) return { email: null, found: false };

  await prisma.lead.update({
    where: { id: leadId },
    data: { ownerEmail: email },
  });

  return { email, found: true };
}

export interface EmailSendJobData {
  leadId: number;
  sequenceNumber: number;
  telegramId: number;
}

export async function processEmailSendJob(job: Job<EmailSendJobData>) {
  const { leadId, sequenceNumber, telegramId } = job.data;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { website: true, campaign: true },
  });

  if (!lead.ownerEmail || !lead.website) {
    return { sent: false, reason: "no email or website" };
  }

  // Check if previous email bounced
  const bouncedEmail = await prisma.email.findFirst({
    where: { leadId, status: "BOUNCED" },
  });
  if (bouncedEmail) return { sent: false, reason: "previous bounce" };

  const sequence = getEmailSequence({
    businessName: lead.businessName,
    niche: lead.campaign.niche,
    city: lead.campaign.city,
    websiteUrl: lead.website.vercelUrl,
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
    await emailFollowupQueue.add(
      `followup-${leadId}-${sequenceNumber + 1}`,
      { leadId, sequenceNumber: sequenceNumber + 1, telegramId },
      { delay: nextTemplate.delay }
    );
  }

  return { sent: true, sequenceNumber };
}
