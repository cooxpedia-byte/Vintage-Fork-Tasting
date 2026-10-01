import { describe,expect,it } from "vitest";
import { safeNextPath, withNextPath, loginPathForDestination } from "@/lib/auth-redirect";

describe("authentication redirects",()=>{
  it("returns staff recovery failures to staff sign-in and preserves customer destinations",()=>{
    expect(loginPathForDestination("/admin")).toBe("/admin/login");
    expect(loginPathForDestination("/admin/orders")).toBe("/admin/login");
    expect(loginPathForDestination("/reset-password?next=%2Fadmin%2Forders")).toBe("/admin/login");
    expect(loginPathForDestination("/dashboard?section=tea-cellar")).toBe("/login");
    expect(loginPathForDestination("/reset-password?next=%2Fdashboard%3Fsection%3Dtea-cellar")).toBe("/login");
    expect(loginPathForDestination("/administrator")).toBe("/login");
    expect(loginPathForDestination("https://attacker.example/admin")).toBe("/login");
  });
  it("keeps local paths and rejects external or backslash redirects",()=>{
    expect(safeNextPath("/admin/events/123","/dashboard")).toBe("/admin/events/123");
    expect(safeNextPath("//attacker.example","/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/\\attacker.example","/dashboard")).toBe("/dashboard");
    expect(safeNextPath("https://attacker.example","/dashboard")).toBe("/dashboard");
  });

  it("restores the deployed guard against whitespace and control-character redirects",()=>{
    for (const next of ["/\n/attacker.example", "/\t/attacker.example", "/admin/orders\u0000", "/admin/orders\u007f", "/admin /orders"]) {
      expect(safeNextPath(next, "/dashboard")).toBe("/dashboard");
    }
    expect(safeNextPath("/dashboard?section=tea-cellar", "/admin")).toBe("/dashboard?section=tea-cellar");
    expect(safeNextPath("/event/INVITE123", "/admin")).toBe("/event/INVITE123");
  });

  it("preserves a safe dashboard handoff as one encoded next parameter",()=>{
    const eventPath = safeNextPath("/event/INVITE123", "/dashboard");
    expect(withNextPath("/login", eventPath)).toBe("/login?next=%2Fevent%2FINVITE123");
    expect(withNextPath("/signup", eventPath)).toBe("/signup?next=%2Fevent%2FINVITE123");
    expect(withNextPath("https://example.test/auth/callback", eventPath)).toBe(
      "https://example.test/auth/callback?next=%2Fevent%2FINVITE123"
    );
  });

  it("does not carry an external destination into an authentication handoff",()=>{
    expect(withNextPath("/signup", "https://attacker.example/event")).toBe("/signup?next=%2Fdashboard");
  });
});
