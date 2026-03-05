# Telegram Website Builder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Telegram bot that automates lead generation and sales outreach for local home service businesses — scraping leads, building websites, sending emails, and making AI calls.

**Architecture:** Monolith Node.js/TypeScript app with grammY bot + BullMQ background workers. PostgreSQL via Prisma, Redis for queues/sessions. Docker Compose deployment.

**Tech Stack:** Node.js, TypeScript, grammY, Prisma, BullMQ, Redis, Outscraper, OpenAI, Vercel API, Hunter.io, SendGrid, Bland.ai

**Design doc:** `docs/plans/2026-03-04-telegram-website-builder-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `src/config/env.ts`

**Step 1: Initialize project and install dependencies**

```bash
npm init -y
npm install grammy @grammyjs/conversations @grammyjs/session prisma @prisma/client bullmq ioredis openai @sendgrid/mail dotenv zod
npm install -D typescript @types/node tsx vitest
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create .env.example**

```env
# Telegram
TELEGRAM_BOT_TOKEN=

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/websitebuilder

# Redis
REDIS_URL=redis://localhost:6379

# Outscraper
OUTSCRAPER_API_KEY=

# OpenAI
OPENAI_API_KEY=

# Vercel
VERCEL_API_TOKEN=

# Hunter.io
HUNTER_API_KEY=

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Bland.ai
BLAND_API_KEY=

# Webhooks (public URL for SendGrid/Bland callbacks)
WEBHOOK_BASE_URL=
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

**Step 5: Create src/config/env.ts**

```typescript
import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().min(1),
  OUTSCRAPER_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  VERCEL_API_TOKEN: z.string().min(1),
  HUNTER_API_KEY: z.string().min(1),
  SENDGRID_API_KEY: z.string().min(1),
  SENDGRID_FROM_EMAIL: z.string().email(),
  BLAND_API_KEY: z.string().min(1),
  WEBHOOK_BASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

**Step 6: Create src/index.ts (minimal entrypoint)**

```typescript
import { env } from "./config/env.js";

console.log("Telegram Website Builder starting...");
console.log(`Bot token loaded: ${env.TELEGRAM_BOT_TOKEN.slice(0, 5)}...`);
```

**Step 7: Add scripts to package.json**

Add to package.json scripts:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with dependencies and env config"
```

---

## Task 2: Docker Compose Setup

**Files:**
- Create: `docker-compose.yml`
- Create: `Dockerfile`

**Step 1: Create docker-compose.yml**

```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./templates:/app/templates

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: websitebuilder
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

**Step 2: Create Dockerfile**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

**Step 3: Commit**

```bash
git add docker-compose.yml Dockerfile
git commit -m "feat: add Docker Compose with Postgres, Redis, and app service"
```

---

## Task 3: Prisma Schema & Database

**Files:**
- Create: `prisma/schema.prisma`

**Step 1: Initialize Prisma**

```bash
npx prisma init
```

**Step 2: Write schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id         Int        @id @default(autoincrement())
  telegramId BigInt     @unique @map("telegram_id")
  username   String?
  createdAt  DateTime   @default(now()) @map("created_at")
  campaigns  Campaign[]

  @@map("users")
}

model Campaign {
  id        Int            @id @default(autoincrement())
  userId    Int            @map("user_id")
  niche     String
  city      String
  status    CampaignStatus @default(SCRAPING)
  createdAt DateTime       @default(now()) @map("created_at")
  user      User           @relation(fields: [userId], references: [id])
  leads     Lead[]

  @@map("campaigns")
}

enum CampaignStatus {
  SCRAPING
  READY
  IN_PROGRESS
  COMPLETED
}

model Lead {
  id           Int        @id @default(autoincrement())
  campaignId   Int        @map("campaign_id")
  businessName String     @map("business_name")
  phone        String?
  address      String?
  hasWebsite   Boolean    @default(false) @map("has_website")
  ownerEmail   String?    @map("owner_email")
  status       LeadStatus @default(NEW)
  createdAt    DateTime   @default(now()) @map("created_at")
  campaign     Campaign   @relation(fields: [campaignId], references: [id])
  website      Website?
  emails       Email[]
  calls        Call[]

  @@map("leads")
}

enum LeadStatus {
  NEW
  WEBSITE_BUILT
  EMAILED
  CALLED
  RESPONDED
}

model Website {
  id          Int      @id @default(autoincrement())
  leadId      Int      @unique @map("lead_id")
  vercelUrl   String   @map("vercel_url")
  htmlContent String   @map("html_content") @db.Text
  deployedAt  DateTime @default(now()) @map("deployed_at")
  lead        Lead     @relation(fields: [leadId], references: [id])

  @@map("websites")
}

model Email {
  id             Int         @id @default(autoincrement())
  leadId         Int         @map("lead_id")
  subject        String
  body           String      @db.Text
  status         EmailStatus @default(QUEUED)
  sequenceNumber Int         @map("sequence_number")
  sentAt         DateTime?   @map("sent_at")
  lead           Lead        @relation(fields: [leadId], references: [id])

  @@map("emails")
}

enum EmailStatus {
  QUEUED
  SENT
  OPENED
  REPLIED
  BOUNCED
}

model Call {
  id         Int         @id @default(autoincrement())
  leadId     Int         @map("lead_id")
  blandCallId String?    @map("bland_call_id")
  status     CallStatus  @default(QUEUED)
  duration   Int?
  transcript String?     @db.Text
  outcome    CallOutcome?
  calledAt   DateTime?   @map("called_at")
  lead       Lead        @relation(fields: [leadId], references: [id])

  @@map("calls")
}

enum CallStatus {
  QUEUED
  IN_PROGRESS
  COMPLETED
  FAILED
}

