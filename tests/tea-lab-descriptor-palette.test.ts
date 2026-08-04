import { describe, expect, it } from "vitest";
import {
  findTeaDescriptor,
  TEA_DESCRIPTOR_CATEGORY_ORDER,
  TEA_DESCRIPTOR_PALETTE
} from "@/lib/tea-lab/descriptors";

describe("Tea Lab descriptor palette", () => {
  it("provides a broad, ordered vocabulary with unique stable identifiers", () => {
    expect(TEA_DESCRIPTOR_PALETTE).toHaveLength(81);
    expect(new Set(TEA_DESCRIPTOR_PALETTE.map(item => item.id)).size).toBe(81);
    expect(new Set(TEA_DESCRIPTOR_PALETTE.map(item => item.slug)).size).toBe(81);
    expect(TEA_DESCRIPTOR_PALETTE.map(item => item.position)).toEqual(
      Array.from({ length: 81 }, (_, index) => index + 1)
    );

    for (const category of TEA_DESCRIPTOR_CATEGORY_ORDER) {
      expect(TEA_DESCRIPTOR_PALETTE.some(item => item.category === category)).toBe(true);
    }
  });

  it("preserves every shipped descriptor ID", () => {
    for (let position = 1; position <= 12; position += 1) {
      expect(TEA_DESCRIPTOR_PALETTE[position - 1].id).toBe(
        `10000000-0000-4000-8000-${String(position).padStart(12, "0")}`
      );
    }
  });

  it("resolves canonical labels, slugs, and approachable search aliases", () => {
    expect(findTeaDescriptor("peach")?.label).toBe("Stone fruit");
    expect(findTeaDescriptor("drying-astringent")?.label).toBe("Drying / astringent");
    expect(findTeaDescriptor("nori")?.label).toBe("Seaweed");
    expect(findTeaDescriptor("sulfur")?.label).toBe("Sulphur");
    expect(findTeaDescriptor("unknown observation")).toBeNull();
  });
});
