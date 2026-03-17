# Telegram Website Builder Bot

A Telegram bot that automates a local business website outreach pipeline: find businesses without websites → generate a professional site → send email + make an AI phone call to offer your services.

Built with TypeScript, grammY, Prisma, and a stack of third-party APIs for scraping, AI generation, email, and voice calls.

---

## What It Does

**3-step pipeline, fully automated via Telegram:**

1. **Find** — Searches Outscraper for local businesses matching your target (e.g. "plumbers in Austin") and filters out those that already have websites
2. **Build** — Uses Claude/OpenAI to generate a professional HTML website for each lead, deploys it to Vercel
3. **Outreach** — Sends a cold email via SendGrid with the live site link, then makes an AI phone call via Bland.ai during business hours to pitch your services

Campaigns run as background jobs. Status updates stream to Telegram as they process.

---

## Tech Stack

- **[grammY](https://grammy.dev/)** — Telegram bot framework
- **Prisma** + PostgreSQL — campaign and lead persistence
- **[Outscraper](https://outscraper.com/)** — local business search + contact scraping
- **Anthropic Claude / OpenAI** — website HTML generation
- **[Vercel API](https://vercel.com/docs/rest-api)** — auto-deploy generated sites
- **[Hunter.io](https://hunter.io/)** — email verification
- **[SendGrid](https://sendgrid.com/)** — transactional email
- **[Bland.ai](https://bland.ai/)** — AI voice calls
- **BullMQ** + Redis — background job queue
- **Docker** — containerized deployment

---

## Architecture

```
Telegram Bot (grammY)
    │
    ├── /start → new campaign wizard
    ├── Campaign actions (find / build / outreach)
    │
    └── Job Queue (BullMQ + Redis)
            │
            ├── Find Worker → Outscraper → filter → save leads
            ├── Build Worker → AI generate HTML → Vercel deploy
            └── Outreach Worker → SendGrid email + Bland.ai call
                                   (business hours enforced)
```

Webhook server runs alongside the bot to receive SendGrid delivery events and Bland.ai call completion callbacks.

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis
- Telegram bot token ([BotFather](https://t.me/botfather))
- Accounts for: Outscraper, Vercel, SendGrid, Bland.ai, Hunter.io

### Install

```bash
git clone https://github.com/Wdustin1/telegramwebsitebuilder.git
cd telegramwebsitebuilder
npm install
```

### Configure

```bash
cp .env.example .env
# Fill in all values
```

### Database

```bash
npx prisma migrate deploy
```

### Run

```bash
npm run dev       # Development
npm run build && npm start  # Production
```

### Docker

```bash
docker-compose up
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `OUTSCRAPER_API_KEY` | Business search + scraping |
| `OPENAI_API_KEY` | Website HTML generation |
| `VERCEL_API_TOKEN` | Auto-deploy generated sites |
| `HUNTER_API_KEY` | Email verification |
| `SENDGRID_API_KEY` | Cold email delivery |
| `BLAND_API_KEY` | AI voice calls |
| `WEBHOOK_BASE_URL` | Public URL for webhook callbacks |
| `CALL_TIMEZONE` | Business hours timezone (default: `America/New_York`) |

---

## License

MIT