enum CallOutcome {
  INTERESTED
  NOT_INTERESTED
  VOICEMAIL
  NO_ANSWER
}
```

**Step 3: Create Prisma client singleton**

Create `src/db/client.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

**Step 4: Generate client and run migration**

```bash
npx prisma migrate dev --name init
```

**Step 5: Commit**

```bash
git add prisma/ src/db/
git commit -m "feat: add Prisma schema with all models and initial migration"
```

---

## Task 4: Bot Skeleton with Sessions

**Files:**
- Create: `src/bot/bot.ts`
- Create: `src/bot/session.ts`
- Create: `src/bot/commands/start.ts`
- Modify: `src/index.ts`

**Step 1: Create session type definition — src/bot/session.ts**

```typescript
export interface SessionData {
  activeCampaignId?: number;
}

export function initialSession(): SessionData {
  return {};
}
```

**Step 2: Create bot instance — src/bot/bot.ts**

```typescript
import { Bot, Context, session } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";
import { env } from "../config/env.js";
import { SessionData, initialSession } from "./session.js";

export type BotContext = Context & ConversationFlavor & { session: SessionData };
export type BotConversation = Conversation<BotContext>;

export function createBot() {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

  bot.use(
    session({
      initial: initialSession,
    })
  );
  bot.use(conversations());

  return bot;
}
```

**Step 3: Create /start command — src/bot/commands/start.ts**

```typescript
import { BotContext } from "../bot.js";
import { InlineKeyboard } from "grammy";
import { prisma } from "../../db/client.js";

export async function startCommand(ctx: BotContext) {
  if (!ctx.from) return;

  await prisma.user.upsert({
    where: { telegramId: ctx.from.id },
    update: { username: ctx.from.username ?? null },
    create: {
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
    },
  });

  const keyboard = new InlineKeyboard().text(
    "Create New Campaign",
    "new_campaign"
  );

  await ctx.reply(
    "Welcome to Website Builder Bot!\n\n" +
      "I help you find local businesses without websites, " +
      "build professional sites for them, and reach out via email and phone.\n\n" +
      "Tap below to get started.",
    { reply_markup: keyboard }
  );
}
```

**Step 4: Wire up bot in src/index.ts**

```typescript
import { env } from "./config/env.js";
import { createBot } from "./bot/bot.js";
import { startCommand } from "./bot/commands/start.js";

async function main() {
  const bot = createBot();

  bot.command("start", startCommand);

  bot.start();
  console.log("Bot is running...");
}

main().catch(console.error);
```

**Step 5: Test manually** (requires bot token + running Postgres)

```bash
npm run dev
```

Send `/start` to the bot in Telegram. Should see welcome message with button.

**Step 6: Commit**

```bash
git add src/bot/ src/index.ts
git commit -m "feat: add grammY bot skeleton with sessions and /start command"
```

---

## Task 5: Campaign Creation Conversation

**Files:**
- Create: `src/bot/conversations/newCampaign.ts`
- Modify: `src/bot/bot.ts`
- Modify: `src/index.ts`

**Step 1: Create campaign conversation — src/bot/conversations/newCampaign.ts**

```typescript
import { InlineKeyboard } from "grammy";
import { BotConversation, BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";

const NICHES = [
  "Plumber",
  "Roofer",
  "HVAC",
  "Pressure Washer",
  "Electrician",
  "Landscaper",
  "Painter",
  "Handyman",
];

export async function newCampaignConversation(
  conversation: BotConversation,
  ctx: BotContext
) {
  // Step 1: Pick niche
  const nicheKeyboard = new InlineKeyboard();
  for (let i = 0; i < NICHES.length; i += 2) {
    const row = nicheKeyboard;
    row.text(NICHES[i], `niche_${NICHES[i]}`);
    if (NICHES[i + 1]) row.text(NICHES[i + 1], `niche_${NICHES[i + 1]}`);
    nicheKeyboard.row();
  }

  await ctx.reply("What type of business do you want to target?", {
    reply_markup: nicheKeyboard,
  });

  const nicheResponse = await conversation.waitForCallbackQuery(/^niche_/);
  const niche = nicheResponse.callbackQuery.data.replace("niche_", "");
  await nicheResponse.answerCallbackQuery();
  await nicheResponse.editMessageText(`Niche selected: ${niche}`);

  // Step 2: Pick city
  await ctx.reply("What city do you want to target? Type the city name:");
  const cityResponse = await conversation.waitFor("message:text");
  const city = cityResponse.message.text.trim();

  // Step 3: Confirm
  const confirmKeyboard = new InlineKeyboard()
    .text("Yes, start scraping", "confirm_campaign")
    .text("Cancel", "cancel_campaign");

  await ctx.reply(
    `Find ${niche.toLowerCase()}s in ${city} without websites?`,
    { reply_markup: confirmKeyboard }
  );

  const confirmResponse = await conversation.waitForCallbackQuery(
    /^(confirm|cancel)_campaign$/
  );
  await confirmResponse.answerCallbackQuery();

  if (confirmResponse.callbackQuery.data === "cancel_campaign") {
    await confirmResponse.editMessageText("Campaign cancelled.");
    return;
  }

  // Create campaign in DB
  const user = await prisma.user.findUnique({
    where: { telegramId: ctx.from!.id },
  });

  const campaign = await prisma.campaign.create({
    data: {
      userId: user!.id,
      niche,
      city,
      status: "SCRAPING",
    },
  });

  await confirmResponse.editMessageText(
    `Campaign created! Scraping ${niche.toLowerCase()}s in ${city}...\n` +
      "I'll notify you when results are ready."
  );

  // TODO: Queue scrape job here (Task 7)
}
```

**Step 2: Register conversation in bot.ts**

Add to `createBot()` after `bot.use(conversations())`:

