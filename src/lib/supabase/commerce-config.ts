export const COMMERCE_COOKIE = "vf-store-admin";
export const COMMERCE_ACTOR_COOKIE = "vf-store-admin-for";

export function commerceConfig() {
  const url = process.env.COMMERCE_SUPABASE_URL;
  const key = process.env.COMMERCE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // The commerce database is separate from the tasting/events database.
  if (new URL(url).origin !== "https://fugvpupuwgbnojkyptym.supabase.co") throw new Error("Unexpected commerce database.");
  return { url, key };
}

export const commerceCookieOptions = {
  name: COMMERCE_COOKIE,
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export function isCommerceCookie(name: string) {
  return name === COMMERCE_COOKIE || name.startsWith(COMMERCE_COOKIE + ".") || name === COMMERCE_ACTOR_COOKIE;
}
