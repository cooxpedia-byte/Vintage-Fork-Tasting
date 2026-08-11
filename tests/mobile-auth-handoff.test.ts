import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getMobileDisplayName } from "@/lib/mobile-auth";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

describe("mobile authentication handoff", () => {
  it("requires an authenticated bearer session and returns a single-use confirmation link", () => {
    const route = source("src/app/api/mobile-auth/handoff/route.ts");
    const mobileAuth = source("src/lib/mobile-auth.ts");
    expect(route).toContain('request.headers.get("authorization")');
    expect(route).toContain("getMobileUser");
    expect(mobileAuth).toContain("mobileSupabase.auth.getUser(token)");
    expect(mobileAuth).toContain("VINTAGE_FORK_MOBILE_SUPABASE_URL");
    expect(mobileAuth).toContain("VINTAGE_FORK_MOBILE_SUPABASE_PUBLISHABLE_KEY");
    expect(route).toContain('type: "magiclink"');
    expect(route).toContain("data.properties.hashed_token");
    expect(route).toContain('new URL("/auth/confirm", request.url)');
    expect(route).toContain('handoffUrl.searchParams.set("type", "email")');
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).not.toContain("refresh_token");
  });

  it("synchronizes the trusted mobile profile name before completing the handoff", () => {
    const route = source("src/app/api/mobile-auth/handoff/route.ts");
    expect(route).toContain("getMobileDisplayName(user)");
    expect(route).toContain('.from("profiles")');
    expect(route).toContain('.update({ display_name: displayName })');
    expect(route).toContain('.eq("id", data.user.id)');
  });

  it("validates the destination before creating the handoff", () => {
    const route = source("src/app/api/mobile-auth/handoff/route.ts");
    expect(route).toContain("safeNextPath");
  });

  it("prefers the existing mobile display name over generated provider metadata", () => {
    expect(getMobileDisplayName({
      user_metadata: {
        display_name: "  Salar  ",
        full_name: "Generated Apple Account"
      }
    })).toBe("Salar");
    expect(getMobileDisplayName({
      user_metadata: { full_name: "Salar" }
    })).toBe("Salar");
    expect(getMobileDisplayName({
      user_metadata: { display_name: "   " }
    })).toBeNull();
  });
});