```typescript
import { newCampaignConversation } from "./conversations/newCampaign.js";

// inside createBot(), after bot.use(conversations()):
bot.use(createConversation(newCampaignConversation));
```

**Step 3: Wire callback query to enter conversation in index.ts**

Add after `bot.command("start", startCommand)`:

```typescript
bot.callbackQuery("new_campaign", async (ctx) => {
  await ctx.conversation.enter("newCampaignConversation");
});
```

**Step 4: Test manually**

```bash
npm run dev
```

Send `/start`, tap "Create New Campaign", pick a niche, type a city, confirm.

**Step 5: Commit**

```bash
git add src/bot/
git commit -m "feat: add campaign creation conversation flow"
```

---

## Task 6: BullMQ Queue Infrastructure

**Files:**
- Create: `src/jobs/queues.ts`
- Create: `src/jobs/workers.ts`
- Create: `src/jobs/connection.ts`
- Modify: `src/index.ts`

**Step 1: Create Redis connection — src/jobs/connection.ts**

```typescript
import IORedis from "ioredis";
import { env } from "../config/env.js";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
```

**Step 2: Create queue definitions — src/jobs/queues.ts**

```typescript
import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export const scrapeQueue = new Queue("scrape", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const buildQueue = new Queue("build", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const emailFindQueue = new Queue("email-find", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const emailSendQueue = new Queue("email-send", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const emailFollowupQueue = new Queue("email-followup", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const callQueue = new Queue("call", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});
```

**Step 3: Create worker stubs — src/jobs/workers.ts**

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "./connection.js";

export function startWorkers() {
  const scrapeWorker = new Worker(
    "scrape",
    async (job) => {
      console.log(`Processing scrape job ${job.id}`, job.data);
      // TODO: implement in Task 7
    },
    { connection: redisConnection, concurrency: 1 }
  );

  const buildWorker = new Worker(
    "build",
    async (job) => {
      console.log(`Processing build job ${job.id}`, job.data);
      // TODO: implement in Task 8
    },
    { connection: redisConnection, concurrency: 3 }
  );

  const emailFindWorker = new Worker(
    "email-find",
    async (job) => {
      console.log(`Processing email-find job ${job.id}`, job.data);
      // TODO: implement in Task 9
    },
    { connection: redisConnection, concurrency: 5 }
  );

  const emailSendWorker = new Worker(
    "email-send",
    async (job) => {
      console.log(`Processing email-send job ${job.id}`, job.data);
      // TODO: implement in Task 9
    },
    {
      connection: redisConnection,
      limiter: { max: 10, duration: 60000 },
    }
  );

  const emailFollowupWorker = new Worker(
    "email-followup",
    async (job) => {
      console.log(`Processing email-followup job ${job.id}`, job.data);
      // TODO: implement in Task 9
    },
    {
      connection: redisConnection,
      limiter: { max: 10, duration: 60000 },
    }
  );

  const callWorker = new Worker(
    "call",
    async (job) => {
      console.log(`Processing call job ${job.id}`, job.data);
      // TODO: implement in Task 10
    },
    { connection: redisConnection, concurrency: 1 }
  );

  console.log("All workers started");

  return [
    scrapeWorker,
    buildWorker,
    emailFindWorker,
    emailSendWorker,
    emailFollowupWorker,
    callWorker,
  ];
}
```

**Step 4: Start workers in src/index.ts**

Add to `main()` before `bot.start()`:

```typescript
import { startWorkers } from "./jobs/workers.js";

// inside main():
startWorkers();
```

**Step 5: Commit**

```bash
git add src/jobs/ src/index.ts
git commit -m "feat: add BullMQ queue infrastructure with worker stubs"
```

---

## Task 7: Find Module (Outscraper)

**Files:**
- Create: `src/modules/find/outscraper.ts`
- Create: `src/modules/find/scrapeProcessor.ts`
- Modify: `src/jobs/workers.ts`
- Modify: `src/bot/conversations/newCampaign.ts`

**Step 1: Create Outscraper API client — src/modules/find/outscraper.ts**

```typescript
import { env } from "../../config/env.js";

interface OutscraperResult {
  name: string;
  phone?: string;
  full_address?: string;
  site?: string;
}

export async function scrapeGoogleMaps(
  niche: string,
  city: string
): Promise<OutscraperResult[]> {
  const query = `${niche} in ${city}`;

  const response = await fetch(
    `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=50`,
    {
      headers: {
        "X-API-KEY": env.OUTSCRAPER_API_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Outscraper API error: ${response.status}`);
  }

  const data = await response.json();

  // Outscraper returns nested arrays
  const results: OutscraperResult[] = data.data?.[0] ?? [];
  return results;
}
```

**Step 2: Create scrape processor — src/modules/find/scrapeProcessor.ts**

```typescript
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
```

**Step 3: Wire processor into workers.ts**

Replace the scrape worker stub:

```typescript
import { processScrapeJob, ScrapeJobData } from "../modules/find/scrapeProcessor.js";

const scrapeWorker = new Worker<ScrapeJobData>(
  "scrape",
  processScrapeJob,
  { connection: redisConnection, concurrency: 1 }
);
```

**Step 4: Add bot notification on scrape completion**

Add to workers.ts, after creating scrapeWorker:

```typescript
import { Bot } from "grammy";
import { BotContext } from "../bot/bot.js";

// Accept bot instance in startWorkers(bot)
export function startWorkers(bot: Bot<BotContext>) {
  // ... worker definitions ...

  scrapeWorker.on("completed", async (job) => {
    if (!job) return;
    const { telegramId } = job.data;
    const result = job.returnvalue;
    const keyboard = new InlineKeyboard()
      .text("View Leads", `view_leads_${job.data.campaignId}`)
      .text("Build Websites", `build_websites_${job.data.campaignId}`);

    await bot.api.sendMessage(
      telegramId,
      `Scraping complete!\n\n` +
        `Found ${result.totalFound} businesses.\n` +
        `${result.withoutWebsite} don't have websites.`,
      { reply_markup: keyboard }
    );
  });

  scrapeWorker.on("failed", async (job) => {
    if (!job) return;
    await bot.api.sendMessage(
      job.data.telegramId,
      `Scraping failed: ${job.failedReason}. Please try again.`
    );
  });
}
```

**Step 5: Queue scrape job from campaign conversation**

In `newCampaign.ts`, replace the `// TODO: Queue scrape job here` comment:

