"use client";

import { useMemo, useState } from "react";
import { TastingCardPresentation } from "@/components/tea-lab/TastingCardDialog";
import { createClient } from "@/lib/supabase/browser";
import { cardForPassportSeal, type PassportSeal } from "@/lib/tea-lab/passport";
import { publishMerchantListing } from "@/lib/tea-merchant";
import {
  mapLoyaltySummary,
  mapMerchantCards,
  mapMerchantListings,
  type LoyaltySummary,
  type MerchantCard,
  type MerchantListing
} from "@/lib/loyalty";

type TeaMerchantProps = {
  seals: PassportSeal[];
  initialSummary: LoyaltySummary | null;
  initialCards: MerchantCard[];
  initialListings: MerchantListing[];
  onReturnToCellar(): void;
};

export function TeaMerchant({ seals, initialSummary, initialCards, initialListings, onReturnToCellar }: TeaMerchantProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [cards, setCards] = useState(initialCards);
  const [listings, setListings] = useState(initialListings);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(() => new Set());
  const [shieldedCards, setShieldedCards] = useState<Set<string>>(
    () => new Set(seals.filter(seal => cardForPassportSeal(seal).sealClass !== null).map(seal => seal.id))
  );
  const [purchased, setPurchased] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const ownListingIds = useMemo(() => new Set(cards.flatMap(card => card.listingId ? [card.listingId] : [])), [cards]);
  const merchantCardsBySourceId = useMemo(() => new Map(cards.map(card => [card.cardId, card])), [cards]);
  const balance = summary?.pointsBalance ?? 0;

  function toggleFlippedCard(id: string) {
    setFlippedCards(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function setCardShielded(id: string, shielded: boolean) {
    setShieldedCards(current => {
      const next = new Set(current);
      if (shielded) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function refreshMerchant() {
    const supabase = createClient();
    const [summaryResult, cardsResult, marketResult] = await Promise.all([
      supabase.rpc("get_my_loyalty_summary"),
      supabase.rpc("get_my_merchant_cards"),
      supabase.rpc("get_merchant_market")
    ]);
    if (!summaryResult.error) setSummary(mapLoyaltySummary(summaryResult.data?.[0]));
    if (!cardsResult.error) setCards(mapMerchantCards(cardsResult.data));
    if (!marketResult.error) setListings(mapMerchantListings(marketResult.data));
    if (cardsResult.error || marketResult.error) {
      setNotice("The listing was saved, but Tea Merchant could not refresh every market detail yet.");
    }
  }

  async function publishCard(card: MerchantCard) {
    setBusy(card.cardId);
    setNotice("");
    try {
      const supabase = createClient();
      const listingId = await publishMerchantListing((name, args) => supabase.rpc(name, args), card.cardId);
      setCards(current => current.map(item => item.cardId === card.cardId
        ? {
          ...item,
          listingId: typeof listingId === "string" ? listingId : item.listingId,
          listingStatus: "active"
        }
        : item));
      setNotice(`${card.teaName} is now listed in the Tea Merchant market.`);
      await refreshMerchant();
    } catch (error) {
      const reason = error instanceof Error && error.message
        ? ` ${error.message}`
        : "";
      setNotice(`That card could not be listed.${reason} Your Tea Cellar was not changed.`);
    } finally {
      setBusy(null);
    }
  }

  async function setPaused(card: MerchantCard, paused: boolean) {
    if (!card.listingId) return;
    setBusy(card.cardId);
    setNotice("");
    const { error } = await createClient().rpc("set_merchant_listing_status", {
      p_listing_id: card.listingId,
      p_status: paused ? "paused" : "active"
    });
    if (error) setNotice("That listing could not be updated. Please try again.");
    else await refreshMerchant();
    setBusy(null);
  }

  async function purchaseStudyCopy(listing: MerchantListing) {
    if (purchased.has(listing.listingId) || ownListingIds.has(listing.listingId)) return;
    setBusy(listing.listingId);
    setNotice("");
    const { data, error } = await createClient().rpc("purchase_study_copy", { p_listing_id: listing.listingId });
    if (error) {
      setNotice(error.message.toLowerCase().includes("insufficient")
        ? "You do not have enough Gold Leaves for this Study Copy."
        : "The Study Copy could not be added. Your Gold Leaves were not changed.");
    } else {
      const result = Array.isArray(data) ? data[0] : data;
      setSummary(current => current ? { ...current, pointsBalance: Number(result?.remaining_balance ?? current.pointsBalance - listing.leafPrice) } : current);
      setPurchased(current => new Set(current).add(listing.listingId));
      setNotice(`${listing.teaName} was added to your Tea Cellar as a permanent Study Copy.`);
      await refreshMerchant();
    }
    setBusy(null);
  }

  return <section className="tea-merchant-page" aria-labelledby="tea-merchant-title">
    <button className="btn btn-quiet tea-merchant-back" type="button" onClick={onReturnToCellar}>← Return to Tea Cellar</button>
    <header className="tea-merchant-hero">
      <div>
        <span className="eyebrow">Connected to your Vintage Fork account</span>
        <h1 className="page-title" id="tea-merchant-title">Tea Merchant</h1>
        <p className="page-lede">List developed tasting cards, collect permanent Study Copies, and use the same Gold Leaves balance shown at vintagefork.ca checkout.</p>
      </div>
      <div className="tea-merchant-stats" aria-label="Tea Merchant account totals">
        <div><strong>{summary ? balance.toLocaleString("en-CA") : "—"}</strong><span>{summary?.pointsLabel ?? "Gold Leaves"}</span></div>
        <div><strong>{seals.length}</strong><span>Tea Cellar cards</span></div>
      </div>
    </header>

    {!summary && <p className="notice" role="status">Your Gold Leaves wallet is temporarily unavailable. Tea Cellar records remain safe.</p>}
    {notice && <p className="notice tea-merchant-result" role="status">{notice}</p>}

    <div className="section-label"><span>Your Tea Cellar card tray</span></div>
    {seals.length ? <>
      <div className="tea-merchant-tray" role="list" aria-label="Your Tea Cellar tasting cards">
        {seals.map(seal => {
          const card = cardForPassportSeal(seal);
          const merchantCard = merchantCardsBySourceId.get(card.sourceId) ?? null;
          const selected = merchantCard !== null && selectedCardId === merchantCard.cardId;
          const flipped = flippedCards.has(seal.id);
          const shielded = shieldedCards.has(seal.id);
          return <article className={`tea-merchant-tray-card${selected ? " selected" : ""}`} role="listitem" key={seal.id}>
            <button
              className="tea-merchant-card-preview"
              type="button"
              aria-label={flipped ? `Show tasting profile for ${card.teaName}` : `Show brewing details for ${card.teaName}`}
              onClick={() => toggleFlippedCard(seal.id)}
            >
              <TastingCardPresentation
                card={card}
                contextLabel={seal.contextLabel}
                earnedAt={seal.earnedAt}
                flipped={flipped}
                shielded={shielded}
                onShieldChange={next => setCardShielded(seal.id, next)}
              />
            </button>
            <div className="tea-merchant-card-copy">
              <span className="tea-merchant-card-source">{seal.contextLabel}</span>
              <strong>{card.teaName}</strong>
              <span className="tea-merchant-card-value">{seal.label}</span>
              <span className="tea-merchant-card-state">{merchantCard
                ? merchantCard.listingStatus === "active"
                  ? "Live in market"
                  : merchantCard.listingStatus === "paused"
                    ? "Listing paused"
                    : `${merchantCard.leafPrice} Gold Leaves · Ready to list`
                : "Complete another tasting of this tea to list it"}</span>
            </div>
            <div className="tea-merchant-card-actions">
              <button
                className="btn btn-quiet tea-merchant-select"
                type="button"
                aria-pressed={selected}
                disabled={!merchantCard}
                onClick={() => merchantCard && setSelectedCardId(selected ? null : merchantCard.cardId)}
              >{merchantCard ? selected ? "Selected for market" : "Select for market" : "Not ready to list"}</button>
              {selected && merchantCard && (merchantCard.listingStatus === "active"
                ? <button className="btn btn-quiet" type="button" disabled={busy === merchantCard.cardId} onClick={() => setPaused(merchantCard, true)}>Pause listing</button>
                : merchantCard.listingStatus === "paused"
                  ? <button className="btn btn-gold" type="button" disabled={busy === merchantCard.cardId} onClick={() => setPaused(merchantCard, false)}>Resume listing</button>
                  : <button className="btn btn-gold" type="button" disabled={busy === merchantCard.cardId} onClick={() => publishCard(merchantCard)}>{busy === merchantCard.cardId ? "Listing…" : "List selected card"}</button>)}
            </div>
          </article>;
        })}
      </div>
      <p className="tea-merchant-tray-hint">Slide the tray to browse. Tap a card to flip it. Double-tap its shield to de-shield or restore it. Select a ready card to list it in the market.</p>
    </> : <div className="empty-state tea-merchant-empty">
      <h2>No tasting cards yet.</h2>
      <p>Every completed tasting card that appears in Tea Cellar will also appear here.</p>
      <button className="btn btn-gold" type="button" onClick={onReturnToCellar}>Return to Tea Cellar</button>
    </div>}

    {!cards.length && <div className="empty-state"><h2>No cards are ready to list yet.</h2><p>Complete a second tasting of the exact same tea to develop its card to Polychrome.</p></div>}

    <div className="section-label"><span>Study Copy Market</span></div>
    <div className="tea-merchant-grid">
      {listings.map(listing => {
        const own = ownListingIds.has(listing.listingId);
        const alreadyPurchased = purchased.has(listing.listingId);
        return <article className="tea-merchant-card" key={listing.listingId}>
          <span className="tea-merchant-card-source">{listing.sourceTier === "shielded" ? "Shielded" : "Polychrome"} · {listing.creatorDisplayName}</span>
          <strong>{listing.teaName}</strong>
          <span className="tea-merchant-card-value">{listing.leafPrice} Gold Leaves</span>
          <span className="tea-merchant-card-state">{listing.origin || listing.teaCategory} · {listing.studyCount} studies</span>
          <button className="btn btn-gold" type="button" disabled={!summary || own || alreadyPurchased || busy === listing.listingId || balance < listing.leafPrice} onClick={() => purchaseStudyCopy(listing)}>
            {own ? "Your listing" : alreadyPurchased ? "In your Tea Cellar" : balance < listing.leafPrice ? "More Leaves needed" : "Add Study Copy"}
          </button>
        </article>;
      })}
    </div>
    {!listings.length && <div className="empty-state"><h2>The market is waiting for its first listing.</h2><p>Select an eligible card from your tray to begin.</p></div>}
  </section>;
}
