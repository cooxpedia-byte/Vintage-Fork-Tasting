import { beforeEach, describe, expect, it, vi } from "vitest";
import { awardRequest, leavesValue, mergeAdminAccounts } from "@/lib/admin/accounts";
const stubs = vi.hoisted(() => ({ requireAdminApi: vi.fn(), createAdminClient: vi.fn(), loggerError: vi.fn() }));
vi.mock("@/lib/admin/require-admin", () => ({ requireAdminApi: stubs.requireAdminApi }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/logger", () => ({ logger: { error: stubs.loggerError } }));
import { POST } from "@/app/api/admin/gold-leaves/route";
const actor = "60000000-0000-4000-8000-000000000001", wallet = "60000000-0000-4000-8000-000000000002", owner = "60000000-0000-4000-8000-000000000003", requestId = "60000000-0000-4000-8000-000000000004";
const body = { walletId: wallet, requestId, amount: 50, reason: "Service recovery" };
const request = (data: unknown = body) => new Request("https://example.invalid/api/admin/gold-leaves", { method: "POST", body: JSON.stringify(data), headers: { "content-type": "application/json" } });
function client(result: { data: unknown; error: unknown } = { data: { id: wallet, owner_user_id: owner }, error: null }) {
  const builder = { select: vi.fn(() => builder), eq: vi.fn(() => builder), maybeSingle: vi.fn(async () => result) };
  return { from: vi.fn(() => builder), rpc: vi.fn().mockResolvedValue({ data: "entry-synthetic", error: null }), builder };
}
beforeEach(() => { vi.clearAllMocks(); stubs.requireAdminApi.mockResolvedValue({ ok: true, user: { id: actor } }); });

describe("canonical admin Gold Leaves credit", () => {
  it.each([401, 403])("rejects unauthorized access with %s before privileged client", async status => {
    stubs.requireAdminApi.mockResolvedValue({ ok: false, status, error: "Access denied." });
    expect((await POST(request())).status).toBe(status); expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });
  it.each([0, -1, 5001, 1.5, "50"])("rejects unsupported credit amount %s", async amount => {
    expect((await POST(request({ ...body, amount }))).status).toBe(422); expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });
  it("requires explicit retry identifier and reason", async () => {
    expect((await POST(request({ ...body, requestId: undefined }))).status).toBe(422);
    expect((await POST(request({ ...body, reason: "short" }))).status).toBe(422); expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });
  it("credits only canonical wallet through debt-aware journal helper", async () => {
    const admin = client(); stubs.createAdminClient.mockReturnValue(admin); const result = await POST(request());
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(admin.from).toHaveBeenCalledExactlyOnceWith("merchant_wallets"); expect(admin.builder.eq).toHaveBeenCalledExactlyOnceWith("id", wallet);
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith("post_gold_leaves_entry", {
      p_wallet_id: wallet, p_entry_type: "adjustment", p_leaves_delta: 50, p_source: "admin_dashboard", p_source_reference: expect.stringMatching(new RegExp(`^${actor}:[a-f0-9]{64}$`)),
      p_idempotency_key: `admin:${actor}:${requestId}`, p_description: "Service recovery", p_metadata: { actor_type: "admin", actor_id: actor, reason: "Service recovery", request_id: requestId }, p_allow_negative_balance: false,
    });
    expect(await result.json()).toMatchObject({ entryId: "entry-synthetic", message: expect.stringContaining("refund debt") });
  });
  it("keeps exact canonical key and payload across retries", async () => {
    const admin = client(); stubs.createAdminClient.mockReturnValue(admin); await POST(request()); await POST(request()); expect(admin.rpc.mock.calls[0]).toEqual(admin.rpc.mock.calls[1]);
  });
  it("binds reason into retry comparison and reports mismatched reuse", async () => {
    const admin = client(); stubs.createAdminClient.mockReturnValue(admin); await POST(request()); admin.rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    const result = await POST(request({ ...body, reason: "Another reason" })); expect(result.status).toBe(409);
    const first = admin.rpc.mock.calls[0][1], second = admin.rpc.mock.calls[1][1]; expect(first.p_idempotency_key).toBe(second.p_idempotency_key); expect(first.p_source_reference).not.toBe(second.p_source_reference);
    expect(await result.json()).toMatchObject({ error: expect.stringContaining("different award") });
  });
  it("namespaces browser identifiers by authenticated administrator", async () => {
    const admin = client(); stubs.createAdminClient.mockReturnValue(admin); await POST(request()); stubs.requireAdminApi.mockResolvedValue({ ok: true, user: { id: owner } }); await POST(request());
    expect(admin.rpc.mock.calls[0][1].p_idempotency_key).not.toBe(admin.rpc.mock.calls[1][1].p_idempotency_key);
  });
  it("refuses missing wallet without creating one", async () => {
    const admin = client({ data: null, error: null }); stubs.createAdminClient.mockReturnValue(admin); expect((await POST(request())).status).toBe(409); expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on wallet read error", async () => {
    const admin = client({ data: null, error: { code: "PGRST000" } }); stubs.createAdminClient.mockReturnValue(admin); expect((await POST(request())).status).toBe(503); expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("does not promise no change after uncertain RPC result", async () => {
    const admin = client(); admin.rpc.mockResolvedValue({ data: null, error: { code: "NETWORK" } }); stubs.createAdminClient.mockReturnValue(admin); const result = await POST(request());
    expect(result.status).toBe(503); const text = (await result.json()).error; expect(text).toContain("Retry the same request"); expect(text).not.toContain("Nothing was changed");
  });
});

describe("admin ownership and client retries", () => {
  const profile = { id: owner, display_name: "Synthetic customer", role: "customer" as const, created_at: "2026-01-01" };
  it("maps canonical owner IDs and keeps refund debt separate", () => {
    const rows = mergeAdminAccounts({ profiles: [profile, { ...profile, id: actor }], wallets: [{ id: wallet, owner_user_id: owner, balance: "0", refund_debt: "90" }], users: [{ id: owner, email: "same@example.invalid" }, { id: actor, email: "same@example.invalid" }] });
    expect(rows.find(row => row.userId === owner)).toMatchObject({ walletId: wallet, goldLeaves: "0", refundDebt: "90" }); expect(rows.find(row => row.userId === actor)).toMatchObject({ walletId: null, goldLeaves: "0", refundDebt: "0" });
  });
  it("fails closed for conflicting ownership and overlapping funds and debt", () => {
    const row = { id: wallet, owner_user_id: owner, balance: 0, refund_debt: 90 };
    expect(() => mergeAdminAccounts({ profiles: [profile], wallets: [row, row], users: [] })).toThrow(); expect(() => mergeAdminAccounts({ profiles: [], wallets: [row], users: [] })).toThrow(); expect(() => mergeAdminAccounts({ profiles: [profile], wallets: [{ ...row, balance: 1 }], users: [] })).toThrow();
  });
  it("preserves exact bigint strings and refuses rounded or negative balances", () => {
    expect(leavesValue("9223372036854775807")).toBe("9223372036854775807"); for (const value of [Number.MAX_SAFE_INTEGER + 1, -1, "-1", "9223372036854775808", "1.5"]) expect(() => leavesValue(value)).toThrow();
  });
  it("retains pending identifier for retries and rotates only for a new intent", () => {
    const intent = { walletId: wallet, amount: 50, reason: "Service recovery" }; const next = vi.fn(() => requestId); const pending = awardRequest(null, intent, next); expect(next).toHaveBeenCalledTimes(1);
    expect(awardRequest(pending, { ...intent }, next)).toBe(pending); expect(next).toHaveBeenCalledTimes(1);
    for (const change of [{ amount: 100 }, { reason: "New service reason" }, { walletId: owner }]) expect(awardRequest(pending, { ...intent, ...change }, () => "new-request").requestId).toBe("new-request");
    expect(awardRequest(null, intent, () => "after-success").requestId).toBe("after-success");
  });
});
