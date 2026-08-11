type MerchantListingRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type MerchantListingRpc = (
  name: "publish_merchant_listing",
  args: { p_card_id: string }
) => PromiseLike<MerchantListingRpcResult>;

export async function publishMerchantListing(
  rpc: MerchantListingRpc,
  cardId: string
): Promise<unknown> {
  const { data, error } = await rpc("publish_merchant_listing", { p_card_id: cardId });
  if (error) throw new Error(error.message || "The listing request failed.");
  return data;
}
