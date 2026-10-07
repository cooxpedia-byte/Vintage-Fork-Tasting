import Link from "next/link";
import type { AdminOrder, CommerceOverview } from "@/lib/admin/commerce";
import { OrderContact } from "@/components/admin/OrderContact";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { OrderStatusControl } from "@/components/admin/OrderStatusControl";
import type { OrderOperation } from "@/lib/admin/order-operations";
import { SALES_PERIODS, type SalesPeriod } from "@/lib/admin/sales-periods";
import { productEditorUrl } from "@/lib/admin/store-tools";

const storefront = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "https://www.vintagefork.ca";

function money(cents: number, currency = "cad") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function orderDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone:"America/Edmonton" }).format(new Date(value));
}

function archiveDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function OrderRows({ orders, full = false, operations }: { orders: AdminOrder[]; full?: boolean; operations?:Map<string,OrderOperation> }) {
  if (!orders.length) return <div className="admin-commerce-empty"><strong>No orders to show yet</strong><span>New web and subscription orders will appear here.</span></div>;
  return (
    <div className="admin-order-table" role="table" aria-label="Recent orders">
      {orders.map((order) => {
        const operation=operations?.get("native:"+order.id)??order.operation;
        return (
        <div className={`admin-order-row ${full ? "is-full" : ""} ${order.source === "pos" ? "is-in-store" : ""}`} role="row" key={order.id}>
          <div role="cell"><Link className="admin-order-number-link" href={"/admin/orders/native/"+encodeURIComponent(order.id)} prefetch={false} aria-label={`Open order #${order.orderNumber}`}><strong>#{order.orderNumber}</strong></Link><small>{orderDate(order.placedAt)}</small></div>
          <div role="cell"><span>{order.customerEmail}</span><small>{order.source === "pos" ? "In store purchase" : order.source.replaceAll("_", " ")}</small></div>
          {full && <div role="cell"><small>Payment</small><span>{order.paymentStatus?.replaceAll("_", " ") || "Unknown"}</span></div>}
          <div role="cell"><OrderStatusBadge source="native" status={order.status} operation={operation}/></div>
          <strong role="cell">{money(order.totalCents, order.currency)}</strong>
          {full && <div className="admin-order-contact-cell" role="cell"><OrderContact contact={order.contact}/></div>}
          {full&&<div role="cell" className="admin-order-actions"><Link className="btn btn-gold" href={"/admin/orders/native/"+encodeURIComponent(order.id)} prefetch={false}>Open order</Link>{operation&&<OrderStatusControl key={order.id+":"+operation.revision+":"+operation.sourceVersion} order={operation} number={order.orderNumber}/>}</div>}
        </div>
      );})}
    </div>
  );
}

