import sgMail from "@sendgrid/mail";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "sendEmail" });

sgMail.setApiKey(env.SENDGRID_API_KEY);

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  log.info({ to, subject }, "email_sending");

  try {
    await sgMail.send({
      to,
      from: env.SENDGRID_FROM_EMAIL,
      subject,
      text: body,
    });
    log.info({ to }, "email_send_success");
  } catch (err) {
    log.error({ to, err }, "email_send_failed");
    throw err;
  }
}
