import type { CommerceOverview, RevenueComponents } from "@/lib/admin/commerce";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function AdminTodaySales({ sales }: { sales: CommerceOverview["todaySales"] }) {
  const available = sales.connected && sales.channels !== null;
  const date = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "short", day: "numeric", timeZone: "America/Edmonton",
  }).format(new Date(sales.startUtc));
  const cards = [
    { label: "Daily total", total: sales.totalCents, orders: sales.orderCount, detail: "All sales channels" },
    { label: "In-store sales", total: sales.channels?.inStore.totalCents, orders: sales.channels?.inStore.orderCount, detail: "Cash and card POS purchases" },
    { label: "Online sales", total: sales.channels?.online.totalCents, orders: sales.channels?.online.orderCount, detail: "Web purchases and subscriptions" },
  ];
  if (sales.channels && sales.channels.unclassified.orderCount > 0) {
    cards.push({ label: "Unclassified sales", total: sales.channels.unclassified.totalCents, orders: sales.channels.unclassified.orderCount, detail: "Included in the daily total" });
  }
  return (
    <section className="admin-today-sales" aria-labelledby="admin-today-sales-heading">
      <div className="admin-panel-heading">
        <div><p className="eyebrow">{date} · Edmonton time</p><h2 id="admin-today-sales-heading">Today’s sales</h2></div>
      </div>
      <p className="admin-revenue-intro">Today’s totals stay visible for every sales period. Paid sales after refunds, including tax and shipping.</p>
      <div className="admin-kpi-grid admin-kpi-grid--today">
        {cards.map(card => (
          <article className="admin-kpi-card admin-today-sales-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{available && card.total !== undefined ? money(card.total, sales.currency) : "—"}</strong>
            <small>{available ? `${card.orders?.toLocaleString("en-CA")} paid orders · Today` : "Today · Sales unavailable"}</small>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
      {!available && <p className="admin-sales-unavailable" role="alert">{sales.message || "Today’s sales are temporarily unavailable."}</p>}
      {available && sales.channels!.unclassified.orderCount > 0 && <p className="admin-revenue-note">Some orders do not have a recognized sales channel. They are shown separately and included in the daily total.</p>}
    </section>
  );
}

export function AdminSalesChannels({ commerce, selectedPeriod }: { commerce: CommerceOverview; selectedPeriod: string }) {
  const channels = commerce.salesChannels;
  const total = commerce.revenueBreakdown.native;
  const columns = channels && total ? [
    { label: "In-store", values: channels.inStore },
    { label: "Online", values: channels.online },
    ...(channels.unclassified.orderCount > 0 ? [{ label: "Unclassified", values: channels.unclassified }] : []),
    { label: "Total", values: total },
  ] : null;
  const rows: { label: string; key: keyof RevenueComponents; negative?: boolean; count?: boolean }[] = [
    { label: "Merchandise after discounts", key: "merchandiseCents" },
    { label: "Tax charged (GST/HST)", key: "taxCents" },
    { label: "Shipping charged", key: "shippingCents" },
    { label: "Less refunds", key: "refundsCents", negative: true },
    { label: "Net sales, including tax and shipping", key: "totalCents" },
    { label: "Paid orders", key: "orderCount", count: true },
  ];
  return (
    <section className="admin-panel admin-sales-channels-panel" aria-labelledby="admin-sales-channels-heading">
      <div className="admin-panel-heading"><div><p className="eyebrow">New-store sales · {selectedPeriod}</p><h2 id="admin-sales-channels-heading">Sales by channel</h2></div></div>
      <p className="admin-revenue-intro">In-store includes cash and card POS purchases. Online includes web purchases and subscriptions. Previous-store estimates are shown separately below.</p>
      {columns ? (
        <div className="admin-sales-channel-scroll" tabIndex={0} role="region" aria-label="Sales by channel table">
          <table className="admin-sales-channel-table">
            <caption>New-store sales by channel · {selectedPeriod}</caption>
            <thead><tr><th scope="col">Sales breakdown</th>{columns.map(column => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr className={row.key === "totalCents" ? "admin-sales-channel-total" : undefined} key={row.key}>
              <th scope="row">{row.label}</th>
              {columns.map(column => {
                const value = column.values[row.key];
                return <td key={column.label}>{row.count ? value.toLocaleString("en-CA") : money(row.negative && value ? -value : value, commerce.currency)}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      ) : <p className="admin-revenue-unavailable" role="alert">Sales by channel are temporarily unavailable for this period.</p>}
      {channels && channels.unclassified.orderCount > 0 && <p className="admin-revenue-note">Some orders do not have a recognized sales channel. They are shown separately and included in the total.</p>}
      <p className="admin-revenue-note">Refunds reduce sales in the original order’s period. Tax and shipping show charges before refunds.</p>
    </section>
  );
}
