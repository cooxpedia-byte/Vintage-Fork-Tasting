"use client";

import { useState } from "react";
import { PersonalTeaActions } from "@/components/tea-lab/PersonalTeaActions";
import type { TeaLibraryItem } from "@/lib/tea-lab/library";

function detailLine(item: TeaLibraryItem): string {
  return [item.producer, item.origin, item.teaType, item.harvest].filter(Boolean).join(" · ");
}

function LibraryCard({ item }: { item: TeaLibraryItem }) {
  const archived = item.archivedAt !== null;
  return <article className={`card tea-library-card ${archived ? "archived" : ""}`}>
    <div className="card-header">
      <div><h2 className="card-title">{item.name}</h2><p className="card-meta">{detailLine(item) || (item.kind === "personal" ? "Private personal tea" : "Saved Vintage Fork tea")}</p></div>
      <span className={`chip ${archived ? "chip-warning" : "chip-success"}`}>{archived ? "Archived" : item.kind === "personal" ? "Private" : "Saved"}</span>
    </div>
    {(item.cultivar || item.lotCode || item.productIdentifier) && <dl className="tea-library-details">
      {item.cultivar && <div><dt>Cultivar</dt><dd>{item.cultivar}</dd></div>}
      {item.lotCode && <div><dt>Lot</dt><dd>{item.lotCode} <span className="muted">(unverified)</span></dd></div>}
      {item.productIdentifier && <div><dt>Product code</dt><dd>{item.productIdentifier}</dd></div>}
    </dl>}
    <div className="card-footer">
      <span>{item.kind === "personal"
        ? `${item.documentedTastings} documented tasting${item.documentedTastings === 1 ? "" : "s"}`
        : `Saved from ${item.savedReferences} tasting${item.savedReferences === 1 ? "" : "s"}`}</span>
      {item.kind === "personal" && item.personalTeaId && <PersonalTeaActions teaId={item.personalTeaId} archived={archived} />}
    </div>
  </article>;
}

export function TeaLibrary({ items, onOpenLab }: { items: TeaLibraryItem[]; onOpenLab: () => void }) {
  const [showArchived, setShowArchived] = useState(false);
  const active = items.filter(item => item.archivedAt === null);
  const archived = items.filter(item => item.archivedAt !== null);

  return <>
    <div className="page-heading-row">
      <div><h1 className="page-title">Your Tea Library</h1><p className="page-lede">Saved catalogue teas and private teas you entered yourself, together without changing their source.</p></div>
      <button className="btn btn-gold" type="button" onClick={onOpenLab}>Start a tasting</button>
    </div>
    <div className="stack" style={{ marginTop: 20 }}>{active.length
      ? active.map(item => <LibraryCard item={item} key={item.id} />)
      : <div className="empty-state"><h2>Your Library is ready.</h2><p>Save a tea during a live tasting or enter one from the Lab.</p></div>}
    </div>
    {archived.length > 0 && <section style={{ marginTop: 24 }}>
      <button className="btn btn-quiet" type="button" aria-expanded={showArchived} onClick={() => setShowArchived(value => !value)}>{showArchived ? "Hide archived teas" : `Show archived teas (${archived.length})`}</button>
      {showArchived && <div className="stack" style={{ marginTop: 12 }}>{archived.map(item => <LibraryCard item={item} key={item.id} />)}</div>}
    </section>}
  </>;
}
