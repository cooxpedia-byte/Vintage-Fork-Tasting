import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BrewStep, ReviewStep, TasteStep, TeaLabProgress, TeaLabWorkspace, teaLabDraftTeaName } from "@/components/tea-lab/TeaLabWorkspace";
import { FlavorDescriptorPicker, flavorWheelIndex, flavorWheelRotation } from "@/components/tea-lab/FlavorDescriptorPicker";
import { TEA_DESCRIPTOR_PALETTE } from "@/lib/tea-lab/descriptors";
import { createDefaultTeaLabBrewStages } from "@/lib/tea-lab/brewing";
import { createSoloTeaDraft } from "@/lib/tea-lab/offline";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("Tea Lab workspace", () => {
  it("shows the selected catalogue tea name instead of a generic label", () => {
    const draft = {
      ...createSoloTeaDraft("owner-1", (() => {
        const ids = ["session-1", "card-1"];
        return () => ids.shift() ?? "unused";
      })()),
      tea: { kind: "canonical" as const, canonicalTeaId: "tea-1" }
    };
    const options = [{
      key: "canonical:tea-1",
      name: "Jin Mei",
      producer: null,
      origin: "Fujian",
      teaType: "Black",
      defaultSteepSeconds: 180,
      saved: false,
      selection: { kind: "canonical" as const, canonicalTeaId: "tea-1" }
    }];

    expect(teaLabDraftTeaName(draft, options)).toBe("Jin Mei");
  });

  it("renders the landing action and a resumable private draft without live-event navigation", () => {
    const draft = {
      ...createSoloTeaDraft("owner-1", (() => {
        const ids = ["session-1", "card-1"];
        return () => ids.shift() ?? "unused";
      })(), () => "2026-08-03T12:00:00.000Z"),
      status: "in_progress" as const,
      tea: { kind: "personal" as const, personalTeaId: "personal-1", name: "Moonlight White" }
    };

    const html = renderToStaticMarkup(createElement(TeaLabWorkspace, {
      ownerUserId: "owner-1",
      name: "Alex",
      teaOptions: [],
      descriptorOptions: [],
      serverDrafts: [draft],
      onOpenJournal: vi.fn()
    }));

    expect(html).toContain("Tea Lab");
    expect(html).toContain("Create a Tasting Session");
    expect(html).toContain("Continue a draft");
    expect(html).toContain("Moonlight White");
    expect(html).not.toContain("Next at the table");
    expect(html).not.toContain("/event/");
  });

  it("renders a roving-tabindex rating group for keyboard and screen-reader use", () => {
    const draft = {
      ...createSoloTeaDraft("owner-1", (() => {
        const ids = ["session-1", "card-1"];
        return () => ids.shift() ?? "unused";
      })()),
      tasting: {
        firstImpression: "Soft",
        descriptorIds: [],
        intensity: "clear" as const,
        rating: 3,
        personalNotes: "Private"
      }
    };

    const html = renderToStaticMarkup(createElement(TasteStep, {
      draft,
      descriptors: [],
      update: vi.fn(),
      back: vi.fn(),
      next: vi.fn(),
      preparePhotoCard: vi.fn(async () => undefined),
      onPhotoBusyChange: vi.fn()
    }));

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('data-rating="3" tabindex="0"');
    expect(html).toContain('data-rating="2" tabindex="-1"');
    expect(html).toContain('role="radio" aria-checked="true"');
    expect(html).toContain("Photos of this tasting");
    expect(html).toContain("Take photo");
    expect(html).toContain('capture="environment"');
    expect(html).toContain("Add from library");
  });

  it("makes page-three review an explicit save action with a busy state", () => {
    const draft = {
      ...createSoloTeaDraft("owner-1", (() => {
        const ids = ["session-1", "card-1"];
        return () => ids.shift() ?? "unused";
      })()),
      tasting: {
        firstImpression: "Sweet",
        descriptorIds: [],
        intensity: "clear" as const,
        rating: 4,
        personalNotes: null
      }
    };
    const shared = { draft, descriptors: [], update: vi.fn(), back: vi.fn(), next: vi.fn() };

    const readyHtml = renderToStaticMarkup(createElement(TasteStep, shared));
    const savingHtml = renderToStaticMarkup(createElement(TasteStep, { ...shared, reviewing: true }));

    expect(readyHtml).toContain("Save &amp; Review");
    expect(savingHtml).toMatch(/<button class="btn btn-primary btn-attention" type="button" disabled="">Saving…<\/button>/);
  });

  it("renders visited progress steps as edit buttons and locks unvisited steps", () => {
    const html = renderToStaticMarkup(createElement(TeaLabProgress, {
      step: "brew",
      furthestStep: "taste",
      onNavigate: vi.fn()
    }));

    expect(html).toContain('aria-label="Edit Tea step"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-label="Brew, current step"');
    expect(html).toContain('aria-label="Edit Taste step"');
    expect(html).toContain('aria-label="Review step, complete earlier steps first" disabled=""');
  });

  it("renders a rotary category picker, drop zone, and five-choice focus", () => {
    const options = TEA_DESCRIPTOR_PALETTE.map(({ id, label, category, aliases }) => ({ id, label, category, aliases }));
    const html = renderToStaticMarkup(createElement(FlavorDescriptorPicker, {
      options,
      selectedIds: [TEA_DESCRIPTOR_PALETTE[4].id],
      onToggle: vi.fn()
    }));

    expect(html).toContain("Search every flavour");
    expect(html).toContain("1 of 5 selected");
    expect(html).toContain('aria-label="Flavour category wheel"');
    expect(html).toContain("Drag wheel or tap a category");
    expect(html).toContain("Your flavour palette");
    expect(html).toContain("Drop flavours here");
    expect(html).toContain("Basic taste");
    expect(html).toContain("Green &amp; vegetal");
    expect(html).toContain("Mouthfeel");
    expect(html).toContain("Off-notes");
    expect(html).toContain('aria-label="Remove Stone fruit"');
    expect(html).toContain("tap to add or remove");
  });

  it("snaps the wheel to the category aligned with its marker", () => {
    expect(flavorWheelRotation(2, 10)).toBe(-72);
    expect(flavorWheelIndex(-72, 10)).toBe(2);
    expect(flavorWheelIndex(36, 10)).toBe(9);
  });

  it("offers grouped brewing methods and distinct first and later Gongfu infusion prompts", () => {
    const draft = {
      ...createSoloTeaDraft("owner-1", (() => {
        const ids = ["session-1", "card-1"];
        return () => ids.shift() ?? "unused";
      })()),
      brewing: { style: "gongfu" as const, stages: createDefaultTeaLabBrewStages("gongfu") }
    };
    const shared = { draft, update: vi.fn(), back: vi.fn(), next: vi.fn() };
    const brewHtml = renderToStaticMarkup(createElement(BrewStep, shared));
    const tasteHtml = renderToStaticMarkup(createElement(TasteStep, { ...shared, descriptors: [] }));

    expect(brewHtml).toContain("Chinese &amp; Taiwanese methods");
    expect(brewHtml).toContain("Gongfu");
    expect(brewHtml).toContain("Hong Kong–style milk tea");
    expect(brewHtml).toContain("Custom method");
    expect(tasteHtml).toContain("Gongfu infusion notes");
    expect(tasteHtml).not.toContain("Gongfu wash / infusion notes");
    expect(tasteHtml).toContain("Rinse (optional)");
    expect(tasteHtml).toContain("Infusion 1");
    expect(tasteHtml).not.toContain("Infusion 2");
    expect(tasteHtml).not.toContain("Infusion 3");
    expect(tasteHtml).toContain(">+ Add infusion</button>");
    expect(brewHtml).toMatch(/id="water-temperature" type="range" min="0" max="100"/);
    expect(brewHtml).toContain('id="steep-seconds"');
    expect(brewHtml).toMatch(/id="steep-seconds-hours" role="spinbutton"[^>]*aria-valuemax="99"/);
    expect(brewHtml).toMatch(/id="steep-seconds-minutes" role="spinbutton"[^>]*aria-valuemax="59"/);
    expect(brewHtml).toMatch(/id="steep-seconds-seconds" role="spinbutton"[^>]*aria-valuemax="59"/);
    expect(tasteHtml).toContain('id="brew-stage-duration-1-hours"');
    expect(tasteHtml).toContain('id="brew-stage-duration-1-minutes"');
    expect(tasteHtml).toContain('id="brew-stage-duration-1-seconds"');
    expect(tasteHtml).toMatch(/id="brew-stage-temperature-1" type="range" min="0" max="100"/);
    expect(tasteHtml).toContain('aria-label="Infusion time duration"');
    expect(tasteHtml).not.toContain('id="brew-stage-duration-1-unit"');
    expect(tasteHtml.match(/How’s your first infusion\?/g)).toHaveLength(1);
    expect(tasteHtml).toMatch(/How’s your first infusion\?<\/label><textarea[^>]*id="brew-stage-notes-0"/);
    expect(tasteHtml).toMatch(/What’s changed\?<\/label><textarea[^>]*id="brew-stage-notes-1"/);
  });

  it("offers an additional infusion for every brewing method", () => {
    const base = createSoloTeaDraft("owner-1", (() => {
      const ids = ["session-1", "card-1"];
      return () => ids.shift() ?? "unused";
    })());
    const matchaDraft = {
      ...base,
      brewing: { style: "matcha_usucha" as const, stages: createDefaultTeaLabBrewStages("matcha_usucha") }
    };
    const html = renderToStaticMarkup(createElement(TasteStep, {
      draft: matchaDraft,
      descriptors: [],
      update: vi.fn(),
      back: vi.fn(),
      next: vi.fn()
    }));

    expect(html).toContain("Matcha — usucha phase notes");
    expect(html).toContain(">+ Add infusion</button>");
    expect(html).toContain("up to 20");
  });

  it("keeps the primary completion action available for a reviewable revision conflict", () => {
    const draft = {
      ...createSoloTeaDraft("owner-1", (() => {
        const ids = ["session-1", "card-1"];
        return () => ids.shift() ?? "unused";
      })()),
      tea: { kind: "personal" as const, personalTeaId: "personal-1", name: "Moonlight White" },
      brewing: { style: "koridashi" as const, initialSteepSeconds: 2880 },
      tasting: { firstImpression: null, descriptorIds: [], intensity: null, rating: 4, personalNotes: null }
    };
    const html = renderToStaticMarkup(createElement(ReviewStep, {
      draft,
      teaOptions: [],
      descriptors: [],
      back: vi.fn(),
      complete: vi.fn(),
      busy: false,
      blocked: true,
      recoverableConflict: true
    }));

    expect(html).toContain("48 min");
    expect(html).toContain("Save This Copy &amp; Complete");
    expect(html).toMatch(/<button class="btn btn-gold btn-attention" type="button">Save This Copy &amp; Complete<\/button>/);
  });
});