```typescript
import { scrapeQueue } from "../../jobs/queues.js";

// after creating campaign:
await scrapeQueue.add("scrape-campaign", {
  campaignId: campaign.id,
  niche,
  city,
  telegramId: ctx.from!.id,
});
```

**Step 6: Commit**

```bash
git add src/modules/find/ src/jobs/ src/bot/
git commit -m "feat: add Find module with Outscraper scraping and queue processing"
```

---

## Task 8: Build Module (OpenAI + Vercel)

**Files:**
- Create: `src/modules/build/generateHtml.ts`
- Create: `src/modules/build/deployVercel.ts`
- Create: `src/modules/build/buildProcessor.ts`
- Create: `templates/home-service.html`
- Modify: `src/jobs/workers.ts`

**Step 1: Create base HTML template — templates/home-service.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{BUSINESS_NAME}} — {{NICHE}} in {{CITY}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
    .hero { background: linear-gradient(135deg, #1e3a5f, #2d5f8a); color: white; padding: 80px 20px; text-align: center; }
    .hero h1 { font-size: 2.5rem; margin-bottom: 16px; }
    .hero p { font-size: 1.2rem; margin-bottom: 32px; opacity: 0.9; }
    .hero a { background: #f59e0b; color: #1e3a5f; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 1.1rem; }
    section { padding: 60px 20px; max-width: 800px; margin: 0 auto; }
    .services h2, .about h2 { font-size: 1.8rem; margin-bottom: 24px; text-align: center; }
    .services ul { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .services li { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .about p { line-height: 1.8; text-align: center; }
    .contact { background: #f8f9fa; padding: 60px 20px; text-align: center; }
    .contact h2 { font-size: 1.8rem; margin-bottom: 24px; }
    .contact p { font-size: 1.1rem; margin-bottom: 8px; }
    .contact a { color: #1e3a5f; font-weight: bold; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>{{BUSINESS_NAME}}</h1>
    <p>{{HERO_TAGLINE}}</p>
    <a href="tel:{{PHONE}}">Call Now — {{PHONE}}</a>
  </div>
  <section class="services">
    <h2>Our Services</h2>
    <ul>{{SERVICES_LIST}}</ul>
  </section>
  <section class="about">
    <h2>About Us</h2>
    <p>{{ABOUT_TEXT}}</p>
  </section>
  <div class="contact">
    <h2>Contact Us</h2>
    <p>Phone: <a href="tel:{{PHONE}}">{{PHONE}}</a></p>
    <p>Address: {{ADDRESS}}</p>
  </div>
</body>
</html>
```

**Step 2: Create HTML generator — src/modules/build/generateHtml.ts**

```typescript
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
```

**Step 3: Create Vercel deployer — src/modules/build/deployVercel.ts**

```typescript
import { env } from "../../config/env.js";

export async function deployToVercel(
  slug: string,
  html: string
): Promise<string> {
  const response = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: slug,
      files: [
        {
          file: "index.html",
          data: Buffer.from(html).toString("base64"),
          encoding: "base64",
        },
      ],
      projectSettings: {
        framework: null,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vercel deploy failed: ${error}`);
  }

  const data = await response.json();
  return `https://${data.url}`;
}
```

**Step 4: Create build processor — src/modules/build/buildProcessor.ts**

```typescript
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

  const slug = lead.businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

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
```

**Step 5: Wire into workers.ts**

Replace the build worker stub:

```typescript
import { processBuildJob, BuildJobData } from "../modules/build/buildProcessor.js";

const buildWorker = new Worker<BuildJobData>(
  "build",
  processBuildJob,
  { connection: redisConnection, concurrency: 3 }
);
```

Add completion/failure handlers similar to scrape worker.

**Step 6: Commit**

```bash
git add src/modules/build/ templates/ src/jobs/
git commit -m "feat: add Build module with OpenAI copy generation and Vercel deployment"
```

---

## Task 9: Email Module (Hunter.io + SendGrid)

**Files:**
- Create: `src/modules/email/hunterLookup.ts`
- Create: `src/modules/email/sendEmail.ts`
- Create: `src/modules/email/emailProcessor.ts`
- Create: `src/modules/email/emailTemplates.ts`
- Modify: `src/jobs/workers.ts`

**Step 1: Create Hunter.io client — src/modules/email/hunterLookup.ts**

```typescript
import { env } from "../../config/env.js";

export async function findEmail(
  domain: string
): Promise<string | null> {
  const response = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${env.HUNTER_API_KEY}`
  );

  if (!response.ok) return null;

  const data = await response.json();
  const emails = data.data?.emails ?? [];

  if (emails.length === 0) return null;

  // Return the most confident email
  return emails.sort(
    (a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0)
  )[0].value;
}

export async function findEmailByName(
  company: string,
  domain?: string
): Promise<string | null> {
  if (domain) return findEmail(domain);

  const response = await fetch(
    `https://api.hunter.io/v2/email-finder?company=${encodeURIComponent(company)}&api_key=${env.HUNTER_API_KEY}`
  );

  if (!response.ok) return null;

  const data = await response.json();
  return data.data?.email ?? null;
}
```

**Step 2: Create email templates — src/modules/email/emailTemplates.ts**

```typescript
interface EmailContext {
  businessName: string;
  niche: string;
  city: string;
  websiteUrl: string;
}

export function getEmailSequence(ctx: EmailContext) {
  return [
    {
      sequenceNumber: 1,
      subject: `I built a website for ${ctx.businessName}`,
      body:
        `Hi,\n\n` +
        `I noticed ${ctx.businessName} doesn't have a website yet. ` +
        `As a ${ctx.niche.toLowerCase()} in ${ctx.city}, you're missing out on customers searching online.\n\n` +
        `I went ahead and built one for you — take a look:\n` +
        `${ctx.websiteUrl}\n\n` +
        `It's mobile-friendly and ready to go. If you'd like to keep it, I can set it up on your own domain.\n\n` +
        `Let me know what you think!\n\n` +
        `Best regards`,
      delay: 0,
    },
    {
      sequenceNumber: 2,
      subject: `Re: Website for ${ctx.businessName}`,
      body:
        `Hi,\n\n` +
        `Just wanted to follow up on the website I built for ${ctx.businessName}:\n` +
        `${ctx.websiteUrl}\n\n` +
        `Happy to walk you through it or make any changes. ` +
        `No obligation at all.\n\n` +
        `Best regards`,
      delay: 3 * 24 * 60 * 60 * 1000, // 3 days in ms
    },
    {
      sequenceNumber: 3,
      subject: `Last note about ${ctx.businessName}'s website`,
      body:
        `Hi,\n\n` +
        `Final follow-up — the website I built for ${ctx.businessName} is still live at:\n` +
        `${ctx.websiteUrl}\n\n` +
        `If you're interested in keeping it, just reply to this email. ` +
        `Otherwise, no worries at all.\n\n` +
        `Best regards`,
      delay: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    },
  ];
}
```

**Step 3: Create SendGrid sender — src/modules/email/sendEmail.ts**

```typescript
import sgMail from "@sendgrid/mail";
import { env } from "../../config/env.js";

sgMail.setApiKey(env.SENDGRID_API_KEY);

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  await sgMail.send({
    to,
    from: env.SENDGRID_FROM_EMAIL,
    subject,
    text: body,
  });
}
```

**Step 4: Create email processors — src/modules/email/emailProcessor.ts**

```typescript
import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { findEmailByName } from "./hunterLookup.js";
import { sendEmail } from "./sendEmail.js";
import { getEmailSequence } from "./emailTemplates.js";
import { emailSendQueue, emailFollowupQueue } from "../../jobs/queues.js";

export interface EmailFindJobData {
  leadId: number;
  telegramId: number;
  campaignId: number;
}

export async function processEmailFindJob(job: Job<EmailFindJobData>) {
  const { leadId } = job.data;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
  });

  if (lead.ownerEmail) return { email: lead.ownerEmail, alreadyHad: true };

  const email = await findEmailByName(lead.businessName);

  if (!email) return { email: null, found: false };

  await prisma.lead.update({
    where: { id: leadId },
    data: { ownerEmail: email },
  });

  return { email, found: true };
}

export interface EmailSendJobData {
  leadId: number;
  sequenceNumber: number;
  telegramId: number;
}

export async function processEmailSendJob(job: Job<EmailSendJobData>) {
  const { leadId, sequenceNumber, telegramId } = job.data;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { website: true, campaign: true },
  });

  if (!lead.ownerEmail || !lead.website) {
    return { sent: false, reason: "no email or website" };
  }

  // Check if previous email bounced
  const bouncedEmail = await prisma.email.findFirst({
    where: { leadId, status: "BOUNCED" },
  });
  if (bouncedEmail) return { sent: false, reason: "previous bounce" };

  const sequence = getEmailSequence({
    businessName: lead.businessName,
    niche: lead.campaign.niche,
    city: lead.campaign.city,
    websiteUrl: lead.website.vercelUrl,
  });

  const template = sequence.find((s) => s.sequenceNumber === sequenceNumber);
  if (!template) return { sent: false, reason: "invalid sequence number" };

  await sendEmail(lead.ownerEmail, template.subject, template.body);

  await prisma.email.create({
    data: {
      leadId,
      subject: template.subject,
      body: template.body,
      status: "SENT",
      sequenceNumber,
      sentAt: new Date(),
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "EMAILED" },
  });

  // Schedule next follow-up if not the last email
  const nextTemplate = sequence.find(
    (s) => s.sequenceNumber === sequenceNumber + 1
  );
  if (nextTemplate) {
    await emailFollowupQueue.add(
      `followup-${leadId}-${sequenceNumber + 1}`,
      { leadId, sequenceNumber: sequenceNumber + 1, telegramId },
      { delay: nextTemplate.delay }
    );
  }

  return { sent: true, sequenceNumber };
}
```

**Step 5: Wire into workers.ts**

Replace email worker stubs with real processors.

**Step 6: Commit**

```bash
git add src/modules/email/ src/jobs/
git commit -m "feat: add Email module with Hunter.io lookup and SendGrid outreach sequence"
```

---

## Task 10: Call Module (Bland.ai)

**Files:**
- Create: `src/modules/call/blandClient.ts`
- Create: `src/modules/call/callProcessor.ts`
- Modify: `src/jobs/workers.ts`

**Step 1: Create Bland.ai client — src/modules/call/blandClient.ts**

```typescript
import { env } from "../../config/env.js";

interface CallRequest {
  phoneNumber: string;
  prompt: string;
  webhookUrl: string;
}

interface CallResponse {
  call_id: string;
  status: string;
}

export async function makeCall(request: CallRequest): Promise<CallResponse> {
  const response = await fetch("https://api.bland.ai/v1/calls", {
    method: "POST",
    headers: {
      Authorization: env.BLAND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone_number: request.phoneNumber,
      task: request.prompt,
      voice: "mason",
      wait_for_greeting: true,
      webhook: request.webhookUrl,
      max_duration: 5,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bland.ai API error: ${error}`);
  }

  return response.json();
}
```

**Step 2: Create call processor — src/modules/call/callProcessor.ts**

```typescript
import { Job } from "bullmq";
import { prisma } from "../../db/client.js";
import { makeCall } from "./blandClient.js";
import { env } from "../../config/env.js";

export interface CallJobData {
  leadId: number;
  telegramId: number;
}

function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

function msUntilNextBusinessHour(): number {
  const now = new Date();
  const next = new Date(now);

  if (now.getDay() === 5 && now.getHours() >= 17) {
    next.setDate(now.getDate() + 3); // Skip to Monday
  } else if (now.getDay() === 6) {
    next.setDate(now.getDate() + 2);
  } else if (now.getDay() === 0) {
    next.setDate(now.getDate() + 1);
  } else if (now.getHours() >= 17) {
    next.setDate(now.getDate() + 1);
  }

  next.setHours(9, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export async function processCallJob(job: Job<CallJobData>) {
  if (!isBusinessHours()) {
    const delay = msUntilNextBusinessHour();
    await job.moveToDelayed(Date.now() + delay);
    return { delayed: true, reason: "outside business hours" };
  }

  const { leadId } = job.data;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { website: true, campaign: true },
  });

  if (!lead.phone) {
    return { called: false, reason: "no phone number" };
  }

  const prompt =
    `You're calling ${lead.businessName}, a ${lead.campaign.niche.toLowerCase()} in ${lead.campaign.city}. ` +
    `You built them a free website at ${lead.website?.vercelUrl ?? "our platform"}. ` +
    `Your goal is to let them know about the website and see if they'd like to keep it for a small monthly fee. ` +
    `Be friendly, professional, and brief. If they're not interested, thank them and end the call.`;

  const result = await makeCall({
    phoneNumber: lead.phone,
    prompt,
    webhookUrl: `${env.WEBHOOK_BASE_URL}/webhooks/bland`,
  });

  await prisma.call.create({
    data: {
      leadId,
      blandCallId: result.call_id,
      status: "IN_PROGRESS",
      calledAt: new Date(),
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "CALLED" },
  });

  return { called: true, callId: result.call_id };
}
```

**Step 3: Wire into workers.ts**

Replace call worker stub with real processor.

**Step 4: Commit**

```bash
git add src/modules/call/ src/jobs/
git commit -m "feat: add Call module with Bland.ai integration and business hours enforcement"
```

---

## Task 11: Bot Action Handlers

**Files:**
- Create: `src/bot/handlers/campaignActions.ts`
- Modify: `src/index.ts`

**Step 1: Create campaign action handlers — src/bot/handlers/campaignActions.ts**

```typescript
import { InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { buildQueue } from "../../jobs/queues.js";
import { emailFindQueue, emailSendQueue } from "../../jobs/queues.js";
import { callQueue } from "../../jobs/queues.js";

export async function handleViewLeads(ctx: BotContext, campaignId: number) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false },
    take: 10,
  });

  if (leads.length === 0) {
    await ctx.reply("No leads without websites found.");
    return;
  }

  let message = "Leads without websites:\n\n";
  for (const lead of leads) {
    message += `- ${lead.businessName}`;
    if (lead.phone) message += ` | ${lead.phone}`;
    message += `\n`;
  }

  const total = await prisma.lead.count({
    where: { campaignId, hasWebsite: false },
  });

  if (total > 10) {
    message += `\n...and ${total - 10} more`;
  }

  const keyboard = new InlineKeyboard()
    .text("Build Websites", `build_websites_${campaignId}`)
    .row()
    .text("Start Email Campaign", `start_emails_${campaignId}`)
    .row()
    .text("Start Calling", `start_calls_${campaignId}`);

  await ctx.reply(message, { reply_markup: keyboard });
}

export async function handleBuildWebsites(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW" },
  });

  if (leads.length === 0) {
    await ctx.reply("No new leads to build websites for.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(`Yes, build ${leads.length} websites`, `confirm_build_${campaignId}`)
    .text("Cancel", "cancel_action");

  await ctx.reply(
    `Build websites for ${leads.length} leads?`,
    { reply_markup: keyboard }
  );
}

export async function handleConfirmBuild(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, hasWebsite: false, status: "NEW" },
  });

  for (const lead of leads) {
    await buildQueue.add(`build-${lead.id}`, {
      leadId: lead.id,
      telegramId: ctx.from!.id,
      campaignId,
    });
  }

  await ctx.editMessageText(
    `Queued ${leads.length} website builds. I'll update you as they complete.`
  );
}

