import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { redirect } from "next/navigation";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?:string }> }) {
  const params=await searchParams;
  const next=safeNextPath(params.next??null,"/dashboard");
  const supabase=await createClient();
  const { data:{ user } }=await supabase.auth.getUser();
  if (!user) {
    const loginPath=next.startsWith("/admin")?"/admin/login":"/login";
    redirect(`${loginPath}?next=${encodeURIComponent(next)}&authError=recovery_required`);
  }
  return <Suspense><ResetPasswordForm /></Suspense>;
}
