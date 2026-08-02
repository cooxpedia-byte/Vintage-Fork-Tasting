import { describe,expect,it } from "vitest";
import { safeNextPath } from "@/lib/auth-redirect";

describe("authentication redirects",()=>{
  it("keeps local paths and rejects external or backslash redirects",()=>{
    expect(safeNextPath("/admin/events/123","/dashboard")).toBe("/admin/events/123");
    expect(safeNextPath("//attacker.example","/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/\\attacker.example","/dashboard")).toBe("/dashboard");
    expect(safeNextPath("https://attacker.example","/dashboard")).toBe("/dashboard");
  });
});
