import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { scrapeGoogleMaps } from "./outscraper.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "scrapeProcessor" });

export interface ScrapeJobData {
  campaignId: number;
  niche: string;
  city: string;
  telegramId: number;
}

export async function processScrapeJob(job: Job<ScrapeJobData>) {
  const { campaignId, niche, city } = job.data;

  log.info({ campaignId, niche, city, jobId: job.id }, "scrape_started");

  const results = await scrapeGoogleMaps(niche, city);

  log.info({ campaignId, resultsCount: results.length }, "scrape_results_received");

  // Filter to businesses without websites and insert as leads
  const leadsToCreate = results.map((r) => ({
    campaignId,
    businessName: r.name,
    phone: r.phone ?? null,
    address: r.full_address ?? null,
    hasWebsite: !!r.site,
    status: "NEW" as const,
  }));

  // skipDuplicates prevents duplicate leads if a scrape job retries
  await prisma.lead.createMany({ data: leadsToCreate, skipDuplicates: true });

  // Count leads without websites
  const noWebsiteCount = leadsToCreate.filter((l) => !l.hasWebsite).length;

  // Update campaign status
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "READY" },
  });

  log.info({ campaignId, totalFound: results.length, withoutWebsite: noWebsiteCount }, "scrape_completed");

  return { totalFound: results.length, withoutWebsite: noWebsiteCount };
}
