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
if (process.env.TEA_LAB_ENABLED !== undefined && !["true", "false"].includes(process.env.TEA_LAB_ENABLED)) {
  console.error("TEA_LAB_ENABLED must be exactly true or false when set.");
  process.exit(1);
}
if (process.env.TEA_LAB_ENABLED === "true") {
  requireRecentEvidence("TEA_LAB_MIGRATIONS_VERIFIED_AT", 30);
  requireRecentEvidence("TEA_LAB_ACCEPTANCE_VERIFIED_AT", 30);
}

if (process.env.NODE_ENV === "production") {
  const monitoringDsn = process.env.SENTRY_DSN?.trim();
  const publicMonitoringDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!monitoringDsn || !publicMonitoringDsn) {
    console.error("SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN are required for production monitoring.");
    process.exit(1);
  }
  requireRecentEvidence("AUTH_EMAIL_VERIFIED_AT", 30);
  requireRecentEvidence("BACKUP_RESTORE_VERIFIED_AT", 90);
}

console.log(`Preflight passed for ${site.origin}.`);

function requireRecentEvidence(name, maximumAgeDays) {
  const value=process.env[name];
  const timestamp=value?new Date(value).getTime():NaN;
  const age=Date.now()-timestamp;
  if (!Number.isFinite(timestamp)||age<0||age>maximumAgeDays*86_400_000) {
    console.error(`${name} must be a valid ISO timestamp from the last ${maximumAgeDays} days.`);
    process.exit(1);
  }
}
