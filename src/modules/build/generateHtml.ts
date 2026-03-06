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

export interface ReviewSnippet {
  text: string;
  rating: number | null;
  author: string | null;
}

interface LeadData {
  businessName: string;
  niche: string;
  city: string;
  phone: string | null;
  address: string | null;
  // Enrichment fields (may be absent for older leads)
  rating?: number;
  reviewCount?: number;
  description?: string;
  category?: string;
  reviewSnippets?: ReviewSnippet[];
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
  return "clean-modern.html";
}

function defaultBadgesForNiche(niche: string): [string, string, string] {
  const n = niche.toLowerCase();
  if (n.includes("plumb"))   return ["Licensed & Insured", "24/7 Emergency Service", "Free Estimates"];
  if (n.includes("hvac"))    return ["Licensed & Certified", "24/7 Emergency AC/Heat", "Free Estimates"];
  if (n.includes("electric")) return ["Licensed Master Electrician", "Fully Insured", "Free Estimates"];
  if (n.includes("roof"))    return ["Licensed & Insured", "Free Roof Inspection", "Insurance Claims Accepted"];
  if (n.includes("landscap") || n.includes("lawn")) return ["Fully Insured", "Free Estimates", "Locally Owned"];
  if (n.includes("paint"))   return ["Fully Insured", "Free Estimates", "Interior & Exterior"];
  if (n.includes("pressure") || n.includes("wash")) return ["Fully Insured", "Eco-Friendly Products", "Free Estimates"];
  return ["Licensed & Insured", "Free Estimates", "Locally Owned & Operated"];
}

/** Build the star rating badge HTML, e.g. "★★★★★ 4.8 (127 reviews)" */
function buildRatingBadge(rating: number, reviewCount: number, darkHero = true): string {
  const stars = "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
  const style = darkHero
    ? `background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:white;`
    : `background:rgba(79,70,229,0.08);border:1px solid rgba(79,70,229,0.2);color:#4f46e5;`;
  return `<div class="rating-badge" style="${style}display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border-radius:999px;font-size:0.95rem;font-weight:600;margin-bottom:28px;">${stars} <strong>${rating.toFixed(1)}</strong> &nbsp;·&nbsp; ${reviewCount.toLocaleString()} Google Reviews</div>`;
}

/** Build the reviews section HTML from real snippets */
function buildReviewsSection(snippets: ReviewSnippet[]): string {
  if (!snippets || snippets.length === 0) return "";

  const cards = snippets
    .map((r) => {
      const stars = r.rating ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating) : "★★★★★";
      const author = r.author ? escapeHtml(r.author) : "Google Reviewer";
      const text = escapeHtml(r.text);
      return `
        <div class="review-card">
          <div class="review-stars">${stars}</div>
          <p class="review-text">"${text}"</p>
          <p class="review-author">— ${author}</p>
        </div>`;
    })
    .join("\n");

  return `
  <section class="reviews">
    <p class="section-eyebrow">What Customers Say</p>
    <h2 class="section-title">Real Reviews from Real Customers</h2>
    <div class="reviews-grid">${cards}
    </div>
  </section>`;
}

/** CSS to inject into every template for review cards + rating badge */
const REVIEWS_CSS = `
    /* RATING BADGE */
    .rating-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.25);
      color: white; padding: 8px 20px; border-radius: 999px;
      font-size: 0.95rem; font-weight: 600;
      margin-bottom: 28px;
    }
    .rating-badge strong { font-size: 1rem; }

    /* REVIEWS SECTION */
    .reviews { padding: 80px 24px; background: #f8fafc; }
    .reviews .section-eyebrow {
      text-align: center; font-size: 0.8rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.12em;
      color: #64748b; margin-bottom: 10px;
    }
    .reviews .section-title {
      text-align: center;
      font-size: clamp(1.6rem, 3vw, 2.3rem);
      font-weight: 800; letter-spacing: -0.02em;
      color: #0f172a; margin-bottom: 48px;
    }
    .reviews-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px; max-width: 1000px; margin: 0 auto;
    }
    .review-card {
      background: white; border-radius: 14px;
      padding: 28px 24px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.06);
    }
    .review-stars { color: #f59e0b; font-size: 1.1rem; margin-bottom: 12px; }
    .review-text {
      font-size: 0.95rem; line-height: 1.7; color: #334155;
      margin-bottom: 16px; font-style: italic;
    }
    .review-author { font-size: 0.85rem; font-weight: 600; color: #64748b; }
`;

