export type OrderAddress = {
  name: string | null;
  company: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
};

export type OrderContact = {
  billing: OrderAddress | null;
  shipping: OrderAddress | null;
  billingAmbiguous: boolean;
  shippingAmbiguous: boolean;
  pickup: boolean;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum = 320): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  // Do not silently truncate an address into a different delivery destination.
  return cleaned && cleaned.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)
    ? cleaned : null;
}

function readAddress(value: unknown): { address: OrderAddress | null; ambiguous: boolean } {
  const outer = object(value);
  if (!outer) return { address: null, ambiguous: false };
  const nested = object(outer.address);
  let ambiguous = false;
  function field(keys: string[], maximum = 320, physical = false) {
    const sources = physical && nested ? [nested, outer!] : [outer!];
    const values = [...new Set(sources.flatMap(source => keys.map(key => text(source[key], maximum))).filter((entry): entry is string => entry !== null))];
    if (values.length > 1) ambiguous = true;
    return values[0] ?? null;
  }
  const address: OrderAddress = {
    name: field(["name"]),
    company: field(["company"]),
    line1: field(["line1"], 500, true),
    line2: field(["line2"], 500, true),
    city: field(["city"], 200, true),
    region: field(["province", "state", "region"], 200, true),
    postalCode: field(["postalCode", "postal_code"], 32, true),
    country: field(["country"], 100, true),
    email: field(["email"]),
    phone: field(["phone"], 80),
  };
  return { address: Object.values(address).some(entry => entry !== null) ? address : null, ambiguous };
}

/** Read saved order snapshots only; never substitute a current customer profile. */
export function nativeOrderContact(billingUnknown: unknown, shippingUnknown: unknown, methodUnknown: unknown): OrderContact {
  const billing = readAddress(billingUnknown), shipping = readAddress(shippingUnknown);
  const method = text(methodUnknown);
  return {
    billing: billing.address,
    shipping: shipping.address,
    billingAmbiguous: billing.ambiguous,
    shippingAmbiguous: shipping.ambiguous,
    pickup: method !== null && /\b(?:local[ _-]?)?pick[ _-]?up\b/i.test(method),
  };
}

export function hasPhysicalAddress(address: OrderAddress | null): boolean {
  return Boolean(address && [address.line1, address.line2, address.city, address.region, address.postalCode, address.country].some(Boolean));
}

export function samePhysicalAddress(left: OrderAddress | null, right: OrderAddress | null): boolean {
  if (!hasPhysicalAddress(left) || !hasPhysicalAddress(right)) return false;
  const fields = ["company", "line1", "line2", "city", "region", "postalCode", "country"] as const;
  return fields.every(key => left![key] === right![key]);
}
