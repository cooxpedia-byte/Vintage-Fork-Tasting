import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createMobileServerClient() {
  const cookieStore = await cookies();
  const url = process.env.VINTAGE_FORK_MOBILE_SUPABASE_URL;
  const key = process.env.VINTAGE_FORK_MOBILE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Mobile Home Supabase environment variables.");

  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      }
    }
  });
}
