import Link from "next/link";
import { Brand } from "@/components/Brand";
import { FeedbackToggle } from "@/components/InterfaceFeedback";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const staff = profile?.role === "host" || profile?.role === "admin";

  return <header className="site-header"><div className="site-header-inner">
    <Brand href={staff ? "/admin" : "/dashboard"} prefetch={staff ? false : undefined} />
    <nav className="site-nav" aria-label="Primary">
      <Link href="/dashboard">My cellar</Link>
      {staff && <><Link href="/admin" prefetch={false}>Events</Link><Link href="/admin/teas" prefetch={false}>Teas</Link></>}
      <FeedbackToggle />
      {user ? <Link className="keep-mobile" href="/logout" prefetch={false}>Sign out</Link> : <Link className="keep-mobile" href="/login">Sign in</Link>}
    </nav>
  </div></header>;
}
