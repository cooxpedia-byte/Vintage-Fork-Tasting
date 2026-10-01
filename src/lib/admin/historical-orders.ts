/** Saved source values remain strings: no price rounding or fulfillment inference. */
export type HistoryScope = 'account' | 'owner';
export type HistoryObservation = {
  sourceId: string; key: string; value: string | null; encoding: string | null;
};
export type HistoricalGiftObservation = {
  amount: string; matchedDebit: string; amountExplained: true;
  historicalObservationOnly: true; settlementVerified: false;
  currentBalanceVerified: false; finalSourceDeltaPending: true; operational: false;
  evidenceSha256: string; observedAt: string;
};
export type HistoricalOrder = {
  sourceOrderId: string; sourceParentOrderId: string | null; type: string | null;
  status: string | null; currency: string | null; createdGmt: string | null;
  updatedGmt: string | null; total: string | null; cartTax: string | null;
  shipping: string | null; shippingTax: string | null; discount: string | null;
  discountTax: string | null; observations: HistoryObservation[];
  issues: string[]; sourceHolds: string[]; textProjectionHeld: boolean;
  giftPaymentObservationCount: number;
  arithmetic: {
    computedTotal: string | null; totalDifference: string | null;
    amountMatch: boolean | null; taxMatch: boolean | null;
    shippingMatch: boolean | null; discountMatch: boolean | null;
  } | null;
};
export type HistoricalItem = {
  sourceItemId: string; type: string | null; name: string | null;
  quantity: string | null; sourceProductId: string | null;
  sourceVariationId: string | null; nativeVariantId: string | null;
  subtotal: string | null; subtotalTax: string | null; total: string | null;
  tax: string | null; shippingCost: string | null; shippingTax: string | null;
  discount: string | null; discountTax: string | null;
  observations: HistoryObservation[]; issues: string[]; sourceHolds: string[];
  textProjectionHeld: boolean;
  giftPaymentObservation: HistoricalGiftObservation | null;
};
type HistoryEnvelope = {
  total: number; nextCursor: number | null; snapshot: 'saved-import-v1';
  operatingOwner: 'original_woo'; operational: false; completeGraph: false;
  paymentVerified: false; fulfillmentVerified: false; importedAt: string;
};
export type HistoricalOrderPage = HistoryEnvelope & {
  kind: 'orders'; identityVerified: boolean | null;
  rows: { ordinal: number; itemCount: number; data: HistoricalOrder }[];
};
export type HistoricalItemPage = HistoryEnvelope & {
  kind: 'items'; sourceOrderId: string;
  rows: { ordinal: number; data: HistoricalItem }[];
};
export type HistoricalPage = HistoricalOrderPage | HistoricalItemPage;

export const HISTORY_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache',
  Vary: 'Authorization', 'X-Robots-Tag': 'noindex, nofollow',
} as const;

export function historicalOrderQuery(url: string, scope: HistoryScope) {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some(key => !['after','id','items','attention'].includes(key)
    || params.getAll(key).length !== 1)) throw new Error('Invalid history query.');
  const after = params.get('after') ?? '0';
  const id = params.get('id');
  const items = params.get('items');
  const attention = params.get('attention');
  if (!/^(0|[1-9][0-9]{0,5})$/.test(after) || Number(after) > 152400
    || (id !== null && !/^[1-9][0-9]{0,19}$/.test(id))
    || (items !== null && (items !== '1' || id === null))
    || (attention !== null && (attention !== '1' || scope !== 'owner' || items !== null))) {
    throw new Error('Invalid history query.');
  }
  return items === '1'
    ? { rpc: 'vf_legacy_order_history_items_v1' as const,
      args: { p_scope: scope, p_order_id: id!, p_after: Number(after) } }
    : { rpc: 'vf_legacy_order_history_page_v1' as const,
      args: { p_scope: scope, p_after: Number(after), p_order_id: id, p_attention: attention === '1' } };
}

