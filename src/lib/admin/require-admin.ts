import { createClient } from "@/lib/supabase/server";

export async function requireAdminApi() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Authentication required." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { ok: false as const, status: 403, error: "Administrator access required." };
  return { ok: true as const, user };
}
