import { prisma } from "../db/client.js";
import { EmailStatus } from "../generated/prisma/client.js";
import { Bot } from "grammy";
import { BotContext } from "../bot/bot.js";

let botInstance: Bot<BotContext>;

export function setSendGridWebhookBot(bot: Bot<BotContext>) {
  botInstance = bot;
}

interface SendGridEvent {
  event: string;
  email: string;
  sg_message_id: string;
}

const statusMap: Record<string, EmailStatus> = {
  open: EmailStatus.OPENED,
  bounce: EmailStatus.BOUNCED,
};

export async function handleSendGridWebhook(events: SendGridEvent[]) {
  for (const event of events) {
    const newStatus = statusMap[event.event];
    if (!newStatus) continue;

    // Find email by recipient address and update status
    const emails = await prisma.email.findMany({
      where: {
        lead: { ownerEmail: event.email },
        status: { not: EmailStatus.BOUNCED },
      },
      orderBy: { sentAt: "desc" },
      take: 1,
      include: {
        lead: { include: { campaign: { include: { user: true } } } },
      },
    });

    if (emails.length > 0) {
      await prisma.email.update({
        where: { id: emails[0].id },
        data: { status: newStatus },
      });

      // Notify user on email open (important lead signal)
      if (newStatus === EmailStatus.OPENED && botInstance) {
        const emailRecord = emails[0] as any;
        const telegramId = emailRecord.lead?.campaign?.user?.telegramId;
        const businessName = emailRecord.lead?.businessName;
        if (telegramId && businessName) {
          await botInstance.api.sendMessage(
            Number(telegramId),
            `Email opened by ${businessName}! This is a warm lead - consider following up.`
          );
        }
      }
    }
  }
}