export async function handleStartEmails(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, status: "WEBSITE_BUILT" },
  });

  if (leads.length === 0) {
    await ctx.reply("No leads with built websites ready for email outreach.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(
      `Yes, email ${leads.length} leads`,
      `confirm_emails_${campaignId}`
    )
    .text("Cancel", "cancel_action");

  await ctx.reply(
    `Start email outreach for ${leads.length} leads?\n` +
      `(Will first find emails via Hunter.io, then send 3-email sequence)`,
    { reply_markup: keyboard }
  );
}

export async function handleConfirmEmails(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: { campaignId, status: "WEBSITE_BUILT" },
  });

  for (const lead of leads) {
    await emailFindQueue.add(`find-email-${lead.id}`, {
      leadId: lead.id,
      telegramId: ctx.from!.id,
      campaignId,
    });
  }

  await ctx.editMessageText(
    `Looking up emails for ${leads.length} leads. Will start sending once emails are found.`
  );
}

export async function handleStartCalls(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      phone: { not: null },
      status: { in: ["WEBSITE_BUILT", "EMAILED"] },
    },
  });

  if (leads.length === 0) {
    await ctx.reply("No leads with phone numbers ready for calling.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(`Yes, call ${leads.length} leads`, `confirm_calls_${campaignId}`)
    .text("Cancel", "cancel_action");

  await ctx.reply(
    `Start AI calls to ${leads.length} leads?\n` +
      `(Calls only happen during business hours, 9am-5pm)`,
    { reply_markup: keyboard }
  );
}

export async function handleConfirmCalls(
  ctx: BotContext,
  campaignId: number
) {
  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      phone: { not: null },
      status: { in: ["WEBSITE_BUILT", "EMAILED"] },
    },
  });

  for (const lead of leads) {
    await callQueue.add(`call-${lead.id}`, {
      leadId: lead.id,
      telegramId: ctx.from!.id,
    });
  }

  await ctx.editMessageText(
    `Queued ${leads.length} calls. I'll notify you of each outcome.`
  );
}
```

**Step 2: Register callback query handlers in index.ts**

```typescript
import {
  handleViewLeads,
  handleBuildWebsites,
  handleConfirmBuild,
  handleStartEmails,
  handleConfirmEmails,
  handleStartCalls,
  handleConfirmCalls,
} from "./bot/handlers/campaignActions.js";

