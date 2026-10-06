import type { ReactNode, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  historyPush: vi.fn(),
  search: ""
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initialValue: T) => [initialValue, vi.fn()] as const
  };
});

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(hooks.search) }));

import { CustomerDashboard } from "@/components/dashboard/CustomerDashboard";
import { TeaLabWorkspace } from "@/components/tea-lab/TeaLabWorkspace";
import { TeaLibrary } from "@/components/tea-lab/TeaLibrary";
import { TeaPassport } from "@/components/tea-lab/TeaPassport";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textContent((node as ReactElement<{ children?: ReactNode }>).props.children);
}

function elements(node: ReactNode): ReactElement<{ children?: ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...elements(element.props.children)];
}

function findButtons(node: ReactNode, name: string) {
  return elements(node).filter(element => element.type === "button"
    && textContent(element.props.children).trim().endsWith(name)) as ReactElement<{
      onClick: () => void;
      "aria-pressed"?: boolean;
    }>[];
}

beforeEach(() => {
  hooks.historyPush.mockReset().mockImplementation((_state, _title, url: string) => {
    hooks.search = new URL(url, "https://tasting.example").search.slice(1);
  });
  hooks.search = "";
  vi.stubGlobal("window", { history: { pushState: hooks.historyPush } });
});

describe("customer dashboard route synchronization", () => {
  it("uses the current route section after client navigation", () => {
    hooks.search = "section=saved";
    const dashboard = CustomerDashboard({ name: "Alex", events: [], initialTab: "home" });
    const savedButton = findButtons(dashboard, "Saved teas")[0];

    expect(savedButton?.props["aria-pressed"]).toBe(true);
  });

  it("updates the URL without starting a server navigation", () => {
    const dashboard = CustomerDashboard({ name: "Alex", events: [], initialTab: "home" });
    const savedButton = findButtons(dashboard, "Saved teas")[0];

    expect(savedButton).not.toBeNull();
    savedButton?.props.onClick();

    expect(hooks.historyPush).toHaveBeenCalledWith(null, "", "/dashboard?section=saved");
  });

  const sections = [
    { query: "journal", initialTab: "journal", label: "Journal" },
    { query: "saved", initialTab: "saved", label: "Library" },
    { query: "tea-cellar", initialTab: "passport", label: "Tea Cellar" }
  ] as const;

  for (const { query, initialTab, label } of sections) {
    for (const [navigation, buttonIndex] of [["desktop", 0], ["mobile", 1]] as const) {
      it(`returns from a direct ${query} link to Lab using ${navigation} navigation`, () => {
        hooks.search = `section=${query}&embed=1`;
        const props = { name: "Alex", ownerUserId: "owner-1", events: [], initialTab, teaLabEnabled: true };
        const render = () => CustomerDashboard(props);
        const dashboard = render();

        expect(findButtons(dashboard, label)[buttonIndex].props["aria-pressed"]).toBe(true);
        const labButtons = findButtons(dashboard, "Lab");
        expect(labButtons).toHaveLength(2);
        labButtons[buttonIndex].props.onClick();

        expect(hooks.historyPush).toHaveBeenLastCalledWith(null, "", "/dashboard?embed=1");
        const lab = render();
        expect(findButtons(lab, "Lab").every(button => button.props["aria-pressed"])).toBe(true);
        expect(elements(lab).some(element => element.type === TeaLabWorkspace)).toBe(true);
        expect(elements(lab).some(element => element.type === TeaLibrary || element.type === TeaPassport)).toBe(false);
        expect(textContent(lab)).not.toContain("Your Tasting Journal");

        // Browser history updates the route without changing the initial server props.
        hooks.search = `section=${query}&embed=1`;
        expect(findButtons(render(), label)[buttonIndex].props["aria-pressed"]).toBe(true);
        hooks.search = "embed=1";
        expect(elements(render()).some(element => element.type === TeaLabWorkspace)).toBe(true);
      });
    }
  }

  it("opens Lab from the Library's Start a tasting action after a direct link", () => {
    hooks.search = "section=saved";
    const props = { name: "Alex", ownerUserId: "owner-1", events: [], initialTab: "saved" as const, teaLabEnabled: true };
    const library = elements(CustomerDashboard(props)).find(element => element.type === TeaLibrary) as ReactElement<{
      onOpenLab: () => void;
    }>;

    expect(library).toBeDefined();
    library.props.onOpenLab();

    expect(hooks.historyPush).toHaveBeenLastCalledWith(null, "", "/dashboard");
    expect(elements(CustomerDashboard(props)).some(element => element.type === TeaLabWorkspace)).toBe(true);
  });

  it.each(["passport", "tea-merchant", "merchant"])("keeps the legacy %s link working", section => {
    hooks.search = `section=${section}`;
    const dashboard = CustomerDashboard({ name: "Alex", events: [], initialTab: "home", teaLabEnabled: true });
    expect(findButtons(dashboard, "Tea Cellar").every(button => button.props["aria-pressed"])).toBe(true);
    expect(elements(dashboard).some(element => element.type === TeaPassport)).toBe(true);
  });

  it("returns to Home when Tea Lab is disabled", () => {
    hooks.search = "section=journal";
    const props = { name: "Alex", events: [], initialTab: "journal" as const };
    findButtons(CustomerDashboard(props), "Home")[0].props.onClick();
    const dashboard = CustomerDashboard(props);
    expect(findButtons(dashboard, "Home").every(button => button.props["aria-pressed"])).toBe(true);
    expect(textContent(dashboard)).toContain("Your cellar is ready.");
    expect(textContent(dashboard)).not.toContain("Your Tasting Journal");
  });
});
