import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "hunterLookup" });

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

    log.info({ domain }, "hunter_domain_search");

    const response = await fetch(url.toString());
    if (!response.ok) {
      log.warn({ domain, status: response.status }, "hunter_domain_search_failed");
      return null;
    }

    const data: HunterDomainResponse = await response.json();
    const emails = data.data?.emails ?? [];
    if (emails.length === 0) {
      log.info({ domain }, "hunter_domain_no_results");
      return null;
    }

    // Return the highest-confidence email
    const best = emails.sort((a, b) => b.confidence - a.confidence)[0];
    log.info({ domain, email: best.value, confidence: best.confidence }, "hunter_domain_found");
    return best.value;
  } catch {
    log.warn({ domain }, "hunter_domain_search_error");
    return null;
  }
}

/**
 * Search by company name only (lower reliability, used as fallback).
 * Hunter.io requires a confidence score >= 70 to be usable — below that
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

    log.info({ company }, "hunter_company_search");

    const response = await fetch(url.toString());
    if (!response.ok) {
      log.warn({ company, status: response.status }, "hunter_company_search_failed");
      return null;
    }

    const data: HunterFinderResponse = await response.json();

    // Only return if confidence is high enough to avoid spam/bounces
    if (!data.data?.email || data.data.score < 70) {
      log.info({ company, score: data.data?.score ?? null }, "hunter_company_low_confidence");
      return null;
    }

    log.info({ company, email: data.data.email, score: data.data.score }, "hunter_company_found");
    return data.data.email;
  } catch {
    log.warn({ company }, "hunter_company_search_error");
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
    log.info({ businessName, domain }, "hunter_domain_fallback_to_company");
  }

  return findEmailByCompanyName(businessName);
}
