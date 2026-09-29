import "server-only";
import OpenAI from "openai";
import type { BusinessProfile } from "@/lib/schemas";
import { contextBlock, executeUpdate, inputSchema, SYSTEM, TOOL_DESCRIPTION, TOOL_NAME, type ChatEvent, type Turn } from "@/lib/llm/chatAgent";

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
  type: "function",
  function: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: inputSchema },
}];

/** Same conversation loop as the Claude path: stream text, run update_profile calls, feed results back. */
export async function runOpenAIChat(message: string, history: Turn[], startProfile: BusinessProfile, emit: (e: ChatEvent) => void) {
  const client = new OpenAI();
  let profile = startProfile;
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    ...history.slice(-20).map(t => ({ role: t.role, content: t.text })),
    { role: "user", content: contextBlock(profile) + message },
  ];

  emit({ type: "status", id: "read", label: "Reading your message", state: "active" });
  for (let round = 0; round < 6; round++) {
    const stream = await client.chat.completions.create({ model: OPENAI_MODEL, messages, tools: TOOLS, stream: true });
    let text = "";
    let finish: string | null = null;
    const calls: { id: string; name: string; args: string }[] = [];
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const d = choice.delta;
      if (d?.content) { if (!text && round === 0) emit({ type: "status", id: "read", label: "Reading your message", state: "done" }); text += d.content; emit({ type: "text", delta: d.content }); }
      for (const tc of d?.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    if (finish === "length") throw new Error("Reply was cut off. Try asking again.");
    if (finish === "content_filter") { emit({ type: "text", delta: "\n\nI can't help with that one. Ask me anything about opening your business." }); return; }
    if (!calls.length) return;
    if (round === 0 && !text) emit({ type: "status", id: "read", label: "Reading your message", detail: "Found details to update", state: "done" });

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map(c => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args } })),
    });
    for (const c of calls) {
      let input: unknown;
      try { input = JSON.parse(c.args || "{}"); } catch { input = { __unparseable: c.args }; }
      const r = c.name === TOOL_NAME ? await executeUpdate(profile, input, emit) : { profile, content: `Unknown tool ${c.name}`, isError: true };
      profile = r.profile;
      messages.push({ role: "tool", tool_call_id: c.id, content: r.isError ? `ERROR: ${r.content}` : r.content });
    }
  }
}
