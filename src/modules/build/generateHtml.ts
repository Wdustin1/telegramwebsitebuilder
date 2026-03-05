import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import OpenAI from "openai";
import { env } from "../../config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

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

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate website copy for local home service businesses. Return JSON with: heroTagline (string, short punchy tagline), services (array of 4-6 service names), aboutText (string, 2-3 sentences about the business).",
      },
      {
        role: "user",
        content: `Generate website copy for ${lead.businessName}, a ${lead.niche.toLowerCase()} in ${lead.city}.`,
      },
    ],
  });

  const copy: GeneratedCopy = JSON.parse(
    completion.choices[0].message.content!
  );

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
