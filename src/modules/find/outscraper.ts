import { env } from "../../config/env.js";

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

  while (Date.now() - start < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);

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

    if (data.status === "Success") {
      return data.data?.[0] ?? [];
    }

    if (data.status === "Failed") {
      throw new Error(`Outscraper task ${taskId} failed`);
    }

    // status is Pending or Running — keep polling
  }

  throw new Error(`Outscraper task ${taskId} timed out after 5 minutes`);
}

export async function scrapeGoogleMaps(
  niche: string,
  city: string
): Promise<OutscraperResult[]> {
  const query = `${niche} in ${city}`;

  const response = await fetch(
    `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=50`,
    {
      headers: {
        "X-API-KEY": env.OUTSCRAPER_API_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Outscraper API error: ${response.status}`);
  }

  const data: OutscraperTaskResponse = await response.json();

  // Some small queries return synchronously
  if (data.status === "Success" && data.data) {
    return data.data[0] ?? [];
  }

  // Async task — poll until complete
  return pollForResults(data.id);
}
