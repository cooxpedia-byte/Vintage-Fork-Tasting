import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";

export function getMobileDisplayName(user: Pick<User, "user_metadata">): string | null {
  const metadata = user.user_metadata ?? {};
  for (const key of ["display_name", "full_name", "name"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function getMobileUser(authorization: string | null): Promise<User | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  const url = process.env.VINTAGE_FORK_MOBILE_SUPABASE_URL;
  const publishableKey = process.env.VINTAGE_FORK_MOBILE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Missing Mobile Home Supabase environment variables.");
  }

  const mobileSupabase = createSupabaseClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  const { data, error } = await mobileSupabase.auth.getUser(token);
  return error ? null : data.user;
}
