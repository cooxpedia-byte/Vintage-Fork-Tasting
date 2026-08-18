import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const login = readFileSync(
  fileURLToPath(new URL("../src/components/auth/LoginForm.tsx", import.meta.url)),
  "utf8"
);

describe("web sign-in methods", () => {
  it("offers Apple, Google and the Vintage Fork password while preserving next", () => {
    expect(login).toContain('beginProviderSignIn("apple")');
    expect(login).toContain('beginProviderSignIn("google")');
    expect(login).toContain("Continue with Apple");
    expect(login).toContain("Continue with Google");
    expect(login).toContain("Use Vintage Fork password");
    expect(login).toContain('fetch("/auth/mobile/start"');
    expect(login).toContain("Vintage Fork account email");
    expect(login).toContain("provider_email_mismatch");
    expect(login).toContain("apple_private_relay");
    expect(login).toContain("sharedWordPressLoginUrl(next)");
  });

  it("keeps staff sign-in independent from WordPress lockouts", () => {
    expect(login).toContain("verified email assigned to your tasting staff account");
    expect(login).toContain("Apple and Google stay inside the tasting sign-in flow");
    expect(login).not.toContain("window.location.replace(signInUrl)");
  });
});
