import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ params: new URLSearchParams(), createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => stubs.params }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: stubs.createClient }));

import AdminLoginPage from "@/app/admin/login/page";
import { staffNextPath, staffResetRedirect } from "@/components/auth/StaffLoginForm";

beforeEach(() => {
  stubs.params = new URLSearchParams();
  vi.clearAllMocks();
});

describe("restored native staff login", () => {
  it("renders email/password and recovery controls without a WordPress redirect or customer providers", () => {
    const html = renderToStaticMarkup(createElement(AdminLoginPage));
    expect(html).toContain("Staff sign in");
    expect(html).toContain('id="staff-email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('id="staff-password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Reset password");
    expect(html).not.toContain("admin-post.php");
    expect(html).not.toContain("Continue with Apple");
    expect(html).not.toContain("Continue with Google");
    expect(stubs.createClient).not.toHaveBeenCalled();
  });

  it("keeps the native form available after a failed sign-in or recovery link", () => {
    stubs.params = new URLSearchParams({ authError: "callback_failed", next: "/admin/orders" });
    const html = renderToStaticMarkup(createElement(AdminLoginPage));
    expect(html).toContain("That sign-in or recovery link could not be completed. Try again.");
    expect(html).toContain('id="staff-password"');
    expect(html).toContain('role="alert"');
  });

  it("defaults to orders and accepts only local admin destinations", () => {
    expect(staffNextPath(null)).toBe("/admin/orders");
    expect(staffNextPath("/admin")).toBe("/admin");
    expect(staffNextPath("/admin/orders?source=imported")).toBe("/admin/orders?source=imported");
    expect(staffNextPath("/admin/events/event-1")).toBe("/admin/events/event-1");
    for (const value of ["/dashboard?section=tea-cellar", "https://example.test/admin", "//example.test/admin", "/admin/login", "/admin/login?next=%2Fadmin", "/admin/login/", "/administrator", "/admin/\\example.test"]) {
      expect(staffNextPath(value)).toBe("/admin/orders");
    }
  });

  it("routes password recovery through the native callback and back to staff orders", () => {
    const redirect = new URL(staffResetRedirect("https://tasting.vintagefork.ca", "/admin/orders"));
    expect(redirect.origin + redirect.pathname).toBe("https://tasting.vintagefork.ca/auth/callback");
    expect(redirect.searchParams.get("next")).toBe("/reset-password?next=%2Fadmin%2Forders");
  });
});
