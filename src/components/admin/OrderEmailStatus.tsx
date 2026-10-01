import type { OrderEmailNotification } from "@/lib/admin/order-email-status";

const events = [
  { eventType: "customer_order_confirmed", label: "Order confirmation" },
  { eventType: "customer_order_completed", label: "Order completed" },
] as const;

function state(status: OrderEmailNotification["status"]) {
  if (status === "sent") return { label: "Sent", className: "admin-order-status is-success" };
  if (status === "pending" || status === "processing") return { label: "Queued", className: "admin-order-status is-warning" };
  return { label: "Needs attention", className: "admin-order-status is-danger" };
}

export function OrderEmailStatus({ notifications, error }: { notifications: OrderEmailNotification[]; error: string | null }) {
  const customer = notifications.filter((row) => row.recipientKind === "customer");
  return <section className="admin-panel" aria-labelledby="customer-email-status-heading">
    <div className="admin-panel-heading">
      <div><p className="eyebrow">Email activity</p><h2 id="customer-email-status-heading">Customer emails</h2></div>
    </div>
    {error ? <p className="admin-commerce-notice" role="alert">{error}</p> : <>
      <div className="admin-order-actions">
        {events.map((event) => {
          const notification = customer.find((row) => row.eventType === event.eventType);
          const display = notification ? state(notification.status) : null;
          return <div className="admin-order-state" key={event.eventType}>
            <strong>{event.label}</strong>
            {display
              ? <span className={display.className} title={notification?.status === "sent" ? "The email provider accepted this message. Inbox delivery is not guaranteed." : undefined}>{display.label}</span>
              : <span className="admin-order-status is-neutral">No record</span>}
          </div>;
        })}
      </div>
      <p className="admin-orders-note">Sent means the email provider accepted the message. It does not guarantee delivery to the customer&apos;s inbox. An event may have no record before completion or for an older email.</p>
    </>}
  </section>;
}
