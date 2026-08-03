import Link from "next/link";
export default function NotFound() { return <main className="page-shell"><div className="empty-state"><h1>That page is not at the table.</h1><p>The link may be old or outside your account.</p><Link className="btn btn-primary btn-attention" href="/dashboard">Return home</Link></div></main>; }
