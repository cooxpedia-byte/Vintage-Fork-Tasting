export const orderEmailEvents = [
  {
    eventType: "customer_order_confirmed",
    label: "Order confirmation",
    audience: "Customer",
    description: "Sent after a verified payment is recorded.",
    defaults: {
      subject: "We received your Vintage Fork order #{{orderNumber}}",
      title: "Thank you. Your order is confirmed.",
      intro: "We received your payment and your order is now in our queue.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "merchant_new_order",
    label: "New order",
    audience: "Store",
    description: "Sent to the store when a paid order is ready for review.",
    defaults: {
      subject: "New online order #{{orderNumber}}",
      title: "New online order #{{orderNumber}}",
      intro: "A verified payment was recorded and this order is ready for fulfilment review.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "customer_order_completed",
    label: "Order completed",
    audience: "Customer",
    description: "Sent when an order is marked complete. The default intro adapts to pickup or shipping.",
    defaults: {
      subject: "Vintage Fork order #{{orderNumber}} is completed",
      title: "Your order is completed.",
      intro: "It will be on the way soon.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "customer_order_note",
    label: "Customer order note",
    audience: "Customer",
    description: "Sent when staff send a note from an order. The note itself stays specific to that order.",
    defaults: {
      subject: "A note about your Vintage Fork order #{{orderNumber}}",
      title: "A note about order #{{orderNumber}}",
      intro: "",
      closing: "Reply to this email if you have any questions.\nVintage Fork Tea Company",
    },
  },
  {
    eventType: "customer_order_cancelled",
    label: "Order cancelled",
    audience: "Customer",
    description: "Sent when an order is cancelled.",
    defaults: {
      subject: "Your Vintage Fork order #{{orderNumber}} was cancelled",
      title: "Your order was cancelled.",
      intro: "This order is no longer moving forward. Reply to this email if you have questions.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "merchant_order_cancelled",
    label: "Order cancelled",
    audience: "Store",
    description: "Sent to the store when an order is cancelled.",
    defaults: {
      subject: "Order #{{orderNumber}} was cancelled",
      title: "Order #{{orderNumber}} was cancelled",
      intro: "The order status changed to cancelled. Review any related customer or inventory actions.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "customer_order_refunded",
    label: "Refund update",
    audience: "Customer",
    description: "Sent when an order receives a refund update.",
    defaults: {
      subject: "Refund update for Vintage Fork order #{{orderNumber}}",
      title: "Your refund has been recorded.",
      intro: "Your order has a refund update. Your payment provider may take additional time to post it.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "merchant_order_refunded",
    label: "Refund recorded",
    audience: "Store",
    description: "Sent to the store when an order receives a refund update.",
    defaults: {
      subject: "Refund recorded for order #{{orderNumber}}",
      title: "Refund update for order #{{orderNumber}}",
      intro: "The order refund status changed. Review the order before any further fulfilment action.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "customer_shipment_booked",
    label: "Shipment booked",
    audience: "Customer",
    description: "Sent from the storefront when shipping is booked. Its existing subject says the order is complete.",
    defaults: {
      subject: "Your Vintage Fork order #{{orderNumber}} is complete",
      title: "Your order is complete.",
      intro: "Your order was made and packaged. It’s ready to head your way!",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "customer_shipment_in_transit",
    label: "Shipment in transit",
    audience: "Customer",
    description: "Sent when a shipment is on the way.",
    defaults: {
      subject: "Vintage Fork order #{{orderNumber}} is on the way",
      title: "Your tea is on the way.",
      intro: "Your shipment is now in transit.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
  {
    eventType: "customer_shipment_delivered",
    label: "Shipment delivered",
    audience: "Customer",
    description: "Sent when a carrier marks the shipment delivered.",
    defaults: {
      subject: "Vintage Fork order #{{orderNumber}} was delivered",
      title: "Your order was delivered.",
      intro: "The carrier marked your shipment as delivered. We hope you enjoy your tea.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    },
  },
] as const;

export type OrderEmailEvent = (typeof orderEmailEvents)[number]["eventType"];

export type OrderEmailTemplate = {
  eventType: OrderEmailEvent;
  enabled: boolean;
  subjectOverride: string | null;
  titleOverride: string | null;
  introOverride: string | null;
  closingOverride: string | null;
  revision: number;
  updatedAt: string | null;
};

export const orderEmailEventNames = new Set<string>(orderEmailEvents.map(({ eventType }) => eventType));

const templateFields = new Set([
  "eventType", "enabled", "subjectOverride", "titleOverride", "introOverride", "closingOverride", "revision", "updatedAt",
]);

function parseTemplate(value: unknown): OrderEmailTemplate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid email settings response.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== templateFields.size || Object.keys(row).some((key) => !templateFields.has(key))
    || typeof row.eventType !== "string" || !orderEmailEventNames.has(row.eventType)
    || typeof row.enabled !== "boolean"
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || typeof row.updatedAt !== "string" || Number.isNaN(Date.parse(row.updatedAt))) {
    throw new Error("Invalid email settings response.");
  }
  for (const [name, max] of [["subjectOverride", 180], ["titleOverride", 160], ["introOverride", 1000], ["closingOverride", 1000]] as const) {
    if (row[name] !== null && (typeof row[name] !== "string" || row[name].length > max)) throw new Error("Invalid email settings response.");
  }
  return row as OrderEmailTemplate;
}

export function parseSavedOrderEmailTemplates(value: unknown): OrderEmailTemplate[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1
    || !Array.isArray((value as { templates?: unknown }).templates)) throw new Error("Invalid email settings response.");
  const saved = (value as { templates: unknown[] }).templates;
  if (saved.length > orderEmailEvents.length) throw new Error("Invalid email settings response.");
  const rows = saved.map(parseTemplate);
  if (new Set(rows.map((row) => row.eventType)).size !== rows.length) throw new Error("Invalid email settings response.");
  return rows;
}

export function defaultOrderEmailTemplates(saved: OrderEmailTemplate[]): OrderEmailTemplate[] {
  const byEvent = new Map(saved.map((row) => [row.eventType, row]));
  return orderEmailEvents.map(({ eventType }) => byEvent.get(eventType) ?? {
    eventType, enabled: true, subjectOverride: null, titleOverride: null, introOverride: null, closingOverride: null,
    revision: 0, updatedAt: null,
  });
}

export function previewOrderEmailCopy(template: OrderEmailTemplate, orderNumber = "10482") {
  const event = orderEmailEvents.find((item) => item.eventType === template.eventType);
  if (!event) throw new Error("Unknown email event.");
  const replace = (value: string) => value.replaceAll("{{orderNumber}}", orderNumber);
  return {
    subject: replace(template.subjectOverride || event.defaults.subject),
    title: replace(template.titleOverride || event.defaults.title),
    intro: replace(template.introOverride || event.defaults.intro),
    closing: replace(template.closingOverride || event.defaults.closing),
  };
}
