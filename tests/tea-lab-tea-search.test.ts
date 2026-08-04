import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChooseTeaStep } from "@/components/tea-lab/TeaLabWorkspace";
import { searchTeaOptions, type TeaLabTeaOption } from "@/lib/tea-lab/lab";
import { createSoloTeaDraft } from "@/lib/tea-lab/offline";

const options: TeaLabTeaOption[] = [
  {
    key: "canonical:saved",
    name: "Jasmine Silver Needle",
    producer: "Vintage Fork",
    origin: "Fujian",
    teaType: "White tea",
    defaultSteepSeconds: 120,
    saved: true,
    selection: { kind: "canonical", canonicalTeaId: "10000000-0000-4000-8000-000000000101" }
  },
  {
    key: "personal:oolong",
    name: "Roasted Mountain Oolong",
    producer: null,
    origin: "Taiwan",
    teaType: "Oolong",
    defaultSteepSeconds: 30,
    saved: false,
    selection: { kind: "personal", personalTeaId: "10000000-0000-4000-8000-000000000102", name: "Roasted Mountain Oolong" }
  },
  {
    key: "canonical:sencha",
    name: "Japanese Sencha",
    producer: "Vintage Fork",
    origin: "Shizuoka",
    teaType: "Green tea",
    defaultSteepSeconds: 60,
    saved: false,
    selection: { kind: "canonical", canonicalTeaId: "10000000-0000-4000-8000-000000000103" }
  }
];

describe("Tea Lab tea search", () => {
  it("matches names and supporting details without requiring an inventory selection", () => {
    expect(searchTeaOptions(options, "jasmine").map(option => option.name)).toEqual(["Jasmine Silver Needle"]);
    expect(searchTeaOptions(options, "taiwan").map(option => option.name)).toEqual(["Roasted Mountain Oolong"]);
    expect(searchTeaOptions(options, "shizuoka").map(option => option.name)).toEqual(["Japanese Sencha"]);
    expect(searchTeaOptions(options, "not stocked")).toEqual([]);
    expect(searchTeaOptions(options, "")).toEqual([]);
  });

  it("renders a free-text combobox instead of an inventory select", () => {
    const draft = {
      ...createSoloTeaDraft("owner-1", (() => {
        const ids = ["session-1", "card-1"];
        return () => ids.shift() ?? "unused";
      })()),
      tea: { kind: "personal" as const, personalTeaId: "personal-new", name: "Neighbour's Garden Green" }
    };
    const html = renderToStaticMarkup(createElement(ChooseTeaStep, {
      draft,
      options,
      update: vi.fn(),
      next: vi.fn()
    }));

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('value="Neighbour&#x27;s Garden Green"');
    expect(html).toContain("or type any tea name");
    expect(html).not.toContain("<select");
    expect(html).not.toContain(">Tea name</label>");
  });
});
