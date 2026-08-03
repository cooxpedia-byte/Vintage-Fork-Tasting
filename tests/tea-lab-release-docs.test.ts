import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const productRules = read("docs/tea-lab/TEA_LAB_MVP_PRODUCT_RULES.md");
const runbook = read("docs/tea-lab/TEA_LAB_RELEASE_RUNBOOK.md");
const deployment = read("DEPLOYMENT.md");
const exampleEnvironment = read(".env.example");
const packageManifest = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

describe("Tea Lab release documentation", () => {
  it("keeps every MVP requirement and staging scenario in the release evidence", () => {
    for (let id = 1; id <= 14; id += 1) {
      expect(productRules).toContain(`TL-MVP-${String(id).padStart(3, "0")}`);
    }
    for (let scenario = 1; scenario <= 12; scenario += 1) {
      expect(runbook).toMatch(new RegExp(`\\| ${scenario} \\|`));
    }
    expect(runbook).toContain("Environment gate | Pending");
  });

  it("documents the ordered migrations, evidence timestamps, and flag-off rollback", () => {
    for (const migration of ["0018", "0019", "0020", "0021", "0022", "0023"]) {
      expect(runbook).toContain(migration);
    }
    for (const variable of ["TEA_LAB_MIGRATIONS_VERIFIED_AT", "TEA_LAB_ACCEPTANCE_VERIFIED_AT"]) {
      expect(runbook).toContain(variable);
      expect(deployment).toContain(variable);
      expect(exampleEnvironment).toContain(`${variable}=`);
    }
    expect(exampleEnvironment).toContain("TEA_LAB_ENABLED=false");
    expect(`${runbook}\n${deployment}\n${exampleEnvironment}`).not.toContain("NEXT_PUBLIC_TEA_LAB");
  });

  it("loads local server credentials for standalone production-parity runs", () => {
    expect(packageManifest.scripts?.start).toBe(
      "node --env-file-if-exists=.env.local .next/standalone/server.js"
    );
  });
});
