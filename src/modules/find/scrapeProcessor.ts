import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { scrapeGoogleMaps } from "./outscraper.js";

export interface ScrapeJobData {
  campaignId: number;
  niche: string;
  city: string;
  telegramId: number;
}

export async function processScrapeJob(job: Job<ScrapeJobData>) {
  const { campaignId, niche, city } = job.data;

  const results = await scrapeGoogleMaps(niche, city);

  // Filter to businesses without websites and insert as leads
  const leadsToCreate = results.map((r) => ({
    campaignId,
    businessName: r.name,
    phone: r.phone ?? null,
    address: r.full_address ?? null,
    hasWebsite: !!r.site,
    status: "NEW" as const,
  }));

  await prisma.lead.createMany({ data: leadsToCreate });

  // Count leads without websites
  const noWebsiteCount = leadsToCreate.filter((l) => !l.hasWebsite).length;

  // Update campaign status
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "READY" },
  });

  return { totalFound: results.length, withoutWebsite: noWebsiteCount };
}
