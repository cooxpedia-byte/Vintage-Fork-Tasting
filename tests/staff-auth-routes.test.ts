import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn()
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: stubs.createClient }));

import { GET as callback } from "@/app/auth/callback/route";
import { GET as confirm } from "@/app/auth/confirm/route";

function request(path: string, params: Record<string, string>) {
  const url = new URL(path, "https://tasting.vintagefork.ca");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return new NextRequest(url);
}

beforeEach(() => {
  vi.resetAllMocks();
  stubs.createClient.mockResolvedValue({ auth: {
    exchangeCodeForSession: stubs.exchangeCodeForSession,
    verifyOtp: stubs.verifyOtp
  } });
});

const routes: Array<{ name: string; handler: typeof callback; path: string; params: Record<string, string>; error: string }> = [
  { name: "callback", handler: callback, path: "/auth/callback", params: { code: "synthetic-code" }, error: "callback_failed" },
  { name: "confirmation", handler: confirm, path: "/auth/confirm", params: { token_hash: "synthetic-hash", type: "recovery" }, error: "confirmation_failed" }
];

describe.each(routes)("$name destination preservation", ({ handler, path, params, error }) => {
  it.each(["/admin/orders", "/reset-password?next=%2Fadmin%2Forders"])("returns failed staff authentication for %s to native staff login", async next => {
    stubs.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    stubs.verifyOtp.mockResolvedValue({ error: { message: "expired" } });

    const response = await handler(request(path, { ...params, next }));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://tasting.vintagefork.ca");
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("next")).toBe(next);
    expect(location.searchParams.get("authError")).toBe(error);
  });

  it("preserves the customer Tea Cellar destination after successful authentication", async () => {
    stubs.exchangeCodeForSession.mockResolvedValue({ error: null });
    stubs.verifyOtp.mockResolvedValue({ error: null });
    const response = await handler(request(path, { ...params, next: "/dashboard?section=tea-cellar" }));
    expect(response.headers.get("location")).toBe("https://tasting.vintagefork.ca/dashboard?section=tea-cellar");
  });

  it("preserves the customer login path after failed authentication", async () => {
    stubs.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    stubs.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const response = await handler(request(path, { ...params, next: "/dashboard?section=tea-cellar" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard?section=tea-cellar");
  });

  it("preserves the nested staff password recovery destination on success", async () => {
    stubs.exchangeCodeForSession.mockResolvedValue({ error: null });
    stubs.verifyOtp.mockResolvedValue({ error: null });
    const response = await handler(request(path, { ...params, next: "/reset-password?next=%2Fadmin%2Forders" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("next")).toBe("/admin/orders");
  });
});
