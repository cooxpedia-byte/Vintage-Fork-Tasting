import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestError } from "@/components/guest/GuestError";

describe("guest error announcements", () => {
  it("renders a dynamic error as one atomic alert", () => {
    const html = renderToStaticMarkup(createElement(GuestError, { message: "Try that action again." }));

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("Try that action again.");
  });

  it("does not leave an empty alert in the accessibility tree", () => {
    expect(renderToStaticMarkup(createElement(GuestError, { message: "" }))).toBe("");
  });
});
