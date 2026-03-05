import { prisma } from "../db/client.js";

interface SendGridEvent {
  event: string;
  email: string;
  sg_message_id: string;
}

export async function handleSendGridWebhook(events: SendGridEvent[]) {
  for (const event of events) {
    const statusMap: Record<string, string> = {
      open: "OPENED",
      bounce: "BOUNCED",
    };

    const newStatus = statusMap[event.event];
    if (!newStatus) continue;

    // Find email by recipient address and update status
    const emails = await prisma.email.findMany({
      where: {
        lead: { ownerEmail: event.email },
        status: { not: "BOUNCED" },
      },
      orderBy: { sentAt: "desc" },
      take: 1,
    });

    if (emails.length > 0) {
      await prisma.email.update({
        where: { id: emails[0].id },
        data: { status: newStatus as any },
      });
    }
  }
}
