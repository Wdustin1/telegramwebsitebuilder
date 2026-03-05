# Telegram Website Builder - Build Plan

## Execution Strategy

Tasks are grouped into phases based on dependencies. Within each phase, independent tasks run in parallel via subagents.

### Phase 1: Foundation (sequential - everything depends on this)
- [x] **Task 1**: Project Scaffolding — package.json, tsconfig, .env.example, .gitignore, src/config/env.ts, src/index.ts

### Phase 2: Infrastructure (parallel - all depend only on Task 1)
- [x] **Task 2**: Docker Compose Setup — docker-compose.yml, Dockerfile
- [x] **Task 3**: Prisma Schema & Database — schema.prisma, db/client.ts
- [x] **Task 6**: BullMQ Queue Infrastructure — connection.ts, queues.ts, workers.ts stubs

### Phase 3: Bot Core (sequential - depends on Phase 2)
- [x] **Task 4**: Bot Skeleton with Sessions — bot.ts, session.ts, commands/start.ts, wire index.ts
- [x] **Task 5**: Campaign Creation Conversation — conversations/newCampaign.ts

### Phase 4: Modules (parallel - depend on Tasks 3 + 6)
- [x] **Task 7**: Find Module (Outscraper) — outscraper.ts, scrapeProcessor.ts
- [x] **Task 8**: Build Module (OpenAI + Vercel) — generateHtml.ts, deployVercel.ts, buildProcessor.ts, templates/home-service.html
- [x] **Task 9**: Email Module (Hunter.io + SendGrid) — hunterLookup.ts, sendEmail.ts, emailProcessor.ts, emailTemplates.ts
- [x] **Task 10**: Call Module (Bland.ai) — blandClient.ts, callProcessor.ts

### Phase 5: Bot Handlers & Integration (parallel where possible)
- [x] **Task 11**: Bot Action Handlers — handlers/campaignActions.ts, wire callbacks in index.ts
- [x] **Task 12**: Status Command — commands/status.ts
- [x] **Task 13**: Webhook Server — server.ts, sendgridWebhook.ts, blandWebhook.ts

### Phase 6: Final Wiring (sequential)
- [x] **Task 14**: Wire Email-Find Completion to Email-Send — workers.ts event handlers
- [x] **Task 15**: Final Integration & Testing — review all wiring, verify everything connects

---

## Review

### Summary
All 15 tasks completed. The entire Telegram Website Builder bot has been built from scratch.

### Adaptations from original plan
- **Prisma v7**: The installed version (7.x) uses driver adapters instead of the old direct-URL PrismaClient. `src/db/client.ts` uses `@prisma/adapter-pg` with `PrismaPg`. Generated client goes to `src/generated/prisma/`.
- **ioredis removed**: Standalone `ioredis` caused version conflicts with BullMQ's bundled copy. Replaced with plain connection config object (host/port) that BullMQ instantiates internally.
- **ConversationFlavor type**: grammY conversations v2 requires explicit type parameter; used `ConversationFlavor<Context>` to avoid circular type reference.

### Verification
- `tsc --noEmit` passes with zero errors
- All 38 source files match the design doc's architecture
- Full pipeline wired: bot commands -> conversations -> queue jobs -> workers -> webhook callbacks -> Telegram notifications
