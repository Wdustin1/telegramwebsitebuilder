import { InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { buildQueue, emailFindQueue, callQueue } from "../../jobs/queues.js";
import { logger } from "../../lib/logger.js";
import { esc } from "../../lib/html.js";

const log = logger.child({ module: "campaignActions" });

async function verifyCampaignOwnership(ctx: BotContext, campaignId: number): Promise<boolean> {
  if (!ctx.from) return false;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { user: true },
  });

  if (!campaign || campaign.user.telegramId !== BigInt(ctx.from.id)) {
    await ctx.reply("Campaign not found or access denied.");
    return false;
  }

  return true;
}

export async function handleViewLeads(ctx: BotContext, campaignId: number) {
  if (!(await verifyCampaignOwnership(ctx, campaignId))) return;

  log.info({ campaignId }, "view_leads");

  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false },
    take: 10,
  });

  if (leads.length === 0) {
    await ctx.reply("No leads without websites found.");
    return;
  }

  let message = "📋 <b>Leads without websites</b>\n\n";
  for (const lead of leads) {
    message += `• <b>${esc(lead.businessName)}</b>`;
    if (lead.phone) message += ` · ${esc(lead.phone)}`;
    message += `\n`;
  }

  const total = await prisma.lead.count({
    where: { campaignId, hasWebsite: false },
  });

  log.info({ campaignId, leadCount: total }, "leads_displayed");

  if (total > 10) {
    message += `\n<i>…and ${total - 10} more</i>`;
  }

  const keyboard = new InlineKeyboard()
    .text("🔨 Build Websites", `build_websites_${campaignId}`)
    .row()
    .text("📧 Start Email Campaign", `start_emails_${campaignId}`)
    .row()
    .text("📞 Start Calling", `start_calls_${campaignId}`);

  await ctx.reply(message, { reply_markup: keyboard, parse_mode: "HTML" });
}

export async function handleBuildWebsites(
  ctx: BotContext,
  campaignId: number
) {
  if (!(await verifyCampaignOwnership(ctx, campaignId))) return;

  log.info({ campaignId }, "build_websites_selection");

  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW" },
  });

  if (leads.length === 0) {
    await ctx.reply("No new leads to build websites for.");
    return;
  }

  // Initialize selection as empty
  ctx.session.selectedLeadIds = [];
  await handleSelectLeads(ctx, campaignId, 0);
}

const LEADS_PER_PAGE = 10;

export async function handleSelectLeads(
  ctx: BotContext,
  campaignId: number,
  page: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW" },
    orderBy: { id: "asc" },
  });

  if (leads.length === 0) {
    await ctx.reply("No new leads to build websites for.");
    return;
  }

  const totalPages = Math.ceil(leads.length / LEADS_PER_PAGE);
  const pageLeads = leads.slice(page * LEADS_PER_PAGE, (page + 1) * LEADS_PER_PAGE);
  const selected = ctx.session.selectedLeadIds ?? [];

  const keyboard = new InlineKeyboard();

  for (const lead of pageLeads) {
    const isSelected = selected.includes(lead.id);
    const icon = isSelected ? "✅" : "☐";
    const label = `${icon} ${lead.businessName}${lead.phone ? ` | ${lead.phone}` : ""}`;
    keyboard.text(label, `toggle_lead_${lead.id}_${campaignId}_${page}`);
    keyboard.row();
  }

  // Bottom row 1: Select All + Build Selected
  const allOnPage = pageLeads.every((l) => selected.includes(l.id));
  keyboard.text(
    allOnPage ? "Deselect All" : "Select All",
    `select_all_${campaignId}_${page}`
  );
  keyboard.text(
    `🔨 Build Selected (${selected.length})`,
    `build_selected_${campaignId}`
  );
  keyboard.row();

  // Bottom row 2: Pagination
  if (page > 0) {
    keyboard.text("← Prev", `select_page_${campaignId}_${page - 1}`);
  }
  if (page < totalPages - 1) {
    keyboard.text("Next →", `select_page_${campaignId}_${page + 1}`);
  }

  const message = `🔨 <b>Select leads to build websites</b> (Page ${page + 1}/${totalPages}):`;

  try {
    await ctx.editMessageText(message, { reply_markup: keyboard, parse_mode: "HTML" });
  } catch {
    await ctx.reply(message, { reply_markup: keyboard, parse_mode: "HTML" });
  }
}

export async function handleToggleLead(
  ctx: BotContext,
  leadId: number,
  campaignId: number,
  page: number
) {
  const selected = ctx.session.selectedLeadIds ?? [];
  const idx = selected.indexOf(leadId);
  if (idx >= 0) {
    selected.splice(idx, 1);
  } else {
    selected.push(leadId);
  }
  ctx.session.selectedLeadIds = selected;

  log.debug({ leadId, campaignId, selectedCount: selected.length }, "lead_toggled");

  await handleSelectLeads(ctx, campaignId, page);
}

