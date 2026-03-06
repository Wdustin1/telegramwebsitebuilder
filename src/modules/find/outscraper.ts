import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "outscraper" });

export interface OutscraperResult {
  name: string;
  phone?: string;
  full_address?: string;
  site?: string;
  email?: string; // Outscraper sometimes includes email directly
}

interface OutscraperTaskResponse {
  id: string;
  status: "Pending" | "Running" | "Success" | "Failed";
  data?: OutscraperResult[][];
}

const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes max

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForResults(taskId: string): Promise<OutscraperResult[]> {
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);
    attempt++;

    const response = await fetch(
      `https://api.app.outscraper.com/requests/${taskId}`,
      {
        headers: { "X-API-KEY": env.OUTSCRAPER_API_KEY },
      }
    );

    if (!response.ok) {
      throw new Error(`Outscraper poll error: ${response.status}`);
    }

    const data: OutscraperTaskResponse = await response.json();

    log.debug({ taskId, attempt, status: data.status }, "outscraper_poll");

    if (data.status === "Success") {
      const results = data.data?.[0] ?? [];
      log.info({ taskId, resultsCount: results.length }, "outscraper_task_complete");
      return results;
    }

    if (data.status === "Failed") {
      log.error({ taskId }, "outscraper_task_failed");
      throw new Error(`Outscraper task ${taskId} failed`);
    }

    // status is Pending or Running — keep polling
  }

  log.error({ taskId }, "outscraper_task_timeout");
  throw new Error(`Outscraper task ${taskId} timed out after 5 minutes`);
}

export async function scrapeGoogleMaps(
  niche: string,
  city: string
): Promise<OutscraperResult[]> {
  const query = `${niche} in ${city}`;

  log.info({ query }, "outscraper_request");

  const response = await fetch(
    `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=50`,
    {
      headers: {
        "X-API-KEY": env.OUTSCRAPER_API_KEY,
      },
    }
  );

  if (!response.ok) {
    log.error({ status: response.status }, "outscraper_api_error");
    throw new Error(`Outscraper API error: ${response.status}`);
  }

  const data: OutscraperTaskResponse = await response.json();

  // Some small queries return synchronously
  if (data.status === "Success" && data.data) {
    const results = data.data[0] ?? [];
    log.info({ resultsCount: results.length }, "outscraper_sync_response");
    return results;
  }

  // Async task — poll until complete
  log.info({ taskId: data.id }, "outscraper_async_task_created");
  return pollForResults(data.id);
}
