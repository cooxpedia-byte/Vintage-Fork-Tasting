import { createClient } from "@supabase/supabase-js";

const required=["NEXT_PUBLIC_SITE_URL","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","AUTH_TEST_EMAIL"];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length){console.error(`Missing authentication-email verification variables: ${missing.join(", ")}`);process.exit(1)}

const site=new URL(process.env.NEXT_PUBLIC_SITE_URL);
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,flowType:"pkce"}});
const redirectTo=new URL("/auth/callback?next=%2Freset-password%3Fnext%3D%252Fdashboard",site).toString();
const {error}=await client.auth.resetPasswordForEmail(process.env.AUTH_TEST_EMAIL,{redirectTo});
if(error){console.error(`Supabase rejected the recovery-email request: ${error.message}`);process.exit(1)}
console.log("Recovery email accepted by Supabase. Open the test inbox, follow the link, save a temporary password, sign in, and only then record AUTH_EMAIL_VERIFIED_AT.");
