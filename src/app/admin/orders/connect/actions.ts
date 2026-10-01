"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createCommerceClient, clearCommerceCookies } from "@/lib/supabase/commerce-server";
import { COMMERCE_ACTOR_COOKIE, commerceCookieOptions } from "@/lib/supabase/commerce-config";

export async function connectStore(_previous: {error:string}, form: FormData) {
  const staff = await requireStaff(["admin"]);
  const email = form.get("email"), password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password || email.length > 320 || password.length > 1024) return {error:"Enter your store administrator email and password."};
  try {
    const client = await createCommerceClient();
    if (!client) return {error:"The store connection is not configured yet."};
    const {data,error} = await client.auth.signInWithPassword({email:email.trim(),password});
    if (error || !data.user) {
      await clearCommerceCookies();
      return {error:"Sign-in was unsuccessful. Use your existing new-store account."};
    }
    const profile = await client.from("profiles").select("role").eq("id",data.user.id).single();
    if (profile.error || profile.data?.role !== "admin") {
      await client.auth.signOut({scope:"local"});
      await clearCommerceCookies();
      return {error:"This account does not have store administrator access."};
    }
    const jar = await cookies();
    const {path,httpOnly,secure,sameSite} = commerceCookieOptions;
    jar.set(COMMERCE_ACTOR_COOKIE,staff.user.id,{path,httpOnly,secure,sameSite,maxAge:60*60*24*7});
  } catch {
    await clearCommerceCookies();
    return {error:"The store sign-in connection is temporarily unavailable. Please try again."};
  }
  redirect("/admin/orders");
}
