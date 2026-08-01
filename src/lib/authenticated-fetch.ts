"use client";

import { createClient } from "@/lib/supabase/browser";

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const supabase = createClient();
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (!session) throw new Error("Your session ended. Please sign in again.");

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers, cache: "no-store" });
}
