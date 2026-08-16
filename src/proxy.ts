import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_REFRESH_MARGIN_MS = 90 * 1000;
const TIME_MACHINE_HOSTNAME = "timemachine.vintagefork.ca";
const TIME_MACHINE_ROUTE = "/infusion-time-machine";
const DEAD_REFRESH_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_expired"
]);

function authErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function isDeadRefreshError(error: unknown): boolean {
  const code = authErrorCode(error);
  return code !== null && DEAD_REFRESH_CODES.has(code);
}

function expiresWithinRefreshMargin(expiresAt: number | undefined): boolean {
  return typeof expiresAt === "number"
    && expiresAt * 1000 - Date.now() < SESSION_REFRESH_MARGIN_MS;
}

function copyCookies(source: NextResponse, destination: NextResponse) {
  source.cookies.getAll().forEach((cookie) => destination.cookies.set(cookie));
}

function deadSessionResponse(request: NextRequest, response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");

  const pathname = request.nextUrl.pathname;
  let redirectUrl: URL | null = null;

  if (pathname === "/" || pathname.startsWith("/dashboard")) {
    redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname === "/" ? "/dashboard" : pathname);
  } else if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    redirectUrl = new URL("/admin/login", request.url);
  } else if (pathname === "/logout") {
    redirectUrl = new URL("/login", request.url);
  }

  if (!redirectUrl) return response;

  const redirectResponse = NextResponse.redirect(redirectUrl);
  copyCookies(response, redirectResponse);
  redirectResponse.headers.set("Cache-Control", "private, no-store");
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  const hostname = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.hostname
  ).split(":")[0].toLocaleLowerCase("en-CA");
  if (hostname === TIME_MACHINE_HOSTNAME) {
    if (request.nextUrl.pathname === "/") {
      const timerUrl = request.nextUrl.clone();
      timerUrl.pathname = TIME_MACHINE_ROUTE;
      const timerResponse = NextResponse.rewrite(timerUrl);
      timerResponse.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
      return timerResponse;
    }
    if (
      request.nextUrl.pathname === TIME_MACHINE_ROUTE ||
      request.nextUrl.pathname === "/infusion-time-machine.webmanifest" ||
      request.nextUrl.pathname.startsWith("/audio/vintage-timer/") ||
      request.nextUrl.pathname.startsWith("/brand/")
    ) {
      return NextResponse.next({ request });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (request.nextUrl.pathname === TIME_MACHINE_ROUTE) {
    const timerResponse = NextResponse.next({ request });
    timerResponse.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return timerResponse;
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", "private, no-store");
      }
    }
  });

  const sessionResult = await supabase.auth.getSession();
  if (isDeadRefreshError(sessionResult.error)) {
    return deadSessionResponse(request, response);
  }

  let session = sessionResult.data.session;
  if (session && expiresWithinRefreshMargin(session.expires_at)) {
    const refreshResult = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
    if (isDeadRefreshError(refreshResult.error)) {
      return deadSessionResponse(request, response);
    }
    if (!refreshResult.error && refreshResult.data.session) session = refreshResult.data.session;
  }

  if (session) {
    response.headers.set("Cache-Control", "private, no-store");
    await supabase.auth.getClaims(session.access_token);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