// Callback query routing
bot.callbackQuery(/^view_leads_(\d+)$/, async (ctx) => {
  const campaignId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await handleViewLeads(ctx, campaignId);
});

bot.callbackQuery(/^build_websites_(\d+)$/, async (ctx) => {
  const campaignId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await handleBuildWebsites(ctx, campaignId);
});

bot.callbackQuery(/^confirm_build_(\d+)$/, async (ctx) => {
  const campaignId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await handleConfirmBuild(ctx, campaignId);
});

bot.callbackQuery(/^start_emails_(\d+)$/, async (ctx) => {
  const campaignId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await handleStartEmails(ctx, campaignId);
});

bot.callbackQuery(/^confirm_emails_(\d+)$/, async (ctx) => {
  const campaignId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await handleConfirmEmails(ctx, campaignId);
});

bot.callbackQuery(/^start_calls_(\d+)$/, async (ctx) => {
  const campaignId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await handleStartCalls(ctx, campaignId);
});

bot.callbackQuery(/^confirm_calls_(\d+)$/, async (ctx) => {
  const campaignId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await handleConfirmCalls(ctx, campaignId);
});

bot.callbackQuery("cancel_action", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Action cancelled.");
});
```

**Step 3: Commit**

```bash
git add src/bot/handlers/ src/index.ts
git commit -m "feat: add bot callback handlers for build, email, and call actions"
```

---

## Task 12: Status Command (Dashboard)

**Files:**
- Create: `src/bot/commands/status.ts`
- Modify: `src/index.ts`

**Step 1: Create /status command — src/bot/commands/status.ts**

```typescript
import { BotContext } from "../bot.js";
import { prisma } from "../../db/client.js";
import { InlineKeyboard } from "grammy";

