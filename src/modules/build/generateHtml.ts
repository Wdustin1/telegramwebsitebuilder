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
  callToAction: string;
  services: string[];
  aboutText: string;
  trustBadge1: string;
  trustBadge2: string;
  trustBadge3: string;
}

/**
 * Map a niche to its best-fit template file.
 * trades-bold  → Plumber, HVAC, Electrician
 * roofing-trust → Roofer
 * outdoor-fresh → Landscaper
 * clean-modern  → Painter, Pressure Washer, Handyman (and any unknown niche)
 */
function templateForNiche(niche: string): string {
  const n = niche.toLowerCase();
  if (n.includes("plumb") || n.includes("hvac") || n.includes("electric")) {
    return "trades-bold.html";
  }
  if (n.includes("roof")) {
    return "roofing-trust.html";
  }
  if (n.includes("landscap") || n.includes("lawn") || n.includes("garden")) {
    return "outdoor-fresh.html";
  }
  // Painter, Pressure Washer, Handyman, or anything else
  return "clean-modern.html";
}

/**
 * Niche-specific trust badge defaults used as fallback hints in the prompt.
 * Claude will override these with better ones if it can, but they keep the
 * page looking real even if the model returns something odd.
 */
function defaultBadgesForNiche(niche: string): [string, string, string] {
  const n = niche.toLowerCase();
  if (n.includes("plumb")) return ["Licensed & Insured", "24/7 Emergency Service", "Free Estimates"];
  if (n.includes("hvac"))  return ["Licensed & Certified", "24/7 Emergency AC/Heat", "Free Estimates"];
  if (n.includes("electric")) return ["Licensed Master Electrician", "Fully Insured", "Free Estimates"];
  if (n.includes("roof"))  return ["Licensed & Insured", "Free Roof Inspection", "Insurance Claims Accepted"];
  if (n.includes("landscap") || n.includes("lawn")) return ["Fully Insured", "Free Estimates", "Locally Owned"];
  if (n.includes("paint"))  return ["Fully Insured", "Free Estimates", "Interior & Exterior"];
  if (n.includes("pressure") || n.includes("wash")) return ["Fully Insured", "Eco-Friendly Products", "Free Estimates"];
  return ["Licensed & Insured", "Free Estimates", "Locally Owned & Operated"];
}

export async function generateWebsiteHtml(lead: LeadData): Promise<string> {
  const templateFile = templateForNiche(lead.niche);
  const template = readFileSync(
    join(__dirname, "..", "..", "..", "templates", templateFile),
    "utf-8"
  );

  log.debug({ businessName: lead.businessName, template: templateFile }, "template_selected");

  const [badge1, badge2, badge3] = defaultBadgesForNiche(lead.niche);

  log.info({ businessName: lead.businessName }, "anthropic_call_started");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You write high-converting website copy for local home service businesses.
Your copy must feel SPECIFIC and LOCAL — not generic filler.
Return ONLY a JSON object with exactly these keys:
{
  "heroTagline": string,   // 8-12 words. Punchy, specific to the niche and city. E.g. "Springfield's Go-To Plumber for Fast, Reliable Repairs" or "Fast AC Repair When ${lead.city} Heats Up"
  "callToAction": string,  // 3-5 words for the main button. E.g. "Call for a Free Quote" or "Get a Free Estimate"
  "services": string[],    // 5-6 SPECIFIC, realistic services this niche actually offers. Not "General Services".
  "aboutText": string,     // 2-3 sentences. Warm, first-person tone like a real local owner wrote it. Mention the city.
  "trustBadge1": string,   // Short trust signal (2-5 words). Default hint: "${badge1}"
  "trustBadge2": string,   // Short trust signal (2-5 words). Default hint: "${badge2}"
  "trustBadge3": string    // Short trust signal (2-5 words). Default hint: "${badge3}"
}
No markdown, no explanation — JSON only.`,
    messages: [
      {
        role: "user",
        content: `Business: ${lead.businessName}
Type: ${lead.niche}
City: ${lead.city}

Write copy that makes a real ${lead.city} homeowner want to call them.`,
      },
    ],
  });

  log.info({ businessName: lead.businessName }, "anthropic_call_completed");

  let raw = (message.content[0] as { type: "text"; text: string }).text.trim();
  raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const copy: GeneratedCopy = JSON.parse(raw);

  log.debug(
    { businessName: lead.businessName, servicesCount: copy.services.length, template: templateFile },
    "copy_parsed"
  );

  const servicesHtml = copy.services
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("\n      ");

  const html = template
    .replaceAll("{{BUSINESS_NAME}}", escapeHtml(lead.businessName))
    .replaceAll("{{NICHE}}", escapeHtml(lead.niche))
    .replaceAll("{{CITY}}", escapeHtml(lead.city))
    .replaceAll("{{HERO_TAGLINE}}", escapeHtml(copy.heroTagline))
    .replaceAll("{{CALL_TO_ACTION}}", escapeHtml(copy.callToAction))
    .replaceAll("{{PHONE}}", escapeHtml(lead.phone ?? "Call Us"))
    .replaceAll("{{ADDRESS}}", escapeHtml(lead.address ?? lead.city))
    .replaceAll("{{SERVICES_LIST}}", servicesHtml)
    .replaceAll("{{ABOUT_TEXT}}", escapeHtml(copy.aboutText))
    .replaceAll("{{TRUST_BADGE_1}}", escapeHtml(copy.trustBadge1))
    .replaceAll("{{TRUST_BADGE_2}}", escapeHtml(copy.trustBadge2))
    .replaceAll("{{TRUST_BADGE_3}}", escapeHtml(copy.trustBadge3));

  return html;
}
