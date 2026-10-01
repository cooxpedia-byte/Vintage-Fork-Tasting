import Link from "next/link";

export function StoreConnectionNotice({orders=false}:{orders?:boolean}) {
  return <main className="admin-page">
    <div className="admin-page-heading"><div><p className="eyebrow">Commerce</p><h1>{orders?"Orders":"Your store at a glance."}</h1></div></div>
    <section className="admin-panel"><h2>Connect your store account</h2>
      <p>Sign in with your new store administrator account to see new purchases and migrated orders in this dashboard.</p>
      <Link className="btn btn-gold" href="/admin/orders/connect" prefetch={false}>Sign in to store</Link>
    </section>
  </main>;
}
