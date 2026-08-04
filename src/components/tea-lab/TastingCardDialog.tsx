"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { JournalCard, JournalPhoto } from "@/lib/tea-lab/journal";
import { teaLabBrewingStyleLabel } from "@/lib/tea-lab/brewing";

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

function brewDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} hr`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} sec`;
}

export function tastingCardTeaTheme(teaType: string | null | undefined): string {
  const normalized = teaType?.trim().toLocaleLowerCase("en-CA") ?? "";
  if (normalized.includes("green")) return "green";
  if (normalized.includes("black")) return "black";
  if (normalized.includes("oolong")) return "oolong";
  if (normalized.includes("white")) return "white";
  if (normalized.includes("yellow")) return "yellow";
  if (normalized.includes("red") || normalized.includes("rooibos")) return "red";
  if (normalized.includes("pu-erh") || normalized.includes("puerh") || normalized.includes("dark")) return "dark";
  if (normalized.includes("herbal") || normalized.includes("tisane") || normalized.includes("mate")) return "herbal";
  return "classic";
}

export function tastingCardTitleLengthClass(teaName: string): string {
  const length = Array.from(teaName.trim()).length;
  if (length > 40) return "is-long is-extra-long";
  if (length > 18) return "is-long";
  return "";
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

export function DetachableTastingSeal({ attached }: { attached: boolean }) {
  return <span
    className={`tasting-card-detachable-seal ${attached ? "is-attached" : "is-detached"}`}
    data-seal-state={attached ? "coupled" : "decoupled"}
    aria-hidden="true"
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/tea-cards/detachable-seal-coin.png" alt="" draggable="false"/>
  </span>;
}

export function TastingCardPresentation({
  card,
  contextLabel,
  earnedAt,
  flipped
}: {
  card: JournalCard;
  contextLabel: string;
  earnedAt: string;
  flipped: boolean;
}) {
  const brewing = card.brewing;
  const stages = Array.from({ length: 4 }, (_, index) => brewing?.stages[index] ?? null);
  const rating = card.rating ?? 0;
  const sealLabel = card.sealClass ? SEAL_LABELS[card.sealClass] : "Private tasting";
  const sealDescription = card.source === "live" ? "Completed at a hosted tasting" : "Documented in your Tea Lab";
  const theme = tastingCardTeaTheme(card.teaType);
  const assetTheme = theme === "classic" ? "green" : theme;
  const titleLengthClass = tastingCardTitleLengthClass(card.teaName);
  const dateLabel = new Date(earnedAt).toLocaleDateString("en-CA", { dateStyle: "long" });
  const missing = "Not recorded";

  return <div className={`tasting-card-flip tasting-card-theme-${theme}${flipped ? " is-flipped" : ""}`}>
    <article className="tasting-card-face tasting-card-artwork-face tasting-card-front" aria-hidden={flipped} aria-label={`${card.teaName} tasting profile`}>
      {/* The supplied artwork remains the visual base. Only its variable fields are covered by live values. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tasting-card-artwork-image" src={`/tea-cards/anji-white-tea-front-${assetTheme}.png`} alt="" draggable="false" aria-hidden="true"/>
      <span className="sr-only">Digital tasting card. Flip for brewing details.</span>
      <h3 className={`tasting-card-live tasting-card-live-front-name tasting-card-live-plum ${titleLengthClass}`.trim()}>{card.teaName}</h3>
      <p className="tasting-card-live tasting-card-live-session tasting-card-live-plum"><time dateTime={earnedAt}>{dateLabel}</time><span aria-hidden="true"> · </span><span>{contextLabel}</span></p>
      <span className="tasting-card-live-seal-old-cover" aria-hidden="true"/>
      <span className="tasting-card-live-tea-medallion-cover" aria-hidden="true"/>
      <DetachableTastingSeal attached={card.sealClass !== null}/>
      <section className="tasting-card-live tasting-card-live-seal tasting-card-live-paper" aria-label="Tasting seal">
        <strong>{sealLabel}</strong><small>{sealDescription}</small>
      </section>
      <div className="tasting-card-live tasting-card-live-rating tasting-card-live-paper" aria-label={card.rating ? `${card.rating} out of 5 stars` : "Not rated"}>
        <span aria-hidden="true">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
        <small>{card.rating ? `${card.rating} out of 5` : "Not rated"}</small>
      </div>
      <div className="tasting-card-live tasting-card-live-origin tasting-card-live-paper"><span className="sr-only">Origin: </span>{card.origin ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-type tasting-card-live-paper"><span className="sr-only">Tea type: </span>{card.teaType ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-intensity tasting-card-live-paper"><span className="sr-only">Intensity: </span>{card.intensity ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-descriptors tasting-card-live-paper"><span className="sr-only">Descriptors: </span>{card.descriptors.map(descriptor => descriptor.label).join(" · ") || missing}</div>
    </article>

    <article className="tasting-card-face tasting-card-artwork-face tasting-card-back" aria-hidden={!flipped} aria-label={`${card.teaName} brewing record`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tasting-card-artwork-image" src={`/tea-cards/anji-white-tea-back-${assetTheme}.png`} alt="" draggable="false" aria-hidden="true"/>
      <span className="sr-only">Back of card. Brewing record. Brew stages.</span>
      <h3 className={`tasting-card-live tasting-card-live-back-name tasting-card-live-paper ${titleLengthClass}`.trim()}>{card.teaName}</h3>
      <div className="tasting-card-live tasting-card-live-style tasting-card-live-paper"><span className="sr-only">Style: </span>{teaLabBrewingStyleLabel(brewing?.style) ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-leaf tasting-card-live-paper"><span className="sr-only">Leaf: </span>{value(brewing?.leafGrams, " g leaf") ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-water tasting-card-live-paper"><span className="sr-only">Water: </span>{value(brewing?.waterMl, " ml water") ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-temperature tasting-card-live-paper"><span className="sr-only">Temperature: </span>{value(brewing?.waterTemperatureC, " °C") ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-initial tasting-card-live-paper"><span className="sr-only">Initial steep: </span>{brewDuration(brewing?.initialSteepSeconds ?? null) ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-vessel tasting-card-live-paper"><span className="sr-only">Vessel: </span>{brewing?.vessel ?? missing}</div>
      <div className="tasting-card-live tasting-card-live-source tasting-card-live-paper"><span className="sr-only">Water source: </span>{brewing?.waterSource ?? missing}</div>
      <ol className="tasting-card-live-stages" aria-label="Brew stages">
        {stages.map((stage, index) => <li key={index}>
          <strong className="tasting-card-live-stage-label tasting-card-live-paper">{stage?.label ?? "—"}</strong>
          <span className="tasting-card-live-stage-time tasting-card-live-paper">{brewDuration(stage?.durationSeconds ?? null) ?? "—"}</span>
          <span className="tasting-card-live-stage-temp tasting-card-live-paper">{stage?.temperatureC !== null && stage?.temperatureC !== undefined ? `${stage.temperatureC} °C` : "—"}</span>
          <small className="tasting-card-live-stage-note tasting-card-live-paper">{stage?.notes ?? ""}</small>
        </li>)}
      </ol>
    </article>
  </div>;
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
  const [flipped, setFlipped] = useState(false);
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

  return <>
    <button ref={triggerRef} className={triggerClassName} type="button" aria-label={triggerLabel} onClick={() => { setFlipped(false); setOpen(true); }}>{children}</button>
    {open && <div ref={modalRef} className="tasting-card-modal" role="presentation">
      <section
        ref={dialogRef}
        className="tasting-card-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={() => setFlipped(current => !current)}
      >
        <h2 className="sr-only" id={titleId}>{card.teaName} digital tasting card</h2>
        <button ref={closeRef} className="tasting-card-close" type="button" aria-label="Close tasting card" onClick={event => { event.stopPropagation(); setOpen(false); }}>×</button>
        <div
          className="tasting-card-flip-target"
          role="button"
          tabIndex={0}
          aria-label={flipped ? "Show tasting profile" : "Show brewing details"}
          onKeyDown={event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setFlipped(current => !current);
          }}
        >
          <TastingCardPresentation card={card} contextLabel={contextLabel} earnedAt={earnedAt} flipped={flipped} />
        </div>
        <span className="sr-only" role="status" aria-live="polite">{flipped ? "Showing brewing details" : "Showing tasting profile"}</span>
      </section>
    </div>}
  </>;
}
