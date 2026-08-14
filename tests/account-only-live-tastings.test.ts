import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

describe("account-only live tastings", () => {
  it("requires sign-in before opening an invitation and preserves the invitation return path", () => {
    const eventPage = source("src/app/event/[invite-code]/page.tsx");
    expect(eventPage).toContain("const eventPath = guestEventPath(inviteCode)");
    expect(eventPage).toContain("await requireUser(eventPath)");
    expect(eventPage).toContain("cookieParticipant?.user_id === user.id");
  });

  it("rejects anonymous join requests and binds every new seat to the authenticated account", () => {
    const joinRoute = source("src/app/api/events/join/route.ts");
    expect(joinRoute).toContain("if (!user)");
    expect(joinRoute).toContain("status: 401");
    expect(joinRoute).toContain("p_user_id: user.id");
    expect(joinRoute).toContain("p_email: user.email ??");
    expect(joinRoute).not.toContain("user?.id ?? null");
  });

  it("removes anonymous contact fields from the seat form", () => {
    const experience = source("src/components/guest/GuestExperience.tsx");
    expect(experience).toContain("You are signed in");
    expect(experience).toContain("saved to your Tea Cellar");
    expect(experience).toContain("Join This Tasting");
    expect(experience).not.toContain("Email (optional)");
    expect(experience).not.toContain("Send me occasional notes about new teas and tastings");
  });

  it("enforces account ownership in the database and retains linked tasting cards", () => {
    const migration = source("supabase/migrations/0030_require_accounts_for_live_tastings.sql");
    expect(migration).toContain("if p_user_id is null then raise exception 'account_required'");
    expect(migration).toContain("recap_claimed_at");
    expect(migration).toContain("delete_after=null");
    expect(migration).toContain("to service_role");
  });
});
