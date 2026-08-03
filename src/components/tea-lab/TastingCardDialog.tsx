"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { JournalCard, JournalPhoto } from "@/lib/tea-lab/journal";

const SEAL_LABELS = {
  live_event_verified: "Live Event Verified",
  documented_tasting: "Documented Tasting"
} as const;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function focusTrapTarget<T>({
  active,
  first,
  last,
  focusInside,
  backward
}: {
  active: T | null;
  first: T;
  last: T;
  focusInside: boolean;
  backward: boolean;
}): T | null {
  if (!focusInside) return backward ? last : first;
  if (backward && active === first) return last;
  if (!backward && active === last) return first;
  return null;
}

type InertElement = Pick<HTMLElement, "inert" | "getAttribute" | "setAttribute" | "removeAttribute">;

export function makeElementsInert(elements: InertElement[]): () => void {
  const states = elements.map(element => ({
    element,
    inert: element.inert,
    ariaHidden: element.getAttribute("aria-hidden")
  }));

  elements.forEach(element => {
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  });

  return () => {
    states.reverse().forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    });
  };
}

function makeOutsideModalBranchesInert(modal: HTMLElement): () => void {
  const outsideBranches: HTMLElement[] = [];
  let branch = modal;

  while (branch.parentElement) {
    const parent = branch.parentElement;
    Array.from(parent.children).forEach(sibling => {
      if (sibling === branch || !(sibling instanceof HTMLElement)) return;
      outsideBranches.push(sibling);
    });
    if (parent === document.body) break;
    branch = parent;
  }

  return makeElementsInert(outsideBranches);
}

function value(value: number | string | null | undefined, suffix = ""): string | null {
  return value === null || value === undefined || value === "" ? null : `${value}${suffix}`;
}

export function PhotoSlider({ photos, teaName }: { photos: JournalPhoto[]; teaName: string }) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) return null;
  const active = photos[Math.min(index, photos.length - 1)];

  return <section className="tasting-card-gallery" aria-label={`Photos from ${teaName}`}>
    <div className="tasting-card-gallery-frame">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={active.url} alt={active.altText ?? `${teaName} tasting photo ${index + 1}`} />
      {photos.length > 1 && <>
        <button className="tasting-card-gallery-arrow previous" type="button" aria-label="Previous photo" onClick={() => setIndex(current => (current - 1 + photos.length) % photos.length)}>‹</button>
        <button className="tasting-card-gallery-arrow next" type="button" aria-label="Next photo" onClick={() => setIndex(current => (current + 1) % photos.length)}>›</button>
      </>}
    </div>
    <div className="tasting-card-gallery-footer">
      <span>{index + 1} / {photos.length}</span>
      {photos.length > 1 && <div className="tasting-card-gallery-dots" aria-hidden="true">{photos.map((photo, photoIndex) => <i className={photoIndex === index ? "active" : ""} key={photo.id} />)}</div>}
    </div>
  </section>;
}

export function TastingCardDialog({
  card,
  contextLabel,
  earnedAt,
  triggerClassName = "btn btn-secondary",
  triggerLabel,
  children
}: {
  card: JournalCard;
  contextLabel: string;
  earnedAt: string;
  triggerClassName?: string;
  triggerLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const triggerNode = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const restoreOutsideBranches = modalRef.current
      ? makeOutsideModalBranchesInert(modalRef.current)
      : () => undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(element => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      const first = focusable[0] ?? closeRef.current;
      const last = focusable.at(-1) ?? closeRef.current;
      if (!first || !last) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = focusTrapTarget({
        active,
        first,
        last,
        focusInside: dialog.contains(active),
        backward: event.shiftKey
      });
      if (!target) return;
      event.preventDefault();
      target.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      restoreOutsideBranches();
      triggerNode?.focus();
    };
  }, [open]);

  const brewing = card.brewing;
  const brewItems = brewing ? [
    value(brewing.leafGrams, " g leaf"),
    value(brewing.waterMl, " ml water"),
    value(brewing.waterTemperatureC, " °C"),
    value(brewing.initialSteepSeconds, " sec initial steep"),
    value(brewing.vessel),
    value(brewing.waterSource)
  ].filter((item): item is string => Boolean(item)) : [];
  const identity = [
    ["Producer", card.producer],
    ["Origin", card.origin],
    ["Tea type", card.teaType],
    ["Cultivar", card.cultivar],
    ["Harvest", card.harvest],
    ["Lot or batch", card.lotCode],
    ["Product ID", card.productIdentifier]
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return <>
    <button ref={triggerRef} className={triggerClassName} type="button" aria-label={triggerLabel} onClick={() => setOpen(true)}>{children}</button>
    {open && <div ref={modalRef} className="tasting-card-modal" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <article ref={dialogRef} className={`tasting-card-sheet ${card.sealClass ?? "documented_tasting"}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="tasting-card-sheet-header">
          <div>
            <p className="eyebrow">Digital tasting card</p>
            <h2 className="display" id={titleId}>{card.teaName}</h2>
            <p>{new Date(earnedAt).toLocaleDateString("en-CA", { dateStyle: "long" })} · {contextLabel}</p>
          </div>
          <button ref={closeRef} className="tasting-card-close" type="button" aria-label="Close tasting card" onClick={() => setOpen(false)}>×</button>
        </header>

        <PhotoSlider photos={card.photos ?? []} teaName={card.teaName} />

        <div className="tasting-card-seal-row">
          <span className="passport-seal-mark" aria-hidden="true">{card.sealClass === "live_event_verified" ? "✦" : "◇"}</span>
          <div><strong>{card.sealClass ? SEAL_LABELS[card.sealClass] : "Private tasting"}</strong><small>{card.source === "live" ? "Completed at a hosted tasting" : "Documented in your Tea Lab"}</small></div>
          <span className="tasting-card-rating" aria-label={card.rating ? `${card.rating} out of 5 stars` : "Not rated"}>{card.rating ? `${"★".repeat(card.rating)}${"☆".repeat(5 - card.rating)}` : "Not rated"}</span>
        </div>

        {identity.length > 0 && <dl className="tasting-card-details">{identity.map(([label, detail]) => <div key={label}><dt>{label}</dt><dd>{detail}</dd></div>)}</dl>}

        <div className="tasting-card-section-grid">
          <section>
            <p className="eyebrow">Tasting profile</p>
            <dl className="tasting-card-profile">
              <div><dt>Intensity</dt><dd>{card.intensity ?? "Not recorded"}</dd></div>
              <div><dt>Descriptors</dt><dd>{card.descriptors.map(descriptor => descriptor.label).join(" · ") || "Not recorded"}</dd></div>
            </dl>
          </section>
          <section>
            <p className="eyebrow">Brewing record</p>
            <p>{brewItems.join(" · ") || "Not recorded"}</p>
            {brewing?.instructions && <p className="muted">{brewing.instructions}</p>}
          </section>
        </div>

        {(card.firstImpression || card.personalNotes) && <section className="tasting-card-notes">
          <p className="eyebrow">Your private journal</p>
          {card.firstImpression && <blockquote>“{card.firstImpression}”</blockquote>}
          {card.personalNotes && <p>{card.personalNotes}</p>}
        </section>}

        <footer className="tasting-card-sheet-footer"><span>Private to your account</span><button className="btn btn-primary" type="button" onClick={() => setOpen(false)}>Done</button></footer>
      </article>
    </div>}
  </>;
}