export async function handleSelectAll(
  ctx: BotContext,
  campaignId: number,
  page: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW" },
    orderBy: { id: "asc" },
  });

  const pageLeads = leads.slice(page * LEADS_PER_PAGE, (page + 1) * LEADS_PER_PAGE);
  const selected = ctx.session.selectedLeadIds ?? [];
  const allOnPage = pageLeads.every((l) => selected.includes(l.id));

  if (allOnPage) {
    // Deselect all on this page
    ctx.session.selectedLeadIds = selected.filter(
      (id) => !pageLeads.some((l) => l.id === id)
    );
  } else {
    // Select all on this page
    for (const lead of pageLeads) {
      if (!selected.includes(lead.id)) {
        selected.push(lead.id);
      }
    }
    ctx.session.selectedLeadIds = selected;
  }

  log.debug({ campaignId, page, selectedCount: ctx.session.selectedLeadIds.length }, "select_all_toggled");

  await handleSelectLeads(ctx, campaignId, page);
}

export async function handleSelectPage(
  ctx: BotContext,
  campaignId: number,
  page: number
) {
  await handleSelectLeads(ctx, campaignId, page);
}

export async function handleConfirmBuild(
  ctx: BotContext,
  campaignId: number
) {
  if (!(await verifyCampaignOwnership(ctx, campaignId))) return;

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const selectedIds = ctx.session.selectedLeadIds;
  if (!selectedIds || selectedIds.length === 0) {
    await ctx.editMessageText("No leads selected. Please select at least one lead.");
    return;
  }

  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW", id: { in: selectedIds } },
  });

  if (leads.length === 0) {
    await ctx.editMessageText("No matching leads found.");
    return;
  }

  log.info({ campaignId, leadCount: leads.length }, "build_queued");

  for (const lead of leads) {
    // jobId acts as a deduplication key — duplicate taps won't enqueue twice
    await buildQueue.add(
      `build-${lead.id}`,
      { leadId: lead.id, telegramId, campaignId },
      { jobId: `build-${lead.id}` }
    );
  }

  // Clear selection after queueing
  ctx.session.selectedLeadIds = [];

  await ctx.editMessageText(
    `✅ Queued <b>${leads.length}</b> website builds. I'll update you as they complete.`,
    { parse_mode: "HTML" }
  );
}

export async function handleStartEmails(
  ctx: BotContext,
  campaignId: number
) {
  if (!(await verifyCampaignOwnership(ctx, campaignId))) return;

  const leads = await prisma.lead.findMany({
    where: { campaignId, status: "WEBSITE_BUILT" },
  });

  if (leads.length === 0) {
    await ctx.reply("No leads with built websites ready for email outreach.");
    return;
  }

  log.info({ campaignId, leadCount: leads.length }, "email_campaign_prompt");

  const keyboard = new InlineKeyboard()
    .text(
      `✅ Yes, email ${leads.length} leads`,
      `confirm_emails_${campaignId}`
    )
    .text("❌ Cancel", "cancel_action");

  await ctx.reply(
    `📧 <b>Start email outreach for ${leads.length} leads?</b>\n\n` +
      `Will first find emails via Hunter.io, then send a 3-email sequence.`,
    { reply_markup: keyboard, parse_mode: "HTML" }
  );
}

export async function handleConfirmEmails(
  ctx: BotContext,
  campaignId: number
) {
  if (!(await verifyCampaignOwnership(ctx, campaignId))) return;

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const leads = await prisma.lead.findMany({
    where: { campaignId, status: "WEBSITE_BUILT" },
  });

  log.info({ campaignId, leadCount: leads.length }, "email_find_queued");

  for (const lead of leads) {
    await emailFindQueue.add(
      `find-email-${lead.id}`,
      { leadId: lead.id, telegramId, campaignId },
      { jobId: `email-find-${lead.id}` }
    );
  }

  await ctx.editMessageText(
    `✅ Looking up emails for <b>${leads.length}</b> leads. Will start sending once emails are found.`,
    { parse_mode: "HTML" }
  );
}

export async function handleStartCalls(
  ctx: BotContext,
  campaignId: number
) {
  if (!(await verifyCampaignOwnership(ctx, campaignId))) return;

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

  log.info({ campaignId, leadCount: leads.length }, "call_campaign_prompt");

  const keyboard = new InlineKeyboard()
    .text(`✅ Yes, call ${leads.length} leads`, `confirm_calls_${campaignId}`)
    .text("❌ Cancel", "cancel_action");

  await ctx.reply(
    `📞 <b>Start AI calls to ${leads.length} leads?</b>\n\n` +
      `Calls only happen during business hours (9 AM–5 PM).`,
    { reply_markup: keyboard, parse_mode: "HTML" }
  );
}

export async function handleConfirmCalls(
  ctx: BotContext,
  campaignId: number
) {
  if (!(await verifyCampaignOwnership(ctx, campaignId))) return;

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      phone: { not: null },
      status: { in: ["WEBSITE_BUILT", "EMAILED"] },
    },
  });

  log.info({ campaignId, leadCount: leads.length }, "calls_queued");

  for (const lead of leads) {
    await callQueue.add(
      `call-${lead.id}`,
      { leadId: lead.id, telegramId },
      { jobId: `call-${lead.id}` }
    );
  }

  await ctx.editMessageText(
    `✅ Queued <b>${leads.length}</b> calls. I'll notify you of each outcome.`,
    { parse_mode: "HTML" }
  );
}
