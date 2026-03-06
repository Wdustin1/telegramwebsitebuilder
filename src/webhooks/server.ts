import { createServer, IncomingMessage, ServerResponse } from "http";
import { handleSendGridWebhook } from "./sendgridWebhook.js";
import { handleBlandWebhook } from "./blandWebhook.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ module: "webhookServer" });

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

    log.info({ url: req.url, method: req.method }, "webhook_request_received");

    let body: string;
    try {
      body = await parseBody(req);
    } catch (err) {
      log.warn({ url: req.url }, "webhook_body_too_large");
      res.writeHead(413);
      res.end("Request body too large");
      return;
    }

    try {
      if (req.url?.startsWith("/webhooks/sendgrid")) {
        if (env.SENDGRID_WEBHOOK_VERIFICATION_KEY) {
          const verificationKey = req.headers["x-twilio-email-event-webhook-signature"];
          if (!verificationKey) {
            log.warn({ url: req.url }, "webhook_unauthorized");
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
            log.warn({ url: req.url }, "webhook_unauthorized");
            res.writeHead(401);
            res.end("Unauthorized");
            return;
          }
        }
        await handleBlandWebhook(JSON.parse(body));
      } else {
        log.warn({ url: req.url }, "webhook_route_not_found");
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end("ok");
      log.info({ url: req.url, status: 200 }, "webhook_response_sent");
    } catch (err) {
      log.error({ url: req.url, err }, "webhook_error");
      res.writeHead(500);
      res.end("error");
    }
  });

  server.listen(port, () => {
    log.info({ port }, "webhook_server_started");
  });

  return server;
}
