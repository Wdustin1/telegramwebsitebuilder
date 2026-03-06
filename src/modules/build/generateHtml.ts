import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "generateHtml" });

const __dirname = dirname(fileURLToPath(import.meta.url));

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

interface LeadData {
  businessName: string;
  niche: string;
  city: string;
  phone: string | null;
  address: string | null;
}

interface GeneratedCopy {
  heroTagline: string;
  services: string[];
  aboutText: string;
}

export async function generateWebsiteHtml(lead: LeadData): Promise<string> {
  const template = readFileSync(
    join(__dirname, "..", "..", "..", "templates", "home-service.html"),
    "utf-8"
  );

  log.debug({ businessName: lead.businessName }, "template_read");

  log.info({ businessName: lead.businessName }, "anthropic_call_started");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system:
      "You generate website copy for local home service businesses. Return JSON only, no other text. JSON shape: { heroTagline: string (short punchy tagline), services: string[] (4-6 service names), aboutText: string (2-3 sentences about the business) }.",
    messages: [
      {
        role: "user",
        content: `Generate website copy for ${lead.businessName}, a ${lead.niche.toLowerCase()} in ${lead.city}.`,
      },
    ],
  });

  log.info({ businessName: lead.businessName }, "anthropic_call_completed");

  let raw = (message.content[0] as { type: "text"; text: string }).text.trim();
  // Strip markdown code fences if the model wraps the JSON
  raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const copy: GeneratedCopy = JSON.parse(raw);

  log.debug({ businessName: lead.businessName, servicesCount: copy.services.length }, "copy_parsed");

  const servicesHtml = copy.services
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("\n      ");

  const html = template
    .replaceAll("{{BUSINESS_NAME}}", escapeHtml(lead.businessName))
    .replaceAll("{{NICHE}}", escapeHtml(lead.niche))
    .replaceAll("{{CITY}}", escapeHtml(lead.city))
    .replaceAll("{{HERO_TAGLINE}}", escapeHtml(copy.heroTagline))
    .replaceAll("{{PHONE}}", escapeHtml(lead.phone ?? "Contact Us"))
    .replaceAll("{{ADDRESS}}", escapeHtml(lead.address ?? lead.city))
    .replaceAll("{{SERVICES_LIST}}", servicesHtml)
    .replaceAll("{{ABOUT_TEXT}}", escapeHtml(copy.aboutText));

  return html;
}
