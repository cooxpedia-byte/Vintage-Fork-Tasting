import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { loadNativeOrderDetail } from "@/lib/admin/native-order-detail";
import { OrderContact } from "@/components/admin/OrderContact";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { OrderStatusControl } from "@/components/admin/OrderStatusControl";
import { loadOrderOperations, validOrderRef } from "@/lib/admin/order-operations";
import { loadOrderEmailStatuses } from "@/lib/admin/order-email-status";
import { OrderEmailStatus } from "@/components/admin/OrderEmailStatus";
import { CustomerOrderNotes } from "@/components/admin/CustomerOrderNotes";
import { loadCustomerOrderNotes } from "@/lib/admin/customer-order-notes";
import { PrivateOrderNotes } from "@/components/admin/PrivateOrderNotes";
import { loadPrivateOrderNotes } from "@/lib/admin/private-order-notes";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = {
  paid: "Processing", processing: "Processing", fulfilled: "Completed",
  pending: "Pending", failed: "Failed", cancelled: "Cancelled",
  refunded: "Refunded", partially_refunded: "Partially refunded",
  unfulfilled: "To fulfil", returned: "Returned",
};
const label = (value: string | null) => value ? labels[value] ?? value.replaceAll("_", " ") : "Unknown";

export default async function NativeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["admin"]);
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return <StoreConnectionNotice orders />;
  const { id } = await params;
  if (!validOrderRef("native", id)) notFound();
  // Bind any action to the version before reading the details the admin reviews.
  // A later source change then rejects the action rather than using a newer fence.
  const controls = await loadOrderOperations(client, [{kind:"native",orderId:id}]);
  const emailStatus = await loadOrderEmailStatuses(client, [{kind:"native",orderId:id}]);
  let result;
  try { result = await loadNativeOrderDetail(client, id); }
  catch { notFound(); }
  if (result.state === "not_found") notFound();
  if (result.state === "error") return <main className="admin-page">
    <Link href="/admin/orders" prefetch={false}>← Back to orders</Link>
    <h1>Order details</h1><p className="admin-commerce-notice" role="alert">{result.message}</p>
    <Link className="btn btn-secondary" href={"/admin/orders/native/" + encodeURIComponent(id)} prefetch={false}>Try again</Link>
  </main>;
  const order = result.order;
  const [customerNotes, privateNotes] = await Promise.all([
    loadCustomerOrderNotes(client, "native", order.id),
    loadPrivateOrderNotes(client, "native", order.id),
  ]);
  const operation = controls.orders.get("native:"+id);
  const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: order.currency.toUpperCase() }).format(cents / 100);
  const placedAt = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Edmonton" }).format(new Date(order.placedAt));
  return <main className="admin-page admin-order-detail">
    <Link href="/admin/orders" prefetch={false}>← Back to orders</Link>
    <div className="admin-page-heading">
      <div><p className="eyebrow">New store order</p><h1>Order #{order.orderNumber}</h1><p>{placedAt} · Edmonton time</p></div>
      <OrderStatusBadge source="native" status={order.status} operation={operation}/>
    </div>
    {controls.error&&<p className="admin-commerce-notice" role="alert">{controls.error}</p>}
    {operation&&<OrderStatusControl key={id+":"+operation.revision+":"+operation.sourceVersion} order={operation} number={order.orderNumber}/>}
    <OrderEmailStatus notifications={emailStatus.notifications} error={emailStatus.error}/>
    <CustomerOrderNotes key={"native:" + order.id} kind="native" orderId={order.id} context={customerNotes.context} error={customerNotes.error}/>
    <PrivateOrderNotes key={"private:native:" + order.id} kind="native" orderId={order.id} context={privateNotes.context} error={privateNotes.error}/>
    <section className="admin-panel" aria-labelledby="order-customer-heading">
      <div className="admin-panel-heading"><h2 id="order-customer-heading">Customer &amp; delivery</h2></div>
      <OrderContact contact={order.contact} />
      {order.customerEmail && <p className="admin-order-detail-email">Order email: {order.customerEmail}</p>}
      {order.shippingMethod && <p>Delivery method: {order.shippingMethod}</p>}
    </section>
    <section className="admin-panel" aria-labelledby="order-items-heading">
      <div className="admin-panel-heading"><h2 id="order-items-heading">Items ordered</h2><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} {order.items.reduce((sum, item) => sum + item.quantity, 0)===1?"item":"items"}</span></div>
      {order.items.length ? <div className="admin-order-items-scroll"><table className="admin-order-items">
        <thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Line total</th><th scope="col">Fulfillment</th></tr></thead>
        <tbody>{order.items.map(item => <tr key={item.id}>
          <td><strong>{item.name}</strong>{item.variant && <small>{item.variant}</small>}{item.sku && <small>SKU: {item.sku}</small>}</td>
          <td>{item.quantity}</td><td>{money(item.unitAmountCents)}</td><td>{money(item.totalCents)}</td><td>{label(item.fulfillmentStatus)}</td>
        </tr>)}</tbody>
      </table></div> : <p role="status">No items were saved for this order. Review the order before fulfillment.</p>}
    </section>
    <section className="admin-panel admin-order-payment-panel" aria-labelledby="order-payment-heading">
      <div><h2 id="order-payment-heading">Payment</h2><p>{order.paymentStatus ? order.paymentStatus.replaceAll("_", " ") : "Unknown"}{order.paymentProvider ? ` · ${order.paymentProvider === "paypal" ? "PayPal" : order.paymentProvider}` : ""}</p></div>
      <dl className="admin-order-totals">
        <div><dt>Subtotal</dt><dd>{money(order.subtotalCents)}</dd></div>
        {order.discountCents > 0 && <div><dt>Discount</dt><dd>−{money(order.discountCents)}</dd></div>}
        <div><dt>Shipping</dt><dd>{money(order.shippingCents)}</dd></div>
        <div><dt>Tax</dt><dd>{money(order.taxCents)}</dd></div>
        <div className="is-total"><dt>Order total</dt><dd>{money(order.totalCents)}</dd></div>
        {order.refundedCents > 0 && <><div><dt>Refunded</dt><dd>{money(order.refundedCents)}</dd></div><div><dt>After refunds</dt><dd>{money(Math.max(0, order.totalCents - order.refundedCents))}</dd></div></>}
      </dl>
    </section>
  </main>;
}
