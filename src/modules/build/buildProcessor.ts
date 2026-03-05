import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { generateWebsiteHtml } from "./generateHtml.js";
import { deployToVercel } from "./deployVercel.js";

export interface BuildJobData {
  leadId: number;
  telegramId: number;
  campaignId: number;
}

export async function processBuildJob(job: Job<BuildJobData>) {
  const { leadId } = job.data;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { campaign: true },
  });

  const html = await generateWebsiteHtml({
    businessName: lead.businessName,
    niche: lead.campaign.niche,
    city: lead.campaign.city,
    phone: lead.phone,
    address: lead.address,
  });

  // Include leadId in slug to prevent collisions between businesses with the same name.
  // e.g. "Smith Plumbing" in two different cities won't clobber each other on Vercel.
  const baseSlug = lead.businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `${baseSlug}-${leadId}`;

  const vercelUrl = await deployToVercel(slug, html);

  await prisma.website.create({
    data: {
      leadId,
      vercelUrl,
      htmlContent: html,
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "WEBSITE_BUILT" },
  });

  return { leadId, vercelUrl };
}
