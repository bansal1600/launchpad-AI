import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Acquisition, Alcohol, BusinessType, EntityType, FoodService, type BusinessProfile, type Plan, type ProfilePatch } from "@/lib/schemas";
import { applyPatch } from "@/lib/defaults";
import { buildPlan } from "@/lib/engine/buildPlan";
import { diffPlans, humanSummary, placeName } from "@/lib/engine/diff";
import { geocode } from "@/lib/services/geocode";
import { FIELD_LABELS, VALUE_LABELS } from "@/lib/defaults";
import { fmtDate } from "@/lib/dates";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** Events streamed to the browser, one JSON object per line. */
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "update"; profile: BusinessProfile; label: string }
  | { type: "status"; id: string; label: string; detail?: string; state: "active" | "done" | "error" }
  | { type: "mode"; mode: "anthropic" | "openai" | "local" }
  | { type: "error"; message: string }
  | { type: "done" };
type Emit = (e: ChatEvent) => void;
export type Turn = { role: "user" | "assistant"; text: string };

// What the model may change. Everything optional; the engine fills the rest.
export const PatchInput = z.object({
  businessName: z.string(),
  businessType: BusinessType,
  address: z.string().describe("Street address with city. Setting this re-detects who regulates the business."),
  foodService: FoodService.describe("none | prepackaged_only (wrapped/bottled items) | prepared_food (anything made or assembled on site)"),
  alcohol: Alcohol,
  acquisition: Acquisition.describe("second_generation = space previously used by the same kind of business; new_buildout = empty shell or a different prior use; change_of_ownership = buying an existing business"),
  entityType: EntityType,
  squareFeet: z.number(),
  seats: z.number(),
  employeesPlanned: z.number().describe("Staff besides the owner"),
  budgetUsd: z.number(),
  monthlyRentUsd: z.number(),
  targetOpenDate: z.string().describe("YYYY-MM-DD"),
  outdoorSeating: z.boolean(),
  exteriorSign: z.boolean(),
  groundFloor: z.boolean(),
  storefrontVacantMonths: z.number(),
}).partial().strict();

export const { $schema: _drop, ...inputSchema } = z.toJSONSchema(PatchInput) as Record<string, unknown>;
void _drop;

export const TOOL_NAME = "update_profile";
export const TOOL_DESCRIPTION = "Change facts about the owner's business. The rules engine then rebuilds the permit list, timeline, costs and incentives, and the owner sees the plan change on screen. Include only fields the owner stated or clearly implied. The result tells you exactly what changed.";

const TOOLS: Anthropic.Beta.BetaTool[] = [{
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  input_schema: inputSchema as Anthropic.Beta.BetaTool.InputSchema,
  eager_input_streaming: true,
}];

export const SYSTEM = `You are the chat inside Comply Cofounder, a planner for people opening a physical business (café, restaurant or retail boutique) in Santa Clara County, California. Most users are first-time owners.

The owner started with only a business type and an address. Every other detail is an assumption listed in the context. Your job is to have a natural conversation that fills in the details that matter, and to answer their questions.

How the plan works: a rules engine builds the plan (permits, order, timeline, costs, grants) from the profile. You never write plan facts yourself. When the owner tells you something about their business, call update_profile right away with those fields, then explain what changed using the tool result. You can call it several times in one turn.

Conversation:
- Ask about one thing at a time, starting with what changes permits most: whether they'll prepare food on site, whether they'll serve alcohol, and what the space was before (same kind of business, empty shell, or buying an existing business). Then size, rent, budget and target opening date.
- If an answer is ambiguous in a way that changes permits ("some food", "a bar area"), ask a short follow-up instead of guessing.
- Answer questions only from the plan in the context and from tool results. Quote numbers, dates and fees only from there. If something isn't covered, say so and suggest confirming with the agency.
- Use plain words. Name the concrete next step. Explain a government term the first time you use it.
- Write dates the way people say them ("Feb 26, 2027") and round money ("about $44K").
- Keep replies to 2-4 short sentences. The screen already shows the full checklist, timeline and cost chart, so don't repeat long lists.
- This is guidance, not legal advice.`;

