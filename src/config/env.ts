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
