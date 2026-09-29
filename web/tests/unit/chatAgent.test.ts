import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PatchInput, planSnapshot } from "@/lib/llm/chatAgent";
import { buildPlan } from "@/lib/engine/buildPlan";
import { completeProfile } from "@/lib/defaults";
import { z } from "zod";

describe("chat agent tool", () => {
  it("accepts a partial patch and rejects unknown fields", () => {
    expect(PatchInput.safeParse({ alcohol: "beer_wine", squareFeet: 1500 }).success).toBe(true);
    expect(PatchInput.safeParse({ alcohol: "lots" }).success).toBe(false);
    expect(PatchInput.safeParse({ jurisdiction: "x" }).success).toBe(false);
  });
  it("tool schema is a plain JSON object schema", () => {
    const s = z.toJSONSchema(PatchInput) as Record<string, unknown>;
    expect(s.type).toBe("object");
    expect(s.additionalProperties).toBe(false);
  });
  it("snapshot lists assumptions and steps for grounding", () => {
    const p = { ...completeProfile({ businessType: "cafe", address: { raw: "x" } }, "id"), jurisdiction: { kind: "city" as const, cityId: "san_jose", cityName: "San José", county: "santa_clara", supported: true } };
    const snap = planSnapshot(buildPlan(p));
    expect(snap.assumedNotConfirmed).toContain("Food");
    expect(snap.steps.length).toBeGreaterThan(5);
  });
});
