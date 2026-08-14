"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

interface DispatchResult {
  id: Id<"signals">;
  message: string;
  status: "SENT" | "FAILED" | "SIMULATED";
  dispatchMode: "telegram" | "simulated";
  telegramMessageId?: number;
}

/**
 * Live Telegram signal dispatch.
 *
 * Builds the exact dispatch line and sends it to the configured Telegram
 * channel via the Bot API (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env
 * vars). The signal is always persisted to the Convex `signals` table; when
 * the bot is not configured the row is stored as `SIMULATED` so the feed
 * still works end to end.
 */
export const dispatchSignal = action({
  args: {
    bias: v.union(v.literal("LONG"), v.literal("SHORT")),
    asset: v.string(),
    tf: v.string(),
    entry: v.string(),
    sl: v.string(),
    tp1: v.string(),
    tp2: v.string(),
    confluence: v.string(),
    tier: v.string(),
    rr: v.string(),
  },
  handler: async (ctx, args): Promise<DispatchResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");

    const message = [
      `${args.bias === "LONG" ? "🟢 LONG" : "🔴 SHORT"} · ${args.asset} · ${args.tf}`,
      `Entry: ${args.entry}`,
      `SL: ${args.sl}`,
      `TP1: ${args.tp1}`,
      `TP2: ${args.tp2}`,
      `${args.confluence}`,
      `${args.tier} Tier`,
      `R:R ${args.rr}`,
    ].join(" | ");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    let status: "SENT" | "FAILED" | "SIMULATED" = "SIMULATED";
    let dispatchMode: "telegram" | "simulated" = "simulated";
    let telegramMessageId: number | undefined;

    if (token && chatId) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: message }),
          },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          result?: { message_id?: number };
        };
        if (data?.ok) {
          status = "SENT";
          dispatchMode = "telegram";
          telegramMessageId = data.result?.message_id;
        } else {
          status = "FAILED";
        }
      } catch {
        status = "FAILED";
      }
    }

    const id: Id<"signals"> = await ctx.runMutation(internal.signals.insert, {
      userId,
      ...args,
      message,
      status,
      dispatchMode,
      telegramMessageId,
    });

    return { id, message, status, dispatchMode, telegramMessageId };
  },
});
