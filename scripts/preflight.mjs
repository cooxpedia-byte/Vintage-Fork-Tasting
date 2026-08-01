const required = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "CRON_SECRET"
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

let site;
try { site = new URL(process.env.NEXT_PUBLIC_SITE_URL); }
catch { console.error("NEXT_PUBLIC_SITE_URL must be an absolute URL."); process.exit(1); }

if (process.env.NODE_ENV === "production" && site.protocol !== "https:") {
  console.error("Production NEXT_PUBLIC_SITE_URL must use HTTPS.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && site.hostname !== "tasting.vintagefork.ca") {
  console.error("Production hostname must be tasting.vintagefork.ca.");
  process.exit(1);
}
if ((process.env.CRON_SECRET ?? "").length < 32) {
  console.error("CRON_SECRET must contain at least 32 characters.");
  process.exit(1);
}
if (process.env.SUPABASE_SECRET_KEY?.startsWith("eyJ") && process.env.SUPABASE_SECRET_KEY === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.error("The server secret and browser publishable key must not be the same value.");
  process.exit(1);
}

console.log(`Preflight passed for ${site.origin}.`);
