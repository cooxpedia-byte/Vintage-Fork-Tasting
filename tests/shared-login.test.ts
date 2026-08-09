import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { sharedWordPressLoginUrl } from "@/lib/shared-login";

describe("shared Vintage Fork sign-in", () => {
  it("hands Tea Lab sign-in to the central WordPress password session", () => {
    expect(sharedWordPressLoginUrl("/dashboard")).toBe(
      "https://vintagefork.ca/wp-admin/admin-post.php?action=vintage_fork_tea_lab_login&next=%2Fdashboard",
    );
  });

  it("verifies the one-time Tea Lab token as the current Supabase email type", async () => {
    const callback = await readFile(
      new URL("../src/app/auth/wordpress/route.ts", import.meta.url),
      "utf8",
    );
    expect(callback).toContain('type: "email"');
    expect(callback).not.toContain('type: "magiclink"');
  });
});
