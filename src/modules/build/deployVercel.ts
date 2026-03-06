import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "deployVercel" });

export async function deployToVercel(
  slug: string,
  html: string
): Promise<string> {
  log.info({ slug }, "deploy_started");

  const response = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: slug,
      files: [
        {
          file: "index.html",
          data: Buffer.from(html).toString("base64"),
          encoding: "base64",
        },
      ],
      projectSettings: {
        framework: null,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    log.error({ slug, status: response.status, error }, "deploy_failed");
    throw new Error(`Vercel deploy failed: ${error}`);
  }

  const data = await response.json();
  const url = `https://${data.url}`;

  log.info({ slug, url }, "deploy_completed");

  return url;
}
