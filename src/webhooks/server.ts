import { createServer, IncomingMessage, ServerResponse } from "http";
import { handleSendGridWebhook } from "./sendgridWebhook.js";
import { handleBlandWebhook } from "./blandWebhook.js";

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
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

    const body = await parseBody(req);

    try {
      if (req.url === "/webhooks/sendgrid") {
        await handleSendGridWebhook(JSON.parse(body));
      } else if (req.url === "/webhooks/bland") {
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
