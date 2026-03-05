import { InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { buildQueue } from "../../jobs/queues.js";
import { emailFindQueue, emailSendQueue } from "../../jobs/queues.js";
import { callQueue } from "../../jobs/queues.js";

export async function handleViewLeads(ctx: BotContext, campaignId: number) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false },
    take: 10,
  });

  if (leads.length === 0) {
    await ctx.reply("No leads without websites found.");
    return;
  }

  let message = "Leads without websites:\n\n";
  for (const lead of leads) {
    message += `- ${lead.businessName}`;
    if (lead.phone) message += ` | ${lead.phone}`;
    message += `\n`;
  }

  const total = await prisma.lead.count({
    where: { campaignId, hasWebsite: false },
  });

  if (total > 10) {
    message += `\n...and ${total - 10} more`;
  }

  const keyboard = new InlineKeyboard()
    .text("Build Websites", `build_websites_${campaignId}`)
    .row()
    .text("Start Email Campaign", `start_emails_${campaignId}`)
    .row()
    .text("Start Calling", `start_calls_${campaignId}`);

  await ctx.reply(message, { reply_markup: keyboard });
}

export async function handleBuildWebsites(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW" },
  });

  if (leads.length === 0) {
    await ctx.reply("No new leads to build websites for.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(`Yes, build ${leads.length} websites`, `confirm_build_${campaignId}`)
    .text("Cancel", "cancel_action");

  await ctx.reply(
    `Build websites for ${leads.length} leads?`,
    { reply_markup: keyboard }
  );
}

export async function handleConfirmBuild(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW" },
  });

  for (const lead of leads) {
    await buildQueue.add(`build-${lead.id}`, {
      leadId: lead.id,
      telegramId: ctx.from!.id,
      campaignId,
    });
  }

  await ctx.editMessageText(
    `Queued ${leads.length} website builds. I'll update you as they complete.`
  );
}

export async function handleStartEmails(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, status: "WEBSITE_BUILT" },
  });

  if (leads.length === 0) {
    await ctx.reply("No leads with built websites ready for email outreach.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(
      `Yes, email ${leads.length} leads`,
      `confirm_emails_${campaignId}`
    )
    .text("Cancel", "cancel_action");

  await ctx.reply(
    `Start email outreach for ${leads.length} leads?\n` +
      `(Will first find emails via Hunter.io, then send 3-email sequence)`,
    { reply_markup: keyboard }
  );
}

export async function handleConfirmEmails(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, status: "WEBSITE_BUILT" },
  });

  for (const lead of leads) {
    await emailFindQueue.add(`find-email-${lead.id}`, {
      leadId: lead.id,
      telegramId: ctx.from!.id,
      campaignId,
    });
  }

  await ctx.editMessageText(
    `Looking up emails for ${leads.length} leads. Will start sending once emails are found.`
  );
}

export async function handleStartCalls(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      phone: { not: null },
      status: { in: ["WEBSITE_BUILT", "EMAILED"] },
    },
  });

  if (leads.length === 0) {
    await ctx.reply("No leads with phone numbers ready for calling.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(`Yes, call ${leads.length} leads`, `confirm_calls_${campaignId}`)
    .text("Cancel", "cancel_action");

  await ctx.reply(
    `Start AI calls to ${leads.length} leads?\n` +
      `(Calls only happen during business hours, 9am-5pm)`,
    { reply_markup: keyboard }
  );
}

export async function handleConfirmCalls(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      phone: { not: null },
      status: { in: ["WEBSITE_BUILT", "EMAILED"] },
    },
  });

  for (const lead of leads) {
    await callQueue.add(`call-${lead.id}`, {
      leadId: lead.id,
      telegramId: ctx.from!.id,
    });
  }

  await ctx.editMessageText(
    `Queued ${leads.length} calls. I'll notify you of each outcome.`
  );
}
