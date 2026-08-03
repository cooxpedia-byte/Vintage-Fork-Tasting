import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const preflightPath = fileURLToPath(new URL("../scripts/preflight.mjs", import.meta.url));

function runPreflight(overrides: Record<string, string | undefined>) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    NEXT_PUBLIC_SITE_URL: "https://tasting.vintagefork.ca",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    SUPABASE_SECRET_KEY: "server-secret-key",
    CRON_SECRET: "12345678901234567890123456789012",
    ...overrides
  };
  for (const [name, value] of Object.entries(environment)) if (value === undefined) delete environment[name];
  return spawnSync(process.execPath, [preflightPath], { env: environment, encoding: "utf8" });
}

describe("Tea Lab release preflight", () => {
  it("does not require Tea Lab evidence while the feature remains off", () => {
    const result = runPreflight({
      TEA_LAB_ENABLED: "false",
      TEA_LAB_MIGRATIONS_VERIFIED_AT: undefined,
      TEA_LAB_ACCEPTANCE_VERIFIED_AT: undefined
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Preflight passed");
  });

  it("refuses activation without recent migration and acceptance evidence", () => {
    const result = runPreflight({
      TEA_LAB_ENABLED: "true",
      TEA_LAB_MIGRATIONS_VERIFIED_AT: undefined,
      TEA_LAB_ACCEPTANCE_VERIFIED_AT: undefined
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("TEA_LAB_MIGRATIONS_VERIFIED_AT must be a valid ISO timestamp from the last 30 days");
  });

  it("permits activation only with fresh release evidence", () => {
    const verifiedAt = new Date().toISOString();
    const result = runPreflight({
      TEA_LAB_ENABLED: "true",
      TEA_LAB_MIGRATIONS_VERIFIED_AT: verifiedAt,
      TEA_LAB_ACCEPTANCE_VERIFIED_AT: verifiedAt
    });

    expect(result.status).toBe(0);
  });
});
