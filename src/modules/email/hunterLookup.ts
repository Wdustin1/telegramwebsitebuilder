import { env } from "../../config/env.js";

interface HunterEmail {
  value: string;
  confidence: number;
  type: string;
}

interface HunterDomainResponse {
  data: { emails: HunterEmail[] };
  meta: { results: number };
}

interface HunterFinderResponse {
  data: { email: string | null; score: number };
}

/**
 * Search by domain (most reliable — high hit rate when domain is known).
 */
export async function findEmailByDomain(
  domain: string
): Promise<string | null> {
  try {
    const url = new URL("https://api.hunter.io/v2/domain-search");
    url.searchParams.set("domain", domain);
    url.searchParams.set("api_key", env.HUNTER_API_KEY);
    url.searchParams.set("limit", "5");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data: HunterDomainResponse = await response.json();
    const emails = data.data?.emails ?? [];
    if (emails.length === 0) return null;

    // Return the highest-confidence email
    return emails.sort((a, b) => b.confidence - a.confidence)[0].value;
  } catch {
    return null;
  }
}

/**
 * Search by company name only (lower reliability, used as fallback).
 * Hunter.io requires a confidence score ≥ 70 to be usable — below that
 * we skip rather than send to a likely-wrong address.
 *
 * NOTE: For businesses without websites, success rate here will be low.
 * Most leads targeted by this tool have no online presence, so Hunter.io
 * can't reliably find their email. Consider supplementing with manual
 * outreach or a phone-first strategy for low-match leads.
 */
export async function findEmailByCompanyName(
  company: string
): Promise<string | null> {
  try {
    const url = new URL("https://api.hunter.io/v2/email-finder");
    url.searchParams.set("company", company);
    url.searchParams.set("api_key", env.HUNTER_API_KEY);

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data: HunterFinderResponse = await response.json();

    // Only return if confidence is high enough to avoid spam/bounces
    if (!data.data?.email || data.data.score < 70) return null;

    return data.data.email;
  } catch {
    return null;
  }
}

/**
 * Main lookup function. Tries domain search first (if domain provided),
 * then falls back to company name search.
 */
export async function findEmailByName(
  businessName: string,
  domain?: string
): Promise<string | null> {
  if (domain) {
    const email = await findEmailByDomain(domain);
    if (email) return email;
  }

  return findEmailByCompanyName(businessName);
}
