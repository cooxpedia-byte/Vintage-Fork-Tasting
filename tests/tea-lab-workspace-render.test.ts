import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TasteStep, TeaLabWorkspace, teaLabDraftTeaName } from "@/components/tea-lab/TeaLabWorkspace";
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

  it("renders the landing action, a resumable private draft, and live tasting context", () => {
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
      upcoming: [{
        id: "event-1",
        title: "Saturday tea table",
        starts_at: "2026-08-09T18:00:00.000Z",
        location_mode: "remote",
        invite_code: "JOINME"
      }],
      onOpenJournal: vi.fn()
    }));

    expect(html).toContain("Tea Lab");
    expect(html).toContain("Create a Tasting Session");
    expect(html).toContain("Continue a draft");
    expect(html).toContain("Moonlight White");
    expect(html).toContain("Saturday tea table");
    expect(html).toContain("/event/JOINME");
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
});
