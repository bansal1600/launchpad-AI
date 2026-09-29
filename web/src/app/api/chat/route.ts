import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { chatProvider, executeUpdate, runClaudeChat, type ChatEvent, type Turn } from "@/lib/llm/chatAgent";
import { OPENAI_MODEL, runOpenAIChat } from "@/lib/llm/openaiChat";
import { localChat } from "@/lib/localParser";
import { buildPlan } from "@/lib/engine/buildPlan";
import { nextQuestion } from "@/lib/nextQuestion";
import type { BusinessProfile } from "@/lib/schemas";

type Body = { message: string; history?: Turn[]; profile: BusinessProfile };

/** Streams NDJSON ChatEvents: text deltas as Claude writes, and an "update" each time the plan changes. */
export async function POST(req: Request) {
  const { message, history = [], profile } = (await req.json()) as Body;
  if (!message?.trim() || !profile) return Response.json({ error: "Missing message or profile." }, { status: 400 });

  const body = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (e: ChatEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const provider = chatProvider();
      emit({ type: "mode", mode: provider });
      try {
        if (provider === "anthropic") await runClaudeChat(message, history, profile, emit);
        else if (provider === "openai") await runOpenAIChat(message, history, profile, emit);
        else await runLocal(message, profile, emit);
      } catch (e) {
        console.error(`chat (${provider}) failed:`, e instanceof Error ? e.message : e);
        emit({ type: "error", message: friendlyError(e) });
      }
      emit({ type: "done" });
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

/** Offline stand-in: keyword parsing, same event protocol and planning trace. */
async function runLocal(message: string, profile: BusinessProfile, emit: (e: ChatEvent) => void) {
  const plan = buildPlan(profile);
  const r = localChat(message, plan);
  if (r.action === "clarify" && r.clarification) { emit({ type: "text", delta: r.clarification.question }); return; }
  if (r.action === "answer") { emit({ type: "text", delta: r.reply }); return; }
  const { address, ...rest } = r.patch;
  const out = await executeUpdate(profile, { ...rest, ...(address ? { address: address.raw } : {}) }, emit);
  if (out.isError) { emit({ type: "text", delta: "I couldn't apply that. Try rephrasing it." }); return; }
  const q = nextQuestion(out.profile);
  emit({ type: "text", delta: `Done, your plan is updated.${q ? ` ${q}` : ""}` });
}

function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError || e instanceof OpenAI.AuthenticationError) return "The API key was rejected. Check the key in web/.env.local and restart the dev server.";
  if (e instanceof OpenAI.NotFoundError) return `Your OpenAI account can't use the model "${OPENAI_MODEL}". Set OPENAI_MODEL in web/.env.local to one you have access to.`;
  if (e instanceof Anthropic.RateLimitError || e instanceof OpenAI.RateLimitError) return "The assistant is busy or out of quota right now. Try again in a moment.";
  if (e instanceof Anthropic.APIError || e instanceof OpenAI.APIError) return "The assistant had a problem answering. Try again.";
  return (e as Error)?.message || "Something went wrong.";
}
