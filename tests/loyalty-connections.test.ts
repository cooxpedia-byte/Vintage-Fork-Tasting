import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

describe("Gold Leaves connections", () => {
  it("bridges the authenticated mobile identity to the production wallet", () => {
    const route = source("src/app/api/mobile-auth/loyalty/route.ts");
    expect(route).toContain("getMobileUser");
    expect(route).toContain("admin.auth.admin.generateLink");
    expect(route).toContain('admin.rpc("register_mobile_customer"');
    expect(route).toContain('admin.rpc("get_mobile_loyalty_summary"');
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });
});