export function CommerceAdminOverview({ commerce, salesPeriod }: { commerce: CommerceOverview; salesPeriod: SalesPeriod }) {
  const historicalEstimate = salesPeriod === "last_year";
  const salesAvailable = commerce.salesConnected && (!historicalEstimate || commerce.salesSource === "native-and-imported-estimate");
  const selectedPeriod = SALES_PERIODS.find(period => period.value === salesPeriod)?.label ?? "Month to date";
  const breakdown = commerce.revenueBreakdown;
  const salesDefinition = historicalEstimate
    ? "Previous-store completed and processing order totals before refunds; payments and refunds are unverified."
    : "Paid order totals less refunds, including tax and shipping.";
  const averageOrderValue = salesAvailable && commerce.orderCount > 0
    ? money(commerce.netSalesCents / commerce.orderCount, commerce.currency)
    : "—";
  const cards = [
    { label: "Orders to fulfil", value: commerce.fulfilmentCount ?? "—", detail: "New purchases · open imported orders also available in the queue", href: "/admin/orders?status=fulfilment" },
    { label: "Commerce customers", value: commerce.customersConnected ? commerce.customerCount : "—", detail: "New-store customer records", href: "/admin/accounts" },
    { label: "Active subscriptions", value: commerce.subscriptionsConnected ? commerce.subscriptionCount : "—", detail: "Active, trialing or past due", href: "/admin/store" },
  ];

  return (
    <main className="admin-page admin-overview-page">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Commerce</p>
          <h1>Your store at a glance.</h1>
          <p>Sales, orders, customers, subscriptions and inventory lead the daily staff workspace.</p>
        </div>
        <div className="admin-heading-actions">
          <a className="btn btn-secondary" href={productEditorUrl} rel="noreferrer" target="_blank">Edit products ↗</a>
          <Link className="btn btn-secondary" href="/admin/orders" prefetch={false}>Review orders</Link>
          <a className="btn btn-gold" href={`${storefront}/admin/pos/`} rel="noreferrer" target="_blank">Open POS ↗</a>
        </div>
      </div>

      {!commerce.connected && (
        <div className="admin-commerce-notice" role="status">
          <div><strong>New-store order data could not be loaded</strong><span>This does not mean there are no orders. Imported orders have a separate connection.</span></div>
          <Link href="/admin/orders?source=imported" prefetch={false}>View imported orders</Link>
        </div>
      )}

      <form action="/admin" method="get" className="admin-sales-filter admin-sales-filter-toolbar">
        <label htmlFor="admin-sales-period">Sales period</label>
        <div>
          <select id="admin-sales-period" name="salesPeriod" defaultValue={salesPeriod}>
            {SALES_PERIODS.map(period => <option value={period.value} key={period.value}>{period.label}</option>)}
          </select>
          <button type="submit">Apply</button>
        </div>
      </form>

      <section className="admin-kpi-grid admin-kpi-grid--overview" aria-label="Commerce summary">
        <article className="admin-kpi-card admin-sales-card">
          <span>{historicalEstimate ? "Recorded order total estimate" : "Net sales"}</span>
          <strong>{salesAvailable ? money(commerce.netSalesCents, commerce.currency) : "—"}</strong>
          <small>{salesAvailable ? `${commerce.orderCount.toLocaleString("en-CA")} ${historicalEstimate ? "recorded" : "paid"} orders · ${selectedPeriod}` : selectedPeriod}</small>
          <p className="admin-sales-definition">{salesDefinition}</p>
          {salesAvailable && historicalEstimate && <p className="admin-sales-source">Includes previous-store orders.</p>}
          {breakdown.historicalRequested && !historicalEstimate && <p className="admin-sales-source">New-store sales only. The previous-store estimate is below.</p>}
          {commerce.salesMessage && <p className={salesAvailable ? "admin-sales-source" : "admin-sales-unavailable"} role={salesAvailable ? undefined : "alert"}>{commerce.salesMessage}</p>}
          {!salesAvailable && !commerce.salesMessage && <p className="admin-sales-unavailable" role="alert">Sales total is temporarily unavailable.</p>}
          <Link href="/admin/orders" prefetch={false} className="admin-sales-orders-link">View all orders →</Link>
        </article>
        <article className="admin-kpi-card admin-aov-card">
          <span>{historicalEstimate ? "Average recorded order value estimate" : "Average order value (AOV)"}</span>
          <strong>{averageOrderValue}</strong>
          <small>{selectedPeriod} · {salesAvailable ? `${commerce.orderCount.toLocaleString("en-CA")} ${historicalEstimate ? "recorded" : "paid"} orders` : "Sales unavailable"}</small>
          <p>{salesAvailable && commerce.orderCount === 0
            ? `No ${historicalEstimate ? "recorded" : "paid"} orders in this period.`
            : historicalEstimate
              ? "Recorded total per completed or processing order, before unverified refunds."
              : "Net sales per paid order, including tax and shipping, after refunds."}</p>
        </article>
        {cards.map((card) => (
          <Link className="admin-kpi-card" href={card.href} key={card.label} prefetch={false}>
            <span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}<b aria-hidden="true">→</b></small>
          </Link>
        ))}
      </section>

      <section className="admin-panel admin-revenue-panel" aria-labelledby="admin-revenue-heading">
        <div className="admin-panel-heading">
          <div><p className="eyebrow">{selectedPeriod}</p><h2 id="admin-revenue-heading">Revenue breakdown</h2></div>
        </div>
        <p className="admin-revenue-intro">See merchandise, tax, shipping and refunds separately, with the total for the selected sales period.</p>
        <div className="admin-revenue-sources">
          <article className="admin-revenue-source">
            <h3>New-store sales</h3>
            <p>{breakdown.native ? `${breakdown.native.orderCount.toLocaleString("en-CA")} settled orders` : "Breakdown unavailable"}</p>
            {breakdown.native ? (
              <dl className="admin-revenue-rows">
                <div><dt>Merchandise after discounts</dt><dd>{money(breakdown.native.merchandiseCents, commerce.currency)}</dd></div>
                <div><dt>Tax charged (GST/HST)</dt><dd>{money(breakdown.native.taxCents, commerce.currency)}</dd></div>
                <div><dt>Shipping charged</dt><dd>{money(breakdown.native.shippingCents, commerce.currency)}</dd></div>
                <div><dt>Less refunds</dt><dd>{money(breakdown.native.refundsCents ? -breakdown.native.refundsCents : 0, commerce.currency)}</dd></div>
                <div className="admin-revenue-net"><dt>Net revenue, including tax and shipping</dt><dd>{money(breakdown.native.totalCents, commerce.currency)}</dd></div>
              </dl>
            ) : <p className="admin-revenue-unavailable" role="alert">New-store figures are temporarily unavailable.</p>}
          </article>
          {breakdown.historicalRequested && (
            <article className="admin-revenue-source is-estimate">
              <h3>Previous-store recorded estimate</h3>
              <p>{breakdown.historicalEstimate ? `${breakdown.historicalEstimate.orderCount.toLocaleString("en-CA")} completed or processing orders` : "Estimate unavailable"}</p>
              {breakdown.historicalEstimate ? (
                <>
                  <p>Saved archive snapshot: {archiveDate(breakdown.historicalEstimate.snapshotAt)} UTC</p>
                  <dl className="admin-revenue-rows">
                    <div><dt>Merchandise after discounts</dt><dd>{money(breakdown.historicalEstimate.merchandiseCents, commerce.currency)}</dd></div>
                    <div><dt>Tax recorded (GST/HST)</dt><dd>{money(breakdown.historicalEstimate.taxCents, commerce.currency)}</dd></div>
                    <div><dt>Shipping recorded</dt><dd>{money(breakdown.historicalEstimate.shippingCents, commerce.currency)}</dd></div>
                    <div><dt>Refunds</dt><dd>—</dd></div>
                    <div className="admin-revenue-net"><dt>Recorded order total estimate</dt><dd>{money(breakdown.historicalEstimate.recordedTotalCents, commerce.currency)}</dd></div>
                  </dl>
                  {breakdown.historicalEstimate.excludedOrderCount > 0 && <p className="admin-revenue-note">{breakdown.historicalEstimate.excludedOrderCount.toLocaleString("en-CA")} archived orders could not be included in this estimate.</p>}
                </>
              ) : <p className="admin-revenue-unavailable" role="alert">A previous-store estimate is unavailable for this period.</p>}
            </article>
          )}
        </div>
        {breakdown.historicalRequested && (
          <div className="admin-revenue-combined">
            <span>Combined recorded estimate<small>New-store net revenue + previous-store recorded order total</small></span>
            <strong>{breakdown.combinedEstimateCents === null ? "—" : money(breakdown.combinedEstimateCents, commerce.currency)}</strong>
          </div>
        )}
        <p className="admin-revenue-note">Tax and shipping show charges before refunds because refund records do not split those amounts.</p>
        {breakdown.historicalRequested && <p className="admin-revenue-note">The saved previous-store archive may omit later activity. Its payments and refunds are unverified, so the combined figure is an estimate before any unknown previous-store refunds.</p>}
        {breakdown.message && <p className="admin-revenue-unavailable" role="alert">{breakdown.message}</p>}
      </section>

      <div className="admin-commerce-workspace">
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Last 30 days</p><h2>Recent orders</h2></div><Link href="/admin/orders" prefetch={false}>View all →</Link></div>
          {commerce.ordersConnected ? <OrderRows orders={commerce.recentOrders.slice(0, 6)} /> : <p role="alert">Order data is temporarily unavailable.</p>}
        </section>

        <aside className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Stock watch</p><h2>Inventory attention</h2></div><a href={productEditorUrl} rel="noreferrer" target="_blank">Products ↗</a></div>
          {!commerce.inventoryConnected ? <p>Inventory data is temporarily unavailable.</p> : commerce.inventoryAlerts.length ? (
            <div className="admin-inventory-list">
              {commerce.inventoryAlerts.slice(0, 5).map((item) => <article key={item.id}><div><strong>{item.productName}</strong><small>{item.variantLabel} · {item.sku}</small></div><span className={item.quantity === 0 ? "is-empty" : ""}>{item.quantity} left</span></article>)}
            </div>
          ) : <div className="admin-side-empty"><span>✓</span><strong>No low-stock products</strong><small>Tracked inventory is above its alert threshold.</small></div>}
        </aside>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-panel admin-attention-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Commerce queue</p><h2>Keep the store moving</h2></div><span className="chip chip-warning">Daily</span></div>
          <div className="admin-action-list">
            <Link href="/admin/orders?status=fulfilment" prefetch={false}><span className="admin-action-icon">▣</span><span><strong>Review orders for fulfillment</strong><small>New purchases and imported open orders</small></span><b>Open →</b></Link>
            <Link href="/admin/orders?source=imported" prefetch={false}><span className="admin-action-icon">▣</span><span><strong>All imported orders</strong><small>Browse records and items saved during migration</small></span><b>Open →</b></Link>
            <Link href="/admin/product-sales" prefetch={false}><span className="admin-action-icon">▤</span><span><strong>Product units sold</strong><small>Search sales by product, period and variation</small></span><b>Open →</b></Link>
            <a href={productEditorUrl} rel="noreferrer" target="_blank"><span className="admin-action-icon">▦</span><span><strong>Edit products and inventory</strong><small>{commerce.productCount} active · {commerce.draftProductCount} draft products</small></span><b>Open ↗</b></a>
            <Link href="/admin/gold-leaves" prefetch={false}><span className="admin-action-icon">◆</span><span><strong>Manage customer rewards</strong><small>Award Gold Leaves from the protected loyalty ledger</small></span><b>Open →</b></Link>
          </div>
        </section>

        <aside className="admin-panel admin-quick-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Shortcuts</p><h2>Quick actions</h2></div></div>
          <Link href="/admin/orders" prefetch={false}>Find an order <span>⌕</span></Link>
          <Link href="/admin/accounts" prefetch={false}>Find a customer <span>♙</span></Link>
          <Link href="/admin/gold-leaves" prefetch={false}>Give Gold Leaves <span>◆</span></Link>
          <a href={productEditorUrl} rel="noreferrer" target="_blank">Edit products <span>↗</span></a>
        </aside>
      </div>
    </main>
  );
}

export { OrderRows };
