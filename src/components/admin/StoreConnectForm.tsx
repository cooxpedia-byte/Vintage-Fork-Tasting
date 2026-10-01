"use client";

import { useActionState } from "react";
import { connectStore } from "@/app/admin/orders/connect/actions";

export function StoreConnectForm({email}:{email:string}) {
  const [state,action,pending] = useActionState(connectStore,{error:""});
  return <form action={action} className="admin-store-connect">
    <label htmlFor="store-email">Store administrator email</label>
    <input id="store-email" name="email" type="email" autoComplete="username" defaultValue={email} required maxLength={320}/>
    <label htmlFor="store-password">Password</label>
    <input id="store-password" name="password" type="password" autoComplete="current-password" required maxLength={1024}/>
    {state.error&&<p className="form-error" role="alert">{state.error}</p>}
    <button type="submit" className="btn btn-gold" disabled={pending}>{pending?"Connecting…":"Connect store orders"}</button>
  </form>;
}
