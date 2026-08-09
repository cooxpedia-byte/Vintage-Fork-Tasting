import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/domain";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireUser(next = "/dashboard") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(next, "/dashboard"))}`);
  return user;
}

export async function getRole(userId: string): Promise<UserRole> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return (data?.role ?? "customer") as UserRole;
}

export async function requireStaff(allowed: UserRole[] = ["host", "admin"]) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const role = await getRole(user.id);
  if (!allowed.includes(role)) redirect("/unauthorized");
  return { user, role };
}
