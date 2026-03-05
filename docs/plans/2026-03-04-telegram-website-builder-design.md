# Telegram Website Builder Bot — Design Document

## Overview

A Telegram bot that automates the sales pipeline for local home service businesses. Users pick a niche and city, and the bot finds businesses without websites, builds websites for them, sends cold email outreach, and makes AI-powered voice calls — all autonomously with confirmation gates.

## Stack

- **Runtime:** Node.js + TypeScript
- **Bot Framework:** grammY + conversations plugin
- **Database:** PostgreSQL via Prisma ORM
- **Job Queue:** BullMQ + Redis
- **Deployment:** Docker Compose on VPS
- **External APIs:** Outscraper, OpenAI, Vercel, Hunter.io, SendGrid, Bland.ai

## Architecture

Monolith with modular internal structure. Single Node.js process runs the bot and BullMQ workers. PostgreSQL and Redis run as separate Docker containers via Docker Compose.

```
telegramwebsitebuilder/
├── src/
│   ├── bot/           # grammY bot, commands, conversations, menus
│   ├── modules/
│   │   ├── find/      # Outscraper lead scraping
│   │   ├── build/     # OpenAI website generation + Vercel deploy
│   │   ├── email/     # Hunter.io lookup + SendGrid outreach
│   │   └── call/      # Bland.ai voice calls
│   ├── jobs/          # BullMQ queue definitions & workers
│   ├── db/            # Prisma schema, migrations, queries
│   └── config/        # Environment config, constants
├── templates/         # HTML website templates for lead sites
├── docker-compose.yml
├── prisma/
│   └── schema.prisma
├── package.json
└── tsconfig.json
```

## Database Schema

### Users
- id, telegram_id (unique), username, created_at

### Campaigns
- id, user_id → Users, niche, city, status (scraping | ready | in_progress | completed), created_at

### Leads
- id, campaign_id → Campaigns, business_name, phone, address, has_website, owner_email (nullable), status (new | website_built | emailed | called | responded), created_at

### Websites
- id, lead_id → Leads, vercel_url, html_content, deployed_at

### Emails
- id, lead_id → Leads, subject, body, status (queued | sent | opened | replied | bounced), sequence_number (1-3), sent_at

### Calls
- id, lead_id → Leads, bland_call_id, status (queued | in_progress | completed | failed), duration, transcript (nullable), outcome (interested | not_interested | voicemail | no_answer), called_at

## Bot Conversation Flow

1. `/start` → Welcome message → "Create a new campaign" button
2. User picks niche (inline keyboard) → picks city (text input)
3. Bot confirms → scraping job queued
4. Results: "Found X leads without websites"
5. User triggers actions via inline keyboard: View Leads, Build Websites, Start Email Campaign, Start Calling
6. Each action has a confirmation gate before execution
7. Bot sends progress updates and results back to user
8. `/status` → dashboard summary of all campaigns

## Background Jobs

| Queue | Purpose | Concurrency | Notes |
|-------|---------|-------------|-------|
| scrape | Outscraper API per campaign | 1 | API rate limits |
| build | OpenAI + Vercel deploy per lead | 3 | Parallel builds |
| email-find | Hunter.io lookup per lead | 5 | Hunter rate limits |
| email-send | SendGrid send per lead | 10/min | Deliverability |
| email-followup | Follow-ups at day 3, day 7 | 10/min | Delayed jobs |
| call | Bland.ai call per lead | 1 | Business hours only |

- Failed jobs retry 3 times with exponential backoff
- Job completion/failure triggers Telegram notification to user

## Website Generation

1. Pull lead data (business name, niche, city, phone, address)
2. Use niche-specific base HTML/CSS template from `templates/`
3. Send prompt to OpenAI to generate copy for the template slots
4. Inject AI-generated copy into template
5. Deploy as static site to Vercel via API
6. Store Vercel URL in Websites table

Templates are vanilla HTML/CSS, mobile responsive, no JS frameworks. 2-3 base layouts per niche.

## Email Outreach Sequence

**Email finding:** Hunter.io lookup per lead. Leads without emails are skipped for email but still eligible for calls.

| Email | Timing | Purpose |
|-------|--------|---------|
| #1 | Immediately | Introduction with live website link |
| #2 | Day 3 | Follow-up |
| #3 | Day 7 | Final touch |

- SendGrid webhooks track opens, clicks, bounces, replies
- Reply triggers immediate Telegram notification to user
- Bounce stops sequence for that lead
- Unsubscribe link included (CAN-SPAM compliance)

## AI Voice Calls

- Bland.ai API with conversational prompt (not rigid script)
- Prompt includes business name, niche, city, and live website URL
- Webhook returns transcript + outcome on completion
- Outcomes: interested, not_interested, voicemail, no_answer, failed
- Voicemail retries once, no_answer retries up to 2 times
- Calls only between 9am-5pm in lead's local timezone
- One concurrent call at a time

## Key Design Decisions

- **One central bot with per-user sessions** (not multi-tenant bot tokens)
- **Semi-automated with confirmation gates** at each pipeline step
- **Monolith architecture** — simplest path to working product, can decompose later
- **Website built before outreach** — pitch includes a live URL, not a hypothetical
