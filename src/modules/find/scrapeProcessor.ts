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
  const leadsToCreate = results.map((r) => {
    // Pull top 3 review snippets with enough text to be useful
    const snippets =
      r.reviews_data
        ?.filter((rv) => rv.review_text && rv.review_text.trim().length > 25)
        .slice(0, 3)
        .map((rv) => ({
          text: rv.review_text!.trim(),
          rating: rv.review_rating ?? null,
          author: rv.author_title ?? null,
        })) ?? null;

    return {
      campaignId,
      businessName: r.name,
      phone: r.phone ?? null,
      address: r.full_address ?? null,
      hasWebsite: !!r.site,
      rating: r.rating ?? null,
      reviewCount: r.reviews ?? null,
      description: r.description ?? null,
      category: r.type ?? null,
      photoUrl: r.photo ?? null,
      reviewSnippets: snippets,
      status: "NEW" as const,
    };
  });

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
