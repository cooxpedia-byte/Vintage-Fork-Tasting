import { describe,expect,it } from "vitest";
import { safeNextPath, withNextPath } from "@/lib/auth-redirect";

describe("authentication redirects",()=>{
  it("keeps local paths and rejects external or backslash redirects",()=>{
    expect(safeNextPath("/admin/events/123","/dashboard")).toBe("/admin/events/123");
    expect(safeNextPath("//attacker.example","/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/\\attacker.example","/dashboard")).toBe("/dashboard");
    expect(safeNextPath("https://attacker.example","/dashboard")).toBe("/dashboard");
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
