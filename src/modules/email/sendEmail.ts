import sgMail from "@sendgrid/mail";
import { env } from "../../config/env.js";

sgMail.setApiKey(env.SENDGRID_API_KEY);

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  await sgMail.send({
    to,
    from: env.SENDGRID_FROM_EMAIL,
    subject,
    text: body,
  });
}
