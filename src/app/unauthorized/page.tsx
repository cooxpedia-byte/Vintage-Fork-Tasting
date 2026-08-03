import Link from "next/link";
export default function Unauthorized() { return <main className="page-shell" id="main-content"><div className="empty-state"><h1>You do not have access to that surface.</h1><p>Your sign-in is valid, but this route requires a host or administrator role.</p><Link className="btn btn-primary btn-attention" href="/dashboard">Open customer dashboard</Link></div></main>; }
