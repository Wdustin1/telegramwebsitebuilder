import { prisma } from "../db/client.js";
import { EmailStatus } from "../generated/prisma/client.js";
import { Bot } from "grammy";
import { BotContext } from "../bot/bot.js";
import { logger } from "../lib/logger.js";
import { esc } from "../lib/html.js";

const log = logger.child({ module: "sendgridWebhook" });

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
  log.info({ eventCount: events.length }, "sendgrid_webhook_received");

  for (const event of events) {
    const newStatus = statusMap[event.event];
    if (!newStatus) continue;

    log.info({ eventType: event.event, email: event.email }, "sendgrid_event_processing");

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

      log.info({ emailId: emails[0].id, newStatus: event.event }, "email_status_updated");

      // Notify user on email open (important lead signal)
      if (newStatus === EmailStatus.OPENED && botInstance) {
        const emailRecord = emails[0] as any;
        const telegramId = emailRecord.lead?.campaign?.user?.telegramId;
        const businessName = emailRecord.lead?.businessName;
        if (telegramId && businessName) {
          await botInstance.api.sendMessage(
            Number(telegramId),
            `👀 <b>Email opened!</b>\n\n<b>${esc(businessName)}</b> opened your email — this is a warm lead. Consider following up!`,
            { parse_mode: "HTML" }
          );
          log.info({ businessName, telegramId: Number(telegramId) }, "email_open_notification_sent");
        }
      }
    } else {
      log.warn({ email: event.email, eventType: event.event }, "sendgrid_email_not_found");
    }
  }
}
