import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COMMERCE_ACTOR_COOKIE, commerceConfig, commerceCookieOptions, isCommerceCookie } from "./commerce-config";

export async function createCommerceClient() {
  const config = commerceConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: commerceCookieOptions,
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try { values.forEach(({name,value,options}) => jar.set(name,value,options)); }
        catch { /* The proxy persists refresh cookies for server-rendered reads. */ }
      },
    },
  });
}

export async function authorizedCommerceClient(tastingUserId: string) {
  const jar = await cookies();
  if (jar.get(COMMERCE_ACTOR_COOKIE)?.value !== tastingUserId) return null;
  try {
    const client = await createCommerceClient();
    if (!client) return null;
    const {data:{user},error} = await client.auth.getUser();
    if (error || !user) return null;
    const profile = await client.from("profiles").select("role").eq("id",user.id).single();
    return !profile.error && profile.data?.role === "admin" ? client : null;
  } catch { return null; }
}

export async function clearCommerceCookies() {
  const jar = await cookies();
  jar.getAll().filter(({name})=>isCommerceCookie(name)).forEach(({name})=>jar.delete(name));
}
