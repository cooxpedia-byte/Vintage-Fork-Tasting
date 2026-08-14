import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

describe("Mobile Home provider sign-in on the web", () => {
  it("starts only Apple or Google in the Mobile Home authentication project", () => {
    const route = source("src/app/auth/mobile/start/route.ts");
    const client = source("src/lib/supabase/mobile-server.ts");
    expect(route).toContain('z.enum(["apple", "google"])');
    expect(route).toContain("createMobileServerClient");
    expect(route).toContain("mobile.auth.signInWithOAuth");
    expect(route).toContain('new URL("/auth/mobile/callback", request.url)');
    expect(route).toContain("safeNextPath");
    expect(route).toContain("MOBILE_PROVIDER_EMAIL_COOKIE");
    expect(route).toContain("login_hint");
    expect(client).toContain("VINTAGE_FORK_MOBILE_SUPABASE_URL");
    expect(client).toContain("VINTAGE_FORK_MOBILE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("exchanges the verified provider session through the existing Tea Lab handoff", () => {
    const callback = source("src/app/auth/mobile/callback/route.ts");
    expect(callback).toContain("mobile.auth.exchangeCodeForSession(code)");
    expect(callback).toContain("createMobileHandoff(data.user");
    expect(callback).toContain('NextResponse.redirect(handoff.url)');
    expect(callback).toContain('mobile.auth.signOut({ scope: "local" })');
    expect(callback).toContain("normalizeAccountEmail(data.user.email) !== expectedEmail");
    expect(callback).toContain("isApplePrivateRelayEmail(data.user.email)");
  });
});