export async function statusCommand(ctx: BotContext) {
  if (!ctx.from) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: ctx.from.id },
  });

  if (!user) {
    await ctx.reply("Please run /start first.");
    return;
  }

  const campaigns = await prisma.campaign.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { leads: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (campaigns.length === 0) {
    await ctx.reply("No campaigns yet. Use /start to create one.");
    return;
  }

  let message = "Your Campaigns:\n\n";

  for (const campaign of campaigns) {
    const leads = await prisma.lead.findMany({
      where: { campaignId: campaign.id },
    });

    const websitesBuilt = leads.filter(
      (l) => l.status !== "NEW"
    ).length;
    const emailed = leads.filter(
      (l) => l.status === "EMAILED" || l.status === "CALLED" || l.status === "RESPONDED"
    ).length;
    const called = leads.filter(
      (l) => l.status === "CALLED" || l.status === "RESPONDED"
    ).length;
    const responded = leads.filter(
      (l) => l.status === "RESPONDED"
    ).length;

    message +=
      `${campaign.niche} in ${campaign.city} [${campaign.status}]\n` +
      `  Leads: ${campaign._count.leads} | Sites: ${websitesBuilt} | ` +
      `Emails: ${emailed} | Calls: ${called} | Responses: ${responded}\n\n`;
  }

  const keyboard = new InlineKeyboard().text(
    "Create New Campaign",
    "new_campaign"
  );

  await ctx.reply(message, { reply_markup: keyboard });
}
```

**Step 2: Register in index.ts**

```typescript
import { statusCommand } from "./bot/commands/status.js";
bot.command("status", statusCommand);
```

**Step 3: Commit**

```bash
git add src/bot/commands/status.ts src/index.ts
git commit -m "feat: add /status command with campaign dashboard"
```

---

## Task 13: Webhook Server for SendGrid & Bland.ai

**Files:**
- Create: `src/webhooks/server.ts`
- Create: `src/webhooks/sendgridWebhook.ts`
- Create: `src/webhooks/blandWebhook.ts`
- Modify: `src/index.ts`

**Step 1: Create webhook server — src/webhooks/server.ts**

Uses Node.js built-in http module (no need for Express for 2 routes):

```typescript
import { createServer, IncomingMessage, ServerResponse } from "http";
import { handleSendGridWebhook } from "./sendgridWebhook.js";
import { handleBlandWebhook } from "./blandWebhook.js";

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function startWebhookServer(port: number) {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }

    const body = await parseBody(req);

    try {
      if (req.url === "/webhooks/sendgrid") {
        await handleSendGridWebhook(JSON.parse(body));
      } else if (req.url === "/webhooks/bland") {
        await handleBlandWebhook(JSON.parse(body));
      } else {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end("ok");
    } catch (err) {
      console.error("Webhook error:", err);
      res.writeHead(500);
      res.end("error");
    }
  });

  server.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
  });

  return server;
}
```

**Step 2: Create SendGrid webhook handler — src/webhooks/sendgridWebhook.ts**

```typescript
import { prisma } from "../db/client.js";

