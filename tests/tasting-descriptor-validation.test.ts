import { describe, expect, it } from "vitest";
import { soloSessionSaveSchema } from "@/lib/tea-lab/validation";
import { responseSchema } from "@/lib/validation";

const ids = Array.from({ length: 6 }, (_, index) =>
  `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);

describe("tasting descriptor validation", () => {
  it("accepts five live-tasting flavours and rejects a sixth", () => {
    const base = {
      flightItemId: ids[0],
      firstImpression: null,
      intensity: "clear" as const,
      rating: 4,
      personalNotes: null
    };

    expect(responseSchema.safeParse({ ...base, descriptors: ["Sweet", "Floral", "Nutty", "Citrus", "Mineral"] }).success).toBe(true);
    expect(responseSchema.safeParse({ ...base, descriptors: ["Sweet", "Floral", "Nutty", "Citrus", "Mineral", "Woody"] }).success).toBe(false);
  });

  it("accepts five Tea Lab flavours and rejects a sixth", () => {
    const payload = {
      operationId: ids[0],
      cardId: ids[1],
      expectedRevision: 0,
      tea: { kind: "canonical" as const, canonicalTeaId: ids[2] },
      tasting: {
        firstImpression: null,
        descriptorIds: ids.slice(0, 5),
        intensity: "clear" as const,
        rating: 4,
        personalNotes: null
      }
    };

    expect(soloSessionSaveSchema.safeParse(payload).success).toBe(true);
    expect(soloSessionSaveSchema.safeParse({
      ...payload,
      tasting: { ...payload.tasting, descriptorIds: ids }
    }).success).toBe(false);
  });
});
