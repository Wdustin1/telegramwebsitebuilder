import { prisma } from "../db/client.js";
import { Bot } from "grammy";
import { BotContext } from "../bot/bot.js";
import { callQueue } from "../jobs/queues.js";
import { logger } from "../lib/logger.js";
import { esc } from "../lib/html.js";

const log = logger.child({ module: "blandWebhook" });

let botInstance: Bot<BotContext>;

export function setBlandWebhookBot(bot: Bot<BotContext>) {
  botInstance = bot;
}

interface BlandWebhookPayload {
  call_id: string;
  status: string;
  call_length?: number;
  transcripts?: Array<{ text: string; user: string }>;
  answered_by?: string;
}

export async function handleBlandWebhook(payload: BlandWebhookPayload) {
  log.info({ callId: payload.call_id, status: payload.status }, "bland_webhook_received");

  const call = await prisma.call.findFirst({
    where: { blandCallId: payload.call_id },
    include: { lead: { include: { campaign: { include: { user: true } } } } },
  });

  if (!call) {
    log.warn({ callId: payload.call_id }, "bland_webhook_call_not_found");
    return;
  }

  const transcript = payload.transcripts
    ?.map((t) => `${t.user}: ${t.text}`)
    .join("\n");

  let outcome: "INTERESTED" | "NOT_INTERESTED" | "VOICEMAIL" | "NO_ANSWER" =
    "NOT_INTERESTED";

  if (payload.answered_by === "voicemail") outcome = "VOICEMAIL";
  else if (payload.status === "no-answer") outcome = "NO_ANSWER";
  else if (
    transcript?.toLowerCase().includes("interested") ||
    transcript?.toLowerCase().includes("tell me more") ||
    transcript?.toLowerCase().includes("sounds good")
  ) {
    outcome = "INTERESTED";
  }

  log.info({ callId: payload.call_id, leadId: call.leadId, outcome }, "call_outcome_determined");

  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: "COMPLETED",
      duration: payload.call_length ?? null,
      transcript: transcript ?? null,
      outcome,
    },
  });

  // Retry logic for voicemail/no-answer
  if (outcome === "VOICEMAIL" || outcome === "NO_ANSWER") {
    const callCount = await prisma.call.count({
      where: { leadId: call.leadId },
    });

    const maxRetries = outcome === "VOICEMAIL" ? 1 : 2;

    if (callCount <= maxRetries) {
      log.info({ leadId: call.leadId, outcome, callCount, maxRetries }, "call_retry_scheduled");
      await callQueue.add(
        `call-retry-${call.leadId}-${callCount}`,
        {
          leadId: call.leadId,
          telegramId: Number(call.lead.campaign.user.telegramId),
        },
        { delay: 60 * 60 * 1000 } // 1 hour
      );
    } else {
      log.info({ leadId: call.leadId, outcome, callCount }, "call_max_retries_reached");
    }
  }

  if (outcome === "INTERESTED") {
    await prisma.lead.update({
      where: { id: call.leadId },
      data: { status: "RESPONDED" },
    });
    log.info({ leadId: call.leadId }, "lead_marked_responded");
  }

  // Notify user via Telegram
  if (botInstance) {
    const telegramId = call.lead.campaign.user.telegramId;

    const outcomeDisplay: Record<string, string> = {
      INTERESTED: "🔥 Interested",
      VOICEMAIL: "📱 Voicemail",
      NO_ANSWER: "📵 No answer",
      NOT_INTERESTED: "👎 Not interested",
    };

    const label = outcomeDisplay[outcome] ?? outcome;

    let message =
      `📞 <b>Call result</b>\n\n` +
      `<b>${esc(call.lead.businessName)}</b>: ${label}`;

    if (outcome === "INTERESTED") {
      message += `\n\n🔥 They expressed interest! Follow up soon.`;
    }

    await botInstance.api.sendMessage(Number(telegramId), message, {
      parse_mode: "HTML",
    });
    log.info({ leadId: call.leadId, outcome, telegramId: Number(telegramId) }, "telegram_notification_sent");
  }
}
