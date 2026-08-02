"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";

export function SignupForm() {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage("");const supabase=createClient();const {error}=await supabase.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:`${window.location.origin}/auth/callback?next=/dashboard`}});setBusy(false);setMessage(error?.status===429?"Please wait a few seconds before trying again.":error?error.message:"Check your email to verify the account, then your tea cellar will open.");}
  return <main className="auth-page" id="main-content"><section className="auth-card"><Brand /><p className="eyebrow">Customer dashboard</p><h1 className="page-title">Start your tea cellar</h1><p className="page-lede">Keep your tasting history, Passport stamps and saved teas together.</p>{message&&<div className={message.startsWith("Check")?"notice success":"form-error"}>{message}</div>}<form onSubmit={submit} style={{marginTop:20}}><div className="field"><label htmlFor="signup-name">Your name</label><input className="input" id="signup-name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label htmlFor="signup-email">Email</label><input className="input" id="signup-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label htmlFor="signup-password">Password</label><input className="input" id="signup-password" type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/><span className="help">Use at least 8 characters.</span></div><button className="btn btn-primary" style={{width:"100%"}} disabled={busy}>{busy?"Creating…":"Create My Account"}</button></form><p className="help">Already have an account? <Link href="/login">Sign in</Link>.</p></section></main>;
}
