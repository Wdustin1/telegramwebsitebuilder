import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { env } from "../../config/env.js";

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
    join(process.cwd(), "templates", "home-service.html"),
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
    .map((s) => `<li>${s}</li>`)
    .join("\n      ");

  const html = template
    .replaceAll("{{BUSINESS_NAME}}", lead.businessName)
    .replaceAll("{{NICHE}}", lead.niche)
    .replaceAll("{{CITY}}", lead.city)
    .replaceAll("{{HERO_TAGLINE}}", copy.heroTagline)
    .replaceAll("{{PHONE}}", lead.phone ?? "Contact Us")
    .replaceAll("{{ADDRESS}}", lead.address ?? lead.city)
    .replaceAll("{{SERVICES_LIST}}", servicesHtml)
    .replaceAll("{{ABOUT_TEXT}}", copy.aboutText);

  return html;
}
