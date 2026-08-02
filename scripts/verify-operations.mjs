import { createClient } from "@supabase/supabase-js";

const required=["NEXT_PUBLIC_SITE_URL","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","SUPABASE_SECRET_KEY","SUPABASE_ACCESS_TOKEN","SUPABASE_PROJECT_REF"];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length) fail(`Missing operational verification variables: ${missing.join(", ")}`);

const site=new URL(process.env.NEXT_PUBLIC_SITE_URL);
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,"");
const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const siteResponse=await fetch(site,{redirect:"manual"});
if(!siteResponse.ok&&!String(siteResponse.status).startsWith("3")) fail(`Site health check returned HTTP ${siteResponse.status}.`);
const csp=siteResponse.headers.get("content-security-policy")??"";
if(!csp.includes("frame-ancestors 'none'")||!csp.includes("object-src 'none'")) fail("Production CSP is missing frame/object protection.");
if(siteResponse.headers.get("x-frame-options")!=="DENY") fail("Production X-Frame-Options is not DENY.");

const publicStateResponse=await fetch(`${supabaseUrl}/rest/v1/event_public_state?select=event_id&limit=1`,{headers:{apikey:publishableKey,Authorization:`Bearer ${publishableKey}`}});
if(publicStateResponse.ok) fail("Anonymous select access to event_public_state is still permitted.");

const authSettingsResponse=await fetch(`${supabaseUrl}/auth/v1/settings`,{headers:{apikey:publishableKey}});
if(!authSettingsResponse.ok) fail(`Supabase Auth settings check returned HTTP ${authSettingsResponse.status}.`);
const authSettings=await authSettingsResponse.json();
if(authSettings.mailer_autoconfirm===true) fail("Email confirmation is disabled (mailer_autoconfirm=true).");

const admin=createClient(supabaseUrl,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:job,error:jobError}=await admin.from("operational_job_runs").select("status,completed_at").eq("job_name","retention").order("completed_at",{ascending:false}).limit(1).maybeSingle();
if(jobError) fail(`Retention evidence query failed: ${jobError.message}`);
if(!job||job.status!=="succeeded") fail("No successful retention run is recorded.");
if(Date.now()-new Date(job.completed_at).getTime()>26*60*60*1000) fail("The latest successful retention run is older than 26 hours.");

const backupResponse=await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(process.env.SUPABASE_PROJECT_REF)}/database/backups`,{headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`}});
if(!backupResponse.ok) fail(`Supabase backup verification returned HTTP ${backupResponse.status}.`);
const backupData=await backupResponse.json();
const completed=(backupData.backups??[]).filter(backup=>backup.status==="COMPLETED").sort((a,b)=>new Date(b.inserted_at).getTime()-new Date(a.inserted_at).getTime());
if(!backupData.pitr_enabled&&!completed.length) fail("Neither PITR nor a completed database backup is available.");
if(!backupData.pitr_enabled&&Date.now()-new Date(completed[0].inserted_at).getTime()>48*60*60*1000) fail("The latest completed database backup is older than 48 hours.");

console.log(JSON.stringify({ok:true,csp:true,anonymousEventStateBlocked:true,emailConfirmationRequired:authSettings.mailer_autoconfirm===false,retentionLastSucceededAt:job.completed_at,pitrEnabled:Boolean(backupData.pitr_enabled),latestBackupAt:completed[0]?.inserted_at??null}));

function fail(message){console.error(message);process.exit(1)}
