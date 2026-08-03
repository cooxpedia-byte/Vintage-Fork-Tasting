import { describe, expect, it } from "vitest";
import { focusTrapTarget, makeElementsInert } from "@/components/tea-lab/TastingCardDialog";

function inertElement(inert: boolean, ariaHidden: string | null) {
  const attributes = new Map<string, string>();
  if (ariaHidden !== null) attributes.set("aria-hidden", ariaHidden);
  return {
    inert,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    removeAttribute: (name: string) => { attributes.delete(name); }
  };
}

describe("tasting card dialog focus containment", () => {
  it("wraps forward from the last control to the first", () => {
    expect(focusTrapTarget({
      active: "done",
      first: "close",
      last: "done",
      focusInside: true,
      backward: false
    })).toBe("close");
  });

  it("wraps backward from the first control to the last", () => {
    expect(focusTrapTarget({
      active: "close",
      first: "close",
      last: "done",
      focusInside: true,
      backward: true
    })).toBe("done");
  });

  it("recovers focus that starts outside the dialog", () => {
    expect(focusTrapTarget({
      active: "dashboard",
      first: "close",
      last: "done",
      focusInside: false,
      backward: false
    })).toBe("close");
    expect(focusTrapTarget({
      active: "dashboard",
      first: "close",
      last: "done",
      focusInside: false,
      backward: true
    })).toBe("done");
  });

  it("leaves focus alone between the dialog boundaries", () => {
    expect(focusTrapTarget({
      active: "photo",
      first: "close",
      last: "done",
      focusInside: true,
      backward: false
    })).toBeNull();
  });

  it("makes outside branches inert and restores their previous state", () => {
    const visible = inertElement(false, null);
    const alreadyHidden = inertElement(true, "until-found");

    const restore = makeElementsInert([visible, alreadyHidden]);

    expect(visible.inert).toBe(true);
    expect(visible.getAttribute("aria-hidden")).toBe("true");
    expect(alreadyHidden.inert).toBe(true);
    expect(alreadyHidden.getAttribute("aria-hidden")).toBe("true");

    restore();

    expect(visible.inert).toBe(false);
    expect(visible.getAttribute("aria-hidden")).toBeNull();
    expect(alreadyHidden.inert).toBe(true);
    expect(alreadyHidden.getAttribute("aria-hidden")).toBe("until-found");
  });
});
