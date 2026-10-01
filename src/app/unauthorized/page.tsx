import Link from "next/link";

export default function Unauthorized() {
  return <main className="page-shell" id="main-content">
    <div className="empty-state">
      <h1>This account does not have access to that area.</h1>
      <p>Your sign-in is valid, but order management requires an administrator account. Other assigned staff areas remain available to hosts.</p>
      <Link className="btn btn-primary btn-attention" href="/admin/login?next=%2Fadmin%2Forders" prefetch={false}>Sign in with a different staff account</Link>
      <Link className="btn btn-secondary" href="/dashboard">Open customer dashboard</Link>
    </div>
  </main>;
}
