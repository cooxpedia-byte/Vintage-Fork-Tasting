"use client";

import { useMemo, useState } from "react";
import type { PassportSeal } from "@/lib/tea-lab/passport";

type MerchantCard = {
  id: string;
  name: string;
  source: string;
  value: number;
};

const STARTER_CARDS: MerchantCard[] = [
  { id: "starter-earl-grey", name: "Cream of Earl Grey", source: "Tea Cellar card", value: 18 },
  { id: "starter-wuyi", name: "Wuyi Oolong", source: "Tonight’s featured tea", value: 24 },
  { id: "starter-baojing", name: "Baojing Golden Tea", source: "Journey card", value: 22 }
];

function cardsForSeals(seals: PassportSeal[]): MerchantCard[] {
  if (!seals.length) return STARTER_CARDS;
  return seals.slice(0, 6).map(seal => ({
    id: seal.id,
    name: seal.teaName,
    source: seal.contextLabel,
    value: seal.sealClass === "live_event_verified" ? 24 : 18
  }));
}

export function TeaMerchant({ seals, onReturnToCellar }: { seals: PassportSeal[]; onReturnToCellar: () => void }) {
  const cards = useMemo(() => cardsForSeals(seals), [seals]);
  const [shelf, setShelf] = useState<Set<string>>(() => new Set([cards[0].id]));
  const [leaves, setLeaves] = useState(1240);
  const [marketDays, setMarketDays] = useState(0);

  function toggleCard(id: string) {
    setShelf(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function runMarketDay() {
    if (!shelf.size) return;
    const earned = cards.reduce((total, card) => total + (shelf.has(card.id) ? card.value : 0), 0);
    setLeaves(value => value + earned);
    setMarketDays(value => value + 1);
  }

  return <section className="tea-merchant-page" aria-labelledby="tea-merchant-title">
    <button className="btn btn-quiet tea-merchant-back" type="button" onClick={onReturnToCellar}>← Return to Tea Cellar</button>
    <header className="tea-merchant-hero">
      <div>
        <span className="eyebrow">Your private market table</span>
        <h1 className="page-title" id="tea-merchant-title">Tea Merchant</h1>
        <p className="page-lede">Choose cards from your Tea Cellar, then run a private demo market day. Nothing here changes your account or tasting history.</p>
      </div>
      <div className="tea-merchant-stats" aria-label="Tea Merchant demo totals">
        <div><strong>{leaves.toLocaleString("en-CA")}</strong><span>Demo leaves</span></div>
        <div><strong>{marketDays}</strong><span>Market days</span></div>
      </div>
    </header>
    <div className="section-label"><span>Build today’s shelf</span></div>
    <div className="tea-merchant-grid">
      {cards.map(card => {
        const selected = shelf.has(card.id);
        return <button className={`tea-merchant-card${selected ? " selected" : ""}`} type="button" aria-pressed={selected} onClick={() => toggleCard(card.id)} key={card.id}>
          <span className="tea-merchant-card-source">{card.source}</span>
          <strong>{card.name}</strong>
          <span className="tea-merchant-card-value">{card.value} leaves</span>
          <span className="tea-merchant-card-state">{selected ? "On today’s shelf" : "Add to shelf"}</span>
        </button>;
      })}
    </div>
    <div className="tea-merchant-command card">
      <div><strong>{shelf.size} {shelf.size === 1 ? "card" : "cards"} selected</strong><p className="muted">A market day totals the leaf value of your selected shelf.</p></div>
      <button className="btn btn-gold" type="button" disabled={!shelf.size} onClick={runMarketDay}>Run market day</button>
    </div>
    {marketDays > 0 && <p className="notice tea-merchant-result" role="status">Market day {marketDays} complete. Your shelf earned demo leaves.</p>}
  </section>;
}
