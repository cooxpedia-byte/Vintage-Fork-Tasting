import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  getMobileUser: vi.fn(),
  createAdminClient: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("@/lib/mobile-auth", () => ({ getMobileUser: stubs.getMobileUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/logger", () => ({ logger: { error: stubs.loggerError } }));

import { GET } from "@/app/api/mobile-auth/loyalty/route";

const user = {
  id: "10000000-0000-4000-8000-000000000101",
  email: "customer@example.test",
  user_metadata: { display_name: "Customer" }
};
const summary = {
  owner_user_id: "10000000-0000-4000-8000-000000000102",
  wallet_id: "10000000-0000-4000-8000-000000000103",
  points_balance: 425,
  points_label: "Gold Leaves",
  earning_enabled: true,
  redemption_enabled: true
};

function request(authorization: string | null = "Bearer synthetic-mobile-token") {
  return new NextRequest("https://example.test/api/mobile-auth/loyalty", {
    headers: authorization ? { authorization } : {}
  });
}

function adminClient() {
  const rpc = vi.fn(async (name: string): Promise<{ data: typeof summary[] | null; error: { code: string } | null }> => {
    if (name !== "get_mobile_loyalty_summary") throw new Error("Merchant system unavailable");
    return { data: [summary], error: null };
  });
  const from = vi.fn(() => { throw new Error("Merchant system unavailable"); });
  const generateLink = vi.fn();
  const admin = { rpc, from, auth: { admin: { generateLink } } };
  stubs.createAdminClient.mockReturnValue(admin);
  return admin;
}

beforeEach(() => {
  vi.resetAllMocks();
  stubs.getMobileUser.mockResolvedValue(user);
});

describe("mobile Gold Leaves wallet", () => {
  it("returns the canonical balance when the merchant system is unavailable without mutating an existing wallet", async () => {
    const admin = adminClient();

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      balance: 425,
      label: "Gold Leaves",
      earningEnabled: true,
      redemptionEnabled: true,
      eligibleCardCount: 0
    });
    expect(stubs.getMobileUser).toHaveBeenCalledExactlyOnceWith("Bearer synthetic-mobile-token");
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith("get_mobile_loyalty_summary", {
      p_mobile_auth_user_id: user.id
    });
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it.each([null, "Bearer invalid-mobile-token"])("rejects an unauthenticated request before accessing a wallet", async (authorization) => {
    stubs.getMobileUser.mockResolvedValue(null);

    const response = await GET(request(authorization));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(stubs.getMobileUser).toHaveBeenCalledExactlyOnceWith(authorization);
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });

  it("preserves the missing-email rejection before accessing a wallet", async () => {
    stubs.getMobileUser.mockResolvedValue({ ...user, email: null });

    const response = await GET(request());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "This account has no email address." });
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });

  it("reports an unavailable canonical wallet as 503 instead of a zero balance", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "unavailable" } });

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Your Gold Leaves could not be loaded." });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it("preserves the canonical balance and earning/redemption flags without recalculating them", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValueOnce({
      data: [{ ...summary, points_balance: -5, earning_enabled: false, redemption_enabled: false }],
      error: null
    });

    const response = await GET(request());

    expect(await response.json()).toEqual({
      balance: -5,
      label: "Gold Leaves",
      earningEnabled: false,
      redemptionEnabled: false,
      eligibleCardCount: 0
    });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("preserves registration for an unlinked account and reloads its canonical wallet", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: [], error: null });
    admin.rpc.mockResolvedValueOnce({ data: null, error: null });
    admin.auth.admin.generateLink.mockResolvedValue({ data: { user: { id: summary.owner_user_id } }, error: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect((await response.json()).balance).toBe(425);
    expect(admin.auth.admin.generateLink).toHaveBeenCalledExactlyOnceWith({
      type: "magiclink",
      email: user.email,
      options: { data: {
        full_name: "Customer",
        mobile_auth_user_id: user.id,
        vintagefork_identity_version: "1"
      } }
    });
    expect(admin.rpc.mock.calls).toEqual([
      ["get_mobile_loyalty_summary", { p_mobile_auth_user_id: user.id }],
      ["register_mobile_customer", { p_mobile_auth_user_id: user.id, p_owner_user_id: summary.owner_user_id, p_email: user.email }],
      ["get_mobile_loyalty_summary", { p_mobile_auth_user_id: user.id }]
    ]);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("keeps an empty post-registration wallet unavailable instead of inventing a zero balance", async () => {
    const admin = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: [], error: null });
    admin.rpc.mockResolvedValueOnce({ data: null, error: null });
    admin.rpc.mockResolvedValueOnce({ data: [], error: null });
    admin.auth.admin.generateLink.mockResolvedValue({ data: { user: { id: summary.owner_user_id } }, error: null });

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Your Gold Leaves account is not ready." });
    expect(admin.from).not.toHaveBeenCalled();
  });
});
