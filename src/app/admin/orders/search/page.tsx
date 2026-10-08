import Link from "next/link";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";
import { loadOrderSearch } from "@/lib/admin/order-search";
import { sourceAmount } from "@/lib/admin/historical-orders";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  source?: string | string[];
  offset?: string | string[];
};
type SearchSource = "all" | "native" | "imported";

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateLabel(value: string | null, timeZone: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

function nativeAmount(cents: number | null, currency: string | null): string {
  if (cents === null) return "Total unavailable";
  const amount = (cents / 100).toFixed(2);
  if (!currency) return `${amount} · currency unavailable`;
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

function statusLabel(value: string | null): string {
  if (!value) return "Unavailable";
  return value.replace(/^wc-/, "").replaceAll(/[_-]+/g, " ");
}

export default async function AdminOrderSearchPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const staff = await requireStaff(["admin"]);
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return <StoreConnectionNotice orders />;

  const params = await searchParams;
  const query = param(params?.q);
  const requestedSource = param(params?.source);
  const source = (requestedSource || "all") as SearchSource;
  const rawOffset = param(params?.offset);
  const offset = rawOffset ? Number(rawOffset) : 0;
  const hasCriteria = Boolean(query);
  const report = hasCriteria ? await loadOrderSearch(client, { query, source, offset }) : null;

  const pageQuery = new URLSearchParams();
  if (query) pageQuery.set("q", query);
  if (source !== "all") pageQuery.set("source", source);
  const pageHref = (pageOffset: number) => {
    const query = new URLSearchParams(pageQuery);
    if (pageOffset > 0) query.set("offset", String(pageOffset));
    return `/admin/orders/search?${query}`;
  };

  return <main className="admin-page admin-order-search-page">
    <div className="admin-page-heading">
      <div><p className="eyebrow">Commerce · orders</p><h1>Find an order</h1><p>Search both stores by customer name, order number, delivery postal code, or delivery city.</p></div>
      <Link className="btn btn-secondary" href="/admin/orders" prefetch={false}>All orders</Link>
    </div>

    <section className="admin-panel admin-order-search-panel" aria-label="Order search filters">
      <form action="/admin/orders/search" method="get" className="admin-order-detail-search" role="search">
        <label htmlFor="admin-order-search-query">Search orders
          <input id="admin-order-search-query" name="q" type="search" maxLength={100} defaultValue={query} placeholder="Name, order #, postal code, or city" autoComplete="off" />
        </label>
        <label htmlFor="admin-order-search-source">Store
          <select id="admin-order-search-source" name="source" defaultValue={source}>
            <option value="all">Both stores</option>
            <option value="native">New store</option>
            <option value="imported">Previous-store archive</option>
          </select>
        </label>
        <div className="admin-order-detail-search-actions">
          <button className="btn btn-gold" type="submit">Find orders</button>
          {hasCriteria && <Link href="/admin/orders/search" prefetch={false}>Clear filters</Link>}
        </div>
      </form>
      <p className="admin-orders-note">Customer names appear first. City and postal code match delivery details only; pickup orders may not have either.</p>
    </section>

    {!hasCriteria ? <section className="admin-panel admin-order-search-message"><h2>Search orders</h2><p>Enter a name, order number, delivery postal code, or delivery city to begin.</p></section> :
      !report?.connected ? <section className="admin-panel admin-order-search-message" role="alert"><h2>Order search unavailable</h2><p>{report?.message ?? "The search could not be loaded. Please try again."}</p></section> :
      <section className="admin-panel admin-order-search-results" aria-labelledby="admin-order-search-results-heading">
        <div className="admin-panel-heading"><div><p className="eyebrow">Search results</p><h2 id="admin-order-search-results-heading">Matching orders</h2></div><span>{report.total.toLocaleString("en-CA")} {report.total === 1 ? "order" : "orders"}</span></div>
        {report.message && <p className="admin-order-search-notice" role="status">{report.message}</p>}
        {report.archiveSnapshotAt && source !== "native" && <p className="admin-order-search-notice">Previous-store records come from the saved archive snapshot of {dateLabel(report.archiveSnapshotAt, "UTC")} UTC. Its payment and refund details are unverified.</p>}
        {report.rows.length ? <div className="admin-order-search-list">{report.rows.map(row => {
          const href = row.source === "native"
            ? `/admin/orders/native/${encodeURIComponent(row.orderId)}`
            : `/admin/orders?source=imported&id=${encodeURIComponent(row.orderId)}&items=1`;
          const amount = row.source === "native" ? nativeAmount(row.totalCents, row.currency) : sourceAmount(row.recordedTotal, row.currency);
          return <article className="admin-order-search-result" key={`${row.source}:${row.orderId}`}>
            <div className="admin-order-search-result-heading">
              <div><span className={`admin-order-search-source is-${row.source}`}>{row.source === "native" ? "New store" : "Previous-store archive"}</span><h3><Link href={href} prefetch={false}>Order #{row.orderNumber || row.orderId}</Link></h3><small className="admin-order-search-match">Matched {row.matchedBy === "orderNumber" ? "order number" : row.matchedBy === "postal" ? "delivery postal code" : row.matchedBy === "city" ? "delivery city" : "customer name"}</small></div>
              <div className="admin-order-search-result-total"><small>{row.source === "native" ? "Order total" : "Recorded total"}</small><strong>{amount}</strong></div>
            </div>
            <dl className="admin-order-search-result-facts">
              <div><dt>Customer</dt><dd>{row.customerName || "Name unavailable"}</dd></div>
              <div><dt>Delivery city</dt><dd>{row.deliveryCity || "Unavailable"}</dd></div>
              <div><dt>Delivery postal code</dt><dd>{row.postalCode || "Unavailable"}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel(row.status)}</dd></div>
              <div><dt>Placed</dt><dd>{dateLabel(row.placedAt, "America/Edmonton")} {row.placedAt && "· Edmonton time"}</dd></div>
            </dl>
            <Link className="admin-order-search-open" href={href} prefetch={false}>Open order →</Link>
          </article>;
        })}</div> : <p className="admin-order-search-empty">No orders match this search. Try a shorter name, a full order number, or a broader delivery location.</p>}
        {report.total > 0 && <nav className="admin-order-search-pagination" aria-label="Order search pages">
          <span>{report.rows.length ? `Showing ${(offset + 1).toLocaleString("en-CA")}–${(offset + report.rows.length).toLocaleString("en-CA")} of ${report.total.toLocaleString("en-CA")}` : `No results on this page · ${report.total.toLocaleString("en-CA")} total`}</span>
          <div>{offset > 0 && <Link className="btn btn-secondary" href={pageHref(Math.max(0, offset - 50))} prefetch={false}>Previous 50</Link>}{report.nextOffset !== null && <Link className="btn btn-secondary" href={pageHref(report.nextOffset)} prefetch={false}>Next 50 →</Link>}</div>
        </nav>}
      </section>}
  </main>;
}
