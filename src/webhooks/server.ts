import { createServer, IncomingMessage, ServerResponse } from "http";
import { handleSendGridWebhook } from "./sendgridWebhook.js";
import { handleBlandWebhook } from "./blandWebhook.js";
import { env } from "../config/env.js";

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function startWebhookServer(port: number) {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }

    let body: string;
    try {
      body = await parseBody(req);
    } catch (err) {
      res.writeHead(413);
      res.end("Request body too large");
      return;
    }

    try {
      if (req.url?.startsWith("/webhooks/sendgrid")) {
        if (env.SENDGRID_WEBHOOK_VERIFICATION_KEY) {
          const verificationKey = req.headers["x-twilio-email-event-webhook-signature"];
          if (!verificationKey) {
            res.writeHead(401);
            res.end("Unauthorized");
            return;
          }
        }
        await handleSendGridWebhook(JSON.parse(body));
      } else if (req.url?.startsWith("/webhooks/bland")) {
        if (env.BLAND_WEBHOOK_SECRET) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const secret = url.searchParams.get("secret") || req.headers["x-webhook-secret"];
          if (secret !== env.BLAND_WEBHOOK_SECRET) {
            res.writeHead(401);
            res.end("Unauthorized");
            return;
          }
        }
        await handleBlandWebhook(JSON.parse(body));
      } else {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end("ok");
    } catch (err) {
      console.error("Webhook error:", err);
      res.writeHead(500);
      res.end("error");
    }
  });

  server.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
  });

  return server;
}
