import { describe, expect, it } from "vitest";
import { savedTeaSchema } from "@/lib/validation";

describe("guest recap saved teas", () => {
  it("accepts an explicit idempotent saved state", () => {
    expect(savedTeaSchema.safeParse({
      flightItemId: "00000000-0000-4000-8000-000000000001",
      saved: true
    }).success).toBe(true);
    expect(savedTeaSchema.safeParse({
      flightItemId: "00000000-0000-4000-8000-000000000001",
      saved: false
    }).success).toBe(true);
  });

  it("rejects missing, ambiguous or invalid saved-tea changes", () => {
    expect(savedTeaSchema.safeParse({ flightItemId: "tea-1", saved: true }).success).toBe(false);
    expect(savedTeaSchema.safeParse({ flightItemId: "00000000-0000-4000-8000-000000000001" }).success).toBe(false);
    expect(savedTeaSchema.safeParse({ flightItemId: "00000000-0000-4000-8000-000000000001", saved: "yes" }).success).toBe(false);
  });
});
