import { env } from "../../config/env.js";

export async function findEmail(
  domain: string
): Promise<string | null> {
  const response = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${env.HUNTER_API_KEY}`
  );

  if (!response.ok) return null;

  const data = await response.json();
  const emails = data.data?.emails ?? [];

  if (emails.length === 0) return null;

  // Return the most confident email
  return emails.sort(
    (a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0)
  )[0].value;
}

export async function findEmailByName(
  company: string,
  domain?: string
): Promise<string | null> {
  if (domain) return findEmail(domain);

  const response = await fetch(
    `https://api.hunter.io/v2/email-finder?company=${encodeURIComponent(company)}&api_key=${env.HUNTER_API_KEY}`
  );

  if (!response.ok) return null;

  const data = await response.json();
  return data.data?.email ?? null;
}
