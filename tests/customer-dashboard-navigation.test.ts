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

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textContent((node as ReactElement<{ children?: ReactNode }>).props.children);
}

function findButton(node: ReactNode, name: string): ReactElement<{ onClick: () => void; "aria-pressed"?: boolean }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child, name);
      if (match) return match;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;

  const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  if (element.type === "button" && textContent(element.props.children).trim().endsWith(name)) {
    return element as ReactElement<{ onClick: () => void; "aria-pressed"?: boolean }>;
  }
  return findButton(element.props.children, name);
}

beforeEach(() => {
  hooks.historyPush.mockReset();
  hooks.search = "";
  vi.stubGlobal("window", { history: { pushState: hooks.historyPush } });
});

describe("customer dashboard route synchronization", () => {
  it("uses the current route section after client navigation", () => {
    hooks.search = "section=saved";
    const dashboard = CustomerDashboard({ name: "Alex", events: [], initialTab: "home" });
    const savedButton = findButton(dashboard, "Saved teas");

    expect(savedButton?.props["aria-pressed"]).toBe(true);
  });

  it("updates the URL without starting a server navigation", () => {
    const dashboard = CustomerDashboard({ name: "Alex", events: [], initialTab: "home" });
    const savedButton = findButton(dashboard, "Saved teas");

    expect(savedButton).not.toBeNull();
    savedButton?.props.onClick();

    expect(hooks.historyPush).toHaveBeenCalledWith(null, "", "/dashboard?section=saved");
  });
});
