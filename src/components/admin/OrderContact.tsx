import { hasPhysicalAddress, samePhysicalAddress, type OrderAddress, type OrderContact as Contact } from "@/lib/admin/order-contact";

function AddressLines({ address }: { address: OrderAddress }) {
  const locality = [address.city, address.region, address.postalCode].filter(Boolean).join(" · ");
  return <>
    {address.company && <div>{address.company}</div>}
    <div>{address.line1 || "Street address unavailable"}</div>
    {address.line2 && <div>{address.line2}</div>}
    {locality && <div>{locality}</div>}
    {address.country && <div>{address.country}</div>}
  </>;
}

export function OrderContact({ contact }: { contact?: Contact | null }) {
  if (!contact) return <div className="admin-order-contact"><p>Customer details unavailable.</p></div>;
  const billing = contact.billing, shipping = contact.shipping;
  return <div className="admin-order-contact" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1rem", width: "100%" }}>
    <div>
      <strong>Placed by</strong>
      {contact.billingAmbiguous ? <div>Customer details need review: conflicting saved values.</div> : <>
        <div>{billing?.name || "Customer name unavailable"}</div>
        {billing?.email && <div>{billing.email}</div>}
        {billing?.phone && <div>{billing.phone}</div>}
      </>}
    </div>
    {contact.pickup ? <div><strong>Store pickup</strong><div>No delivery address required.</div></div> : <div>
      <strong>Ship to</strong>
      {contact.shippingAmbiguous ? <div>Shipping address needs review: conflicting saved values.</div> : shipping ? <>
        <div>{shipping.name || "Recipient name unavailable"}</div>
        {hasPhysicalAddress(shipping) ? <AddressLines address={shipping}/> : <div>Shipping address unavailable.</div>}
        {shipping.phone && <div>{shipping.phone}</div>}
      </> : <div>Shipping address unavailable.</div>}
    </div>}
    {contact.billingAmbiguous ? null : billing && hasPhysicalAddress(billing)
      && (contact.pickup || contact.shippingAmbiguous || !samePhysicalAddress(billing, shipping)) && <div>
      <strong>Billing address</strong><AddressLines address={billing}/>
    </div>}
  </div>;
}