export async function generateWebsiteHtml(lead: LeadData): Promise<string> {
  const templateFile = templateForNiche(lead.niche);
  let template = readFileSync(
    join(__dirname, "..", "..", "..", "templates", templateFile),
    "utf-8"
  );

  // Inject reviews CSS before </style>
  template = template.replace("</style>", `${REVIEWS_CSS}  </style>`);

  log.debug({ businessName: lead.businessName, template: templateFile }, "template_selected");

  const [badge1, badge2, badge3] = defaultBadgesForNiche(lead.niche);

  // Build enrichment context for the AI prompt
  const enrichmentLines: string[] = [];
  if (lead.rating && lead.reviewCount) {
    enrichmentLines.push(`Google Rating: ${lead.rating.toFixed(1)}★ across ${lead.reviewCount} reviews`);
  }
  if (lead.description) {
    enrichmentLines.push(`Google Description: "${lead.description}"`);
  }
  if (lead.category) {
    enrichmentLines.push(`Business Category: ${lead.category}`);
  }
  if (lead.reviewSnippets && lead.reviewSnippets.length > 0) {
    const reviewLines = lead.reviewSnippets
      .map((r, i) => `  Review ${i + 1} (${r.rating ?? "?"}★, by ${r.author ?? "anonymous"}): "${r.text}"`)
      .join("\n");
    enrichmentLines.push(`Real Customer Reviews:\n${reviewLines}`);
  }
  const enrichmentContext = enrichmentLines.length > 0
    ? `\n\nEnrichment data from Google:\n${enrichmentLines.join("\n")}`
    : "";

  log.info({ businessName: lead.businessName, hasEnrichment: enrichmentLines.length > 0 }, "anthropic_call_started");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You write high-converting website copy for local home service businesses.
Your copy must feel SPECIFIC and LOCAL — not generic filler.
When enrichment data is provided (rating, reviews, Google description), use it to write copy that references real facts about the business.
Return ONLY a JSON object with exactly these keys:
{
  "heroTagline": string,   // 8-12 words. Punchy, specific to the niche and city. If a high rating is available, reference it.
  "callToAction": string,  // 3-5 words for the main button. E.g. "Call for a Free Quote"
  "services": string[],    // 5-6 SPECIFIC, realistic services this niche actually offers. Not "General Services".
  "aboutText": string,     // 2-3 sentences. Warm, first-person tone like a real local owner wrote it. Mention the city. Reference any real review themes or Google description if available.
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
City: ${lead.city}${enrichmentContext}

Write copy that makes a real ${lead.city} homeowner want to call them immediately.`,
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

  // Build optional blocks — clean-modern has a light hero, others are dark
  const darkHero = templateFile !== "clean-modern.html";
  const ratingBadge = (lead.rating && lead.reviewCount)
    ? buildRatingBadge(lead.rating, lead.reviewCount, darkHero)
    : "";

  const reviewsSection = (lead.reviewSnippets && lead.reviewSnippets.length > 0)
    ? buildReviewsSection(lead.reviewSnippets)
    : "";

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
    .replaceAll("{{TRUST_BADGE_3}}", escapeHtml(copy.trustBadge3))
    .replaceAll("{{RATING_BADGE}}", ratingBadge)
    .replaceAll("{{REVIEWS_SECTION}}", reviewsSection);

  return html;
}
