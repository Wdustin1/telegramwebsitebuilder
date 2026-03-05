import { env } from "../config/env.js";

const url = new URL(env.REDIS_URL);

export const redisConnection = {
  host: url.hostname,
  port: parseInt(url.port || "6379"),
  maxRetriesPerRequest: null,
};
