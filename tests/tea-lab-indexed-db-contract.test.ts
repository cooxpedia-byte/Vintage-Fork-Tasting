import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../src/lib/tea-lab/indexed-db.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

describe("Tea Lab IndexedDB contract", () => {
  it("uses dedicated durable draft and operation stores", () => {
    expect(source).toContain('const DATABASE_NAME = "vintage-fork-tea-lab"');
    expect(source).toContain('const DRAFT_STORE = "drafts"');
    expect(source).toContain('const OPERATION_STORE = "operations"');
    expect(source).not.toContain("localStorage");
  });

  it("indexes and filters device data by authenticated owner", () => {
    expect(source).toContain('drafts.createIndex("owner", "ownerUserId"');
    expect(source).toContain('operations.createIndex("owner", "ownerUserId"');
    expect(source).toContain('operations.createIndex("ownerSession", ["ownerUserId", "sessionId"]');
    expect(source).toContain("operation.ownerUserId !== draft.ownerUserId");
  });

  it("updates each draft and its outbox operations in one transaction", () => {
    expect(source).toContain('database.transaction([DRAFT_STORE, OPERATION_STORE], "readwrite")');
    expect(source).toContain("saveDraftAndOperations");
    expect(source).toContain("replaceSessionOperations");
  });
});