export function planSnapshot(plan: Plan) {
  const p = plan.profile;
  return {
    location: placeName(plan),
    address: p.address.normalized ?? p.address.raw,
    profile: Object.fromEntries(Object.entries(p).filter(([k]) => !["id", "assumed", "jurisdiction", "address", "language", "planStartDate"].includes(k))),
    assumedNotConfirmed: p.assumed.map(k => FIELD_LABELS[k] ?? k),
    today: p.planStartDate,
    openingDate: plan.openDate,
    cost: plan.costs.total,
    monthlyRent: plan.costs.monthlyRent,
    steps: plan.items.map(i => ({ id: i.ruleId, name: i.plainName, officialName: i.name, agency: i.agency, phase: i.phase, days: i.durationDays, fee: i.fee, feeNote: i.feeNote, setsOpeningDate: i.isCriticalPath, starts: i.startDay, why: i.shortDescription, firstStep: i.whatToDo[0], source: i.sourceUrl, verified: i.verified })),
    costsByLine: plan.costs.lines.map(l => ({ label: l.label, category: l.category, typical: l.typical })),
    incentives: plan.incentives.map(i => ({ name: i.name, match: i.match, reason: i.reason })),
  };
}

/** Apply a patch the way the app does: geocode if the address moved, rebuild, diff. */
export async function applyToProfile(profile: BusinessProfile, patch: ProfilePatch) {
  let next = applyPatch(profile, patch);
  if (patch.address && patch.address.raw !== profile.address.raw) {
    const g = await geocode(patch.address.raw);
    if (!g.ok) return { error: g.error };
    next = { ...next, address: { raw: patch.address.raw, normalized: g.normalized, lat: g.lat, lng: g.lng }, jurisdiction: g.jurisdiction };
  }
  const before = buildPlan(profile), after = buildPlan(next);
  return { profile: next, plan: after, diff: diffPlans(before, after) };
}