function fail(): never { throw new Error('Unexpected saved-history response.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 262144): string {
  if (typeof value !== 'string' || value.length > maximum) return fail();
  return value;
}
function optionalText(value: unknown, maximum?: number): string | null {
  return value === null ? null : text(value, maximum);
}
function id(value: unknown, zero = false): string {
  const result = text(value, 20);
  if (!(zero ? /^(0|[1-9][0-9]{0,19})$/ : /^[1-9][0-9]{0,19}$/).test(result)) return fail();
  return result;
}
function optionalId(value: unknown): string | null { return value === null ? null : id(value, true); }
function decimal(value: unknown): string | null {
  const result = optionalText(value);
  if (result !== null && !/^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(result)) return fail();
  return result;
}
function integer(value: unknown, maximum = 152400): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) return fail();
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') return fail(); return value; }
function optionalBool(value: unknown): boolean | null { return value === null ? null : bool(value); }
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return fail();
  return value;
}
function strings(value: unknown): string[] { return list(value, 500).map(entry => text(entry, 200)); }
const observationKeys = new Set([
  '_qty','_product_id','_variation_id','_line_subtotal','_line_subtotal_tax',
  '_line_total','_line_tax','cost','total_tax','discount_amount','discount_amount_tax',
  '_refunded_item_id','_reduced_stock','shipping_total_amount','shipping_tax_amount',
  'discount_total_amount','discount_tax_amount',
]);
function observations(value: unknown): HistoryObservation[] {
  return list(value, 5000).map(entry => {
    const row = object(entry);
    const key = text(row.key, 100);
    if (!observationKeys.has(key)) return fail();
    return { sourceId: id(row.sourceId), key,
      value: optionalText(row.value), encoding: optionalText(row.encoding, 30) };
  });
}
function order(value: unknown): HistoricalOrder {
  const row = object(value);
  let arithmetic: HistoricalOrder['arithmetic'] = null;
  if (row.arithmetic !== null) {
    const amounts = object(row.arithmetic);
    arithmetic = {
      computedTotal: decimal(amounts.computedTotal), totalDifference: decimal(amounts.totalDifference),
      amountMatch: optionalBool(amounts.amountMatch), taxMatch: optionalBool(amounts.taxMatch),
      shippingMatch: optionalBool(amounts.shippingMatch), discountMatch: optionalBool(amounts.discountMatch),
    };
  }
  return {
    sourceOrderId: id(row.sourceOrderId), sourceParentOrderId: optionalId(row.sourceParentOrderId),
    type: optionalText(row.type, 100), status: optionalText(row.status, 100),
    currency: optionalText(row.currency, 32), createdGmt: optionalText(row.createdGmt, 100),
    updatedGmt: optionalText(row.updatedGmt, 100), total: decimal(row.total), cartTax: decimal(row.cartTax),
    shipping: decimal(row.shipping), shippingTax: decimal(row.shippingTax),
    discount: decimal(row.discount), discountTax: decimal(row.discountTax),
    observations: observations(row.observations), issues: strings(row.issues), sourceHolds: strings(row.sourceHolds),
    textProjectionHeld: bool(row.textProjectionHeld), arithmetic,
    giftPaymentObservationCount: integer(row.giftPaymentObservationCount),
  };
}
function item(value: unknown): HistoricalItem {
  const row = object(value);
  const type = optionalText(row.type, 100);
  // Repeat SQL masking at the response boundary: PW item names are card codes.
  const name = type === 'pw_gift_card' ? 'Gift card payment'
    : type === 'coupon' ? 'Coupon discount' : optionalText(row.name);
  const nativeVariantId = optionalText(row.nativeVariantId, 36);
  if (nativeVariantId !== null && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(nativeVariantId)) return fail();
  let giftPaymentObservation: HistoricalGiftObservation | null = null;
  if (row.giftPaymentObservation !== null) {
    const gift = object(row.giftPaymentObservation);
    const amount = decimal(gift.amount), matchedDebit = decimal(gift.matchedDebit);
    const evidenceSha256 = text(gift.evidenceSha256, 64);
    if (type !== 'pw_gift_card' || amount === null || matchedDebit === null
      || !/^[0-9]+(?:\.[0-9]+)?$/.test(amount) || !/^-[0-9]+(?:\.[0-9]+)?$/.test(matchedDebit)
      || !/^[a-f0-9]{64}$/.test(evidenceSha256) || gift.amountExplained !== true
      || gift.historicalObservationOnly !== true || gift.settlementVerified !== false
      || gift.currentBalanceVerified !== false || gift.finalSourceDeltaPending !== true || gift.operational !== false) return fail();
    // Compare exact decimal strings without floating point or rounding.
    const normalized = (value: string) => value.replace(/^-/, '').replace(/^0+(?=\d)/, '')
      .replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    if (normalized(amount) === '0' || normalized(amount) !== normalized(matchedDebit)) return fail();
    giftPaymentObservation = { amount, matchedDebit, amountExplained: true, historicalObservationOnly: true,
      settlementVerified: false, currentBalanceVerified: false, finalSourceDeltaPending: true,
      operational: false, evidenceSha256, observedAt: text(gift.observedAt, 100) };
  }
  return {
    sourceItemId: id(row.sourceItemId), type, name,
    quantity: decimal(row.quantity), sourceProductId: optionalId(row.sourceProductId),
    sourceVariationId: optionalId(row.sourceVariationId), nativeVariantId,
    subtotal: decimal(row.subtotal), subtotalTax: decimal(row.subtotalTax), total: decimal(row.total),
    tax: decimal(row.tax), shippingCost: decimal(row.shippingCost), shippingTax: decimal(row.shippingTax),
    discount: decimal(row.discount), discountTax: decimal(row.discountTax),
    observations: observations(row.observations), issues: strings(row.issues), sourceHolds: strings(row.sourceHolds),
    textProjectionHeld: bool(row.textProjectionHeld),
    giftPaymentObservation,
  };
}

