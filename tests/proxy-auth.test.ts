import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stubs = vi.hoisted(() => ({
  createServerClient: vi.fn()
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: stubs.createServerClient }));

import { proxy } from "@/proxy";

function authClient({
  session,
  sessionError = null,
  refreshedSession = null,
  refreshError = null,
  sessionCookies = [],
  refreshCookies = []
}: {
  session: { access_token: string; refresh_token: string; expires_at: number } | null;
  sessionError?: unknown;
  refreshedSession?: { access_token: string; refresh_token: string; expires_at: number } | null;
  refreshError?: unknown;
  sessionCookies?: Array<{ name: string; value: string; options: Record<string, unknown> }>;
  refreshCookies?: Array<{ name: string; value: string; options: Record<string, unknown> }>;
}) {
  const auth = {
    getSession: vi.fn(),
    refreshSession: vi.fn(),
    signOut: vi.fn(async () => ({ error: null })),
    getClaims: vi.fn(async () => ({ data: { claims: {} }, error: null }))
  };
  stubs.createServerClient.mockImplementation((_url, _key, options) => {
    auth.getSession.mockImplementation(async () => {
      if (sessionCookies.length > 0) options.cookies.setAll(sessionCookies, {});
      return { data: { session }, error: sessionError };
    });
    auth.refreshSession.mockImplementation(async () => {
      if (refreshCookies.length > 0) options.cookies.setAll(refreshCookies, {});
      return { data: { session: refreshedSession }, error: refreshError };
    });
    return { auth };
  });
  return auth;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authentication proxy", () => {
  it("verifies a healthy session without forcing a refresh", async () => {
    const session = {
      access_token: "healthy-access",
      refresh_token: "healthy-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60
    };
    const auth = authClient({ session });

    const response = await proxy(new NextRequest("http://localhost/dashboard"));

    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.getClaims).toHaveBeenCalledWith("healthy-access");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses a successfully rotated session for the request", async () => {
    const session = {
      access_token: "expiring-access",
      refresh_token: "expiring-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 30
    };
    const refreshedSession = {
      access_token: "rotated-access",
      refresh_token: "rotated-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60
    };
    const auth = authClient({ session, refreshedSession });

    await proxy(new NextRequest("http://localhost/dashboard"));

    expect(auth.refreshSession).toHaveBeenCalledWith({ refresh_token: "expiring-refresh" });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.getClaims).toHaveBeenCalledWith("rotated-access");
  });

  it("commits revoked-session cookie deletion on the auth redirect", async () => {
    const session = {
      access_token: "still-valid-access",
      refresh_token: "revoked-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 30
    };
    const auth = authClient({
      session,
      refreshError: { code: "refresh_token_not_found", message: "Refresh Token Not Found" },
      refreshCookies: [{
        name: "sb-project-auth-token",
        value: "",
        options: { maxAge: 0, path: "/" }
      }]
    });

    const response = await proxy(new NextRequest("http://localhost/dashboard"));

    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fdashboard");
    expect(response.headers.get("set-cookie")).toContain("sb-project-auth-token=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("commits an invalid stored session deletion before the root redirect", async () => {
    const auth = authClient({
      session: null,
      sessionError: { code: "refresh_token_not_found", message: "Refresh Token Not Found" },
      sessionCookies: [{
        name: "sb-project-auth-token",
        value: "",
        options: { maxAge: 0, path: "/" }
      }]
    });

    const response = await proxy(new NextRequest("http://localhost/"));

    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fdashboard");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("preserves a still-valid access token during a transient refresh failure", async () => {
    const session = {
      access_token: "still-valid-access",
      refresh_token: "healthy-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 30
    };
    const auth = authClient({
      session,
      refreshError: { code: "network_error", message: "temporary outage" }
    });

    await proxy(new NextRequest("http://localhost/dashboard"));

    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.getClaims).toHaveBeenCalledWith("still-valid-access");
  });
});