export function labelFor(patch: ProfilePatch) {
  const k = Object.keys(patch);
  const names = k.map(x => (FIELD_LABELS[x] ?? x).toLowerCase());
  return names.length ? `Updated ${names.slice(0, 2).join(" & ")}${names.length > 2 ? ` +${names.length - 2}` : ""}` : "Update";
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Describe a patch in plain words, e.g. "Alcohol: Beer & wine · Size: 1,500 sq ft". */
function describePatch(patch: ProfilePatch) {
  return Object.entries(patch).map(([k, v]) => {
    const val = k === "address" ? (v as { raw: string }).raw : VALUE_LABELS[k]?.[String(v)] ?? (typeof v === "boolean" ? (v ? "yes" : "no") : k.endsWith("Usd") ? `$${Number(v).toLocaleString()}` : k === "squareFeet" ? `${Number(v).toLocaleString()} sq ft` : k === "targetOpenDate" ? fmtDate(String(v)) : String(v));
    return `${FIELD_LABELS[k] ?? k}: ${val}`;
  }).join(" · ");
}

/**
 * Run one update_profile call: validate, apply, rebuild. Shared by every model provider.
 * Streams each planning step as a "status" event so the owner sees the plan being rebuilt.
 */
export async function executeUpdate(profile: BusinessProfile, rawInput: unknown, emit: Emit): Promise<{ profile: BusinessProfile; content: string; isError: boolean }> {
  const parsed = PatchInput.safeParse(rawInput);
  if (!parsed.success) return { profile, isError: true, content: JSON.stringify({ INVALID_INPUT: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`) }) };
  const { address, ...rest } = parsed.data;
  const patch: ProfilePatch = { ...rest, ...(address ? { address: { raw: address } } : {}) };
  const step = async (id: string, label: string, detail?: string) => { emit({ type: "status", id, label, state: "active" }); await pause(180); return (d?: string, state: "done" | "error" = "done") => emit({ type: "status", id, label, detail: d ?? detail, state }); };

  const s1 = await step("details", "Updating your business details");
  s1(describePatch(patch));
  let geo: ((d?: string, st?: "done" | "error") => void) | null = null;
  if (address) geo = await step("where", `Finding who regulates ${address}`);
  const r = await applyToProfile(profile, patch);
  if ("error" in r) { geo?.(r.error, "error"); return { profile, isError: true, content: r.error ?? "Couldn't apply that change." }; }
  geo?.(`Regulated by ${placeName(r.plan)}`);
  const d = r.diff;
  const permits = r.plan.items.filter(i => i.level !== "work").length;
  (await step("rules", "Checking city, county and state rules"))(`${permits} steps${d.added.length ? ` · ${d.added.length} new` : ""}${d.removed.length ? ` · ${d.removed.length} no longer needed` : ""}`);
  (await step("schedule", "Rescheduling your timeline"))(d.openDeltaDays ? `Opening moves ${d.openDeltaDays > 0 ? "later" : "earlier"} by ${Math.abs(d.openDeltaDays)} days` : "Opening date unchanged");
  (await step("costs", "Recalculating startup costs"))(Math.round(d.costDelta) ? `${d.costDelta > 0 ? "+" : "−"}$${Math.abs(Math.round(d.costDelta)).toLocaleString()} typical` : "No cost change");
  (await step("grants", "Checking grants and free help"))(d.gained.length || d.lost.length ? [...d.gained.map(i => `+ ${i.name}`), ...d.lost.map(i => `− ${i.name}`)].join(" · ") : "No change");

  emit({ type: "update", profile: r.profile, label: labelFor(patch) });
  return { profile: r.profile, isError: false, content: JSON.stringify({
    applied: parsed.data,
    whatChanged: humanSummary(d),
    newSteps: d.added.map(i => i.plainName), removedSteps: d.removed.map(i => i.plainName),
    jurisdiction: d.jurisdiction, incentivesGained: d.gained.map(i => i.name), incentivesLost: d.lost.map(i => i.name),
    plan: planSnapshot(r.plan),
  }) };
}

export const contextBlock = (profile: BusinessProfile) => `<current_plan>\n${JSON.stringify(planSnapshot(buildPlan(profile)))}\n</current_plan>\n\n`;

/** Which model runs the chat: CHAT_PROVIDER wins, else whichever key is set (Anthropic first), else the offline parser. */
export function chatProvider(): "anthropic" | "openai" | "local" {
  if (process.env.COMPLY_LOCAL_ONLY === "1") return "local";
  const forced = process.env.CHAT_PROVIDER;
  if (forced === "anthropic" || forced === "openai" || forced === "local") return forced;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "local";
}

export async function runClaudeChat(message: string, history: Turn[], startProfile: BusinessProfile, emit: Emit) {
  const client = new Anthropic();
  let profile = startProfile;
  const context = contextBlock(profile);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-20).map(t => ({ role: t.role, content: t.text })),
    { role: "user", content: context + message },
  ];
  // Anthropic requires the first message to be from the user.
  while (messages.length && messages[0].role !== "user") messages.shift();

  let jsonRetries = 0;
  emit({ type: "status", id: "read", label: "Reading your message", state: "active" });
  let readDone = false;
  for (let round = 0; round < 6; round++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    stream.on("text", delta => { if (!readDone) { readDone = true; emit({ type: "status", id: "read", label: "Reading your message", state: "done" }); } emit({ type: "text", delta }); });
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue; // tool input wasn't parseable JSON; re-issue the turn
    }
    if (msg.stop_reason === "refusal") { emit({ type: "text", delta: "\n\nI can't help with that one. Ask me anything about opening your business." }); return; }
    const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!calls.length || msg.stop_reason === "end_turn") return;
    if (msg.stop_reason === "max_tokens") throw new Error("Reply was cut off. Try asking again.");
    if (!readDone) { readDone = true; emit({ type: "status", id: "read", label: "Reading your message", detail: "Found details to update", state: "done" }); }

    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const r = await executeUpdate(profile, call.input, emit);
      profile = r.profile;
      results.push({ type: "tool_result", tool_use_id: call.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
}