/** Reconstruct the allowlisted response; accidental addresses/emails never pass through. */
export function historicalOrderPage(value: unknown, maximumOrders:10|50=10): HistoricalPage {
  const page = object(value);
  if (page.snapshot !== 'saved-import-v1' || page.operatingOwner !== 'original_woo'
    || page.operational !== false || page.completeGraph !== false
    || page.paymentVerified !== false || page.fulfillmentVerified !== false) return fail();
  const nextCursor = page.nextCursor === null ? null : integer(page.nextCursor);
  if (nextCursor === 0) return fail();
  const envelope: HistoryEnvelope = {
    total: integer(page.total), nextCursor, snapshot: 'saved-import-v1', operatingOwner: 'original_woo',
    operational: false, completeGraph: false, paymentVerified: false, fulfillmentVerified: false,
    importedAt: text(page.importedAt, 100),
  };
  const rows = list(page.rows, page.kind === 'orders' ? maximumOrders : 20);
  let previous = 0;
  const ordinal = (row: Record<string, unknown>) => {
    const current = integer(row.ordinal);
    if (current <= previous) return fail();
    previous = current;
    return current;
  };
  let result: HistoricalPage;
  if (page.kind === 'orders') {
    result = { ...envelope, kind: 'orders', identityVerified: optionalBool(page.identityVerified),
      rows: rows.map(value => { const row = object(value); return {
        ordinal: ordinal(row), itemCount: integer(row.itemCount), data: order(row.data),
      }; }) };
    if (result.identityVerified === false && result.rows.length > 0) return fail();
  } else if (page.kind === 'items') {
    result = { ...envelope, kind: 'items', sourceOrderId: id(page.sourceOrderId),
      rows: rows.map(value => { const row = object(value); return { ordinal: ordinal(row), data: item(row.data) }; }) };
  } else return fail();
  if (result.total < result.rows.length || (nextCursor !== null && (!rows.length || nextCursor !== previous))) return fail();
  return result;
}

export function sourceAmount(value: string | null, currency: string | null): string {
  return value === null ? 'Unavailable in saved record' : `${currency ?? 'Currency unavailable'} ${value}`;
}
