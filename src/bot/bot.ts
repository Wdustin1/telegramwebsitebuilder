import { Bot, Context, session } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";
import { env } from "../config/env.js";
import { SessionData, initialSession } from "./session.js";
import { newCampaignConversation } from "./conversations/newCampaign.js";

export type BotContext = Context & ConversationFlavor<Context> & { session: SessionData };
export type BotConversation = Conversation<BotContext, BotContext>;

export function createBot() {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

  bot.use(
    session({
      initial: initialSession,
    })
  );
  bot.use(conversations());
  bot.use(createConversation(newCampaignConversation));

  return bot;
}
