import { prisma } from "../db/client.js";
import { Bot } from "grammy";
import { BotContext } from "../bot/bot.js";
import { callQueue } from "../jobs/queues.js";

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
  const call = await prisma.call.findFirst({
    where: { blandCallId: payload.call_id },
    include: { lead: { include: { campaign: { include: { user: true } } } } },
  });

  if (!call) return;

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
      await callQueue.add(
        `call-retry-${call.leadId}-${callCount}`,
        {
          leadId: call.leadId,
          telegramId: Number(call.lead.campaign.user.telegramId),
        },
        { delay: 60 * 60 * 1000 } // 1 hour
      );
    }
  }

  if (outcome === "INTERESTED") {
    await prisma.lead.update({
      where: { id: call.leadId },
      data: { status: "RESPONDED" },
    });
  }

  // Notify user via Telegram
  if (botInstance) {
    const telegramId = call.lead.campaign.user.telegramId;
    const emoji =
      outcome === "INTERESTED"
        ? "HOT LEAD"
        : outcome === "VOICEMAIL"
          ? "Voicemail"
          : outcome === "NO_ANSWER"
            ? "No answer"
            : "Not interested";

    await botInstance.api.sendMessage(
      Number(telegramId),
      `Call result for ${call.lead.businessName}: ${emoji}\n` +
        (outcome === "INTERESTED"
          ? "They expressed interest! Follow up soon."
          : "")
    );
  }
}
