import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.create }));
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://tasting-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-tasting-key");
  vi.stubEnv("COMMERCE_SUPABASE_URL", "https://fugvpupuwgbnojkyptym.supabase.co");
  vi.stubEnv("COMMERCE_SUPABASE_PUBLISHABLE_KEY", "test-commerce-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("staff commerce cookie refresh", () => {
  function clients(commerceUnavailable = false) {
    const commerceGetUser = vi.fn();
    mock.create.mockImplementation((url, _key, options) => {
      if (url === "https://tasting-project.supabase.co") return { auth: {
        getSession: async () => {
          options.cookies.setAll([{ name: "sb-tasting-auth-token", value: "tasting-refreshed", options: { path: "/", httpOnly: true } }], {});
          return { data: { session: { access_token: "verified-tasting-access", expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null };
        },
        getClaims: vi.fn().mockResolvedValue({ data: { claims: {} }, error: null }),
      } };
      expect(url).toBe("https://fugvpupuwgbnojkyptym.supabase.co");
      expect(options.cookieOptions.name).toBe("vf-store-admin");
      commerceGetUser.mockImplementation(async () => {
        if (commerceUnavailable) throw new Error("store temporarily unavailable");
        expect(options.cookies.getAll()).toEqual(expect.arrayContaining([{ name: "sb-tasting-auth-token", value: "tasting-refreshed" }]));
        options.cookies.setAll([{ name: "vf-store-admin.0", value: "store-refreshed", options: { path: "/", httpOnly: true } }]);
        return { data: { user: { id: "store-admin" } }, error: null };
      });
      return { auth: { getUser: commerceGetUser } };
    });
    return commerceGetUser;
  }
  it("retains both tasting and commerce refresh cookies on staff requests", async () => {
    const storeAuth = clients();
    const request = new NextRequest("https://tasting.vintagefork.ca/admin/orders", { headers: { cookie: "vf-store-admin.0=old-store; sb-tasting-auth-token=old-tasting" } });
    const response = await proxy(request);
    expect(storeAuth).toHaveBeenCalledOnce();
    expect(response.cookies.get("sb-tasting-auth-token")?.value).toBe("tasting-refreshed");
    expect(response.cookies.get("vf-store-admin.0")?.value).toBe("store-refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not refresh a commerce account while viewing personal tasting records", async () => {
    const storeAuth = clients();
    await proxy(new NextRequest("https://tasting.vintagefork.ca/dashboard?section=tea-cellar", { headers: { cookie: "vf-store-admin.0=old-store" } }));
    expect(storeAuth).not.toHaveBeenCalled();
    expect(mock.create).toHaveBeenCalledTimes(1);
  });
  it("preserves tasting access and refreshed cookies if the separate commerce session is unavailable", async () => {
    clients(true);
    const response = await proxy(new NextRequest("https://tasting.vintagefork.ca/admin/orders", { headers: { cookie: "vf-store-admin.0=old-store" } }));
    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-tasting-auth-token")?.value).toBe("tasting-refreshed");
    expect(response.headers.get("location")).toBeNull();
  });
});