interface SendGridEvent {
  event: string;
  email: string;
  sg_message_id: string;
}

export async function handleSendGridWebhook(events: SendGridEvent[]) {
  for (const event of events) {
    const statusMap: Record<string, string> = {
      open: "OPENED",
      bounce: "BOUNCED",
    };

    const newStatus = statusMap[event.event];
    if (!newStatus) continue;

    // Find email by recipient address and update status
    const emails = await prisma.email.findMany({
      where: {
        lead: { ownerEmail: event.email },
        status: { not: "BOUNCED" },
      },
      orderBy: { sentAt: "desc" },
      take: 1,
    });

    if (emails.length > 0) {
      await prisma.email.update({
        where: { id: emails[0].id },
        data: { status: newStatus as any },
      });
    }
  }
}
```

**Step 3: Create Bland.ai webhook handler — src/webhooks/blandWebhook.ts**

```typescript
import { prisma } from "../db/client.js";
import { Bot } from "grammy";
import { BotContext } from "../bot/bot.js";

let botInstance: Bot<BotContext>;

export function setBlandWebhookBot(bot: Bot<BotContext>) {
  botInstance = bot;
}

interface BlandWebhookPayload {
  call_id: string;
  status: string;
  call_length?: number;
  transcripts?: Array<{ text: string; user: string }>;
  answered_by?: string;
}

export async function handleBlandWebhook(payload: BlandWebhookPayload) {
  const call = await prisma.call.findFirst({
    where: { blandCallId: payload.call_id },
    include: { lead: { include: { campaign: { include: { user: true } } } } },
  });

  if (!call) return;

  const transcript = payload.transcripts
    ?.map((t) => `${t.user}: ${t.text}`)
    .join("\n");

  let outcome: "INTERESTED" | "NOT_INTERESTED" | "VOICEMAIL" | "NO_ANSWER" =
    "NOT_INTERESTED";

  if (payload.answered_by === "voicemail") outcome = "VOICEMAIL";
  else if (payload.status === "no-answer") outcome = "NO_ANSWER";
  else if (
    transcript?.toLowerCase().includes("interested") ||
    transcript?.toLowerCase().includes("tell me more") ||
    transcript?.toLowerCase().includes("sounds good")
  ) {
    outcome = "INTERESTED";
  }

  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: "COMPLETED",
      duration: payload.call_length ?? null,
      transcript: transcript ?? null,
      outcome,
    },
  });

  if (outcome === "INTERESTED") {
    await prisma.lead.update({
      where: { id: call.leadId },
      data: { status: "RESPONDED" },
    });
  }

  // Notify user via Telegram
  if (botInstance) {
    const telegramId = call.lead.campaign.user.telegramId;
    const emoji =
      outcome === "INTERESTED"
        ? "HOT LEAD"
        : outcome === "VOICEMAIL"
          ? "Voicemail"
          : outcome === "NO_ANSWER"
            ? "No answer"
            : "Not interested";

    await botInstance.api.sendMessage(
      Number(telegramId),
      `Call result for ${call.lead.businessName}: ${emoji}\n` +
        (outcome === "INTERESTED"
          ? "They expressed interest! Follow up soon."
          : "")
    );
  }
}
```

**Step 4: Start webhook server in index.ts**

```typescript
import { startWebhookServer } from "./webhooks/server.js";
import { setBlandWebhookBot } from "./webhooks/blandWebhook.js";

// inside main(), after creating bot:
setBlandWebhookBot(bot);
startWebhookServer(3000);
```

**Step 5: Commit**

```bash
git add src/webhooks/ src/index.ts
git commit -m "feat: add webhook server for SendGrid and Bland.ai callbacks"
```

---

## Task 14: Wire Email-Find Completion to Email-Send

**Files:**
- Modify: `src/jobs/workers.ts`

**Step 1: Add email-find completion handler in workers.ts**

When email-find completes and found an email, automatically queue the first email:

```typescript
emailFindWorker.on("completed", async (job) => {
  if (!job) return;
  const result = job.returnvalue;
  if (result.email) {
    await emailSendQueue.add(`send-email-${job.data.leadId}-1`, {
      leadId: job.data.leadId,
      sequenceNumber: 1,
      telegramId: job.data.telegramId,
    });
  }
});
```

**Step 2: Add build completion notification**

```typescript
buildWorker.on("completed", async (job) => {
  if (!job) return;
  const { telegramId } = job.data;
  const result = job.returnvalue;
  await bot.api.sendMessage(
    telegramId,
    `Website built for lead #${result.leadId}: ${result.vercelUrl}`
  );
});
```

**Step 3: Commit**

```bash
git add src/jobs/workers.ts
git commit -m "feat: wire email-find completion to auto-queue first outreach email"
```

---

## Task 15: Final Integration & Testing

**Files:**
- Modify: `src/index.ts` (final wiring)
- Create: `.env` (from .env.example, with real keys)

**Step 1: Review full index.ts wiring**

Ensure all pieces are connected:
- Bot commands: `/start`, `/status`
- Callback queries: all campaign action handlers
- Conversation: `newCampaignConversation`
- Workers: all 6 queues with real processors
- Webhook server: running on port 3000

**Step 2: Start services**

```bash
docker compose up postgres redis -d
cp .env.example .env
# Fill in API keys in .env
npx prisma migrate dev
npm run dev
```

**Step 3: Manual integration test**

1. Send `/start` to bot
2. Create campaign: pick niche + city
3. Wait for scrape results
4. View leads
5. Build websites for leads
6. Start email campaign
7. Start calling
8. Check `/status`

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete integration of all modules"
```
