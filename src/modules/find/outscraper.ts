import { env } from "../../config/env.js";

interface OutscraperResult {
  name: string;
  phone?: string;
  full_address?: string;
  site?: string;
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

  const data = await response.json();

  // Outscraper returns nested arrays
  const results: OutscraperResult[] = data.data?.[0] ?? [];
  return results;
}
