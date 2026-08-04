"use client";

import { useState } from "react";
import { TastingCardPresentation } from "@/components/tea-lab/TastingCardDialog";
import type { JournalCard } from "@/lib/tea-lab/journal";

const THEMES = [
  { slug: "green", label: "Green", colour: "#5d6639" },
  { slug: "black", label: "Black", colour: "#292526" },
  { slug: "oolong", label: "Oolong", colour: "#8a5527" },
  { slug: "white", label: "White", colour: "#8b8d7c" },
  { slug: "yellow", label: "Yellow", colour: "#a47b16" },
  { slug: "red", label: "Red", colour: "#923b32" },
  { slug: "dark", label: "Pu-erh", colour: "#544034" },
  { slug: "herbal", label: "Herbal", colour: "#4d704b" }
] as const;

const INITIAL_VALUES = {
  teaName: "Anji White Tea",
  origin: "China – Anji County, Zhejiang Province",
  rating: 3,
  intensity: "Subtle",
  descriptors: "Metallic, Lychee, Umami",
  leafGrams: 8,
  waterMl: 125,
  temperatureC: 85,
  initialSteepSeconds: 35,
  vessel: "Gaiwan",
  waterSource: "Tap"
};

type PreviewInfusion = {
  id: number;
  durationSeconds: number;
  temperatureC: number;
  notes: string;
};

const INITIAL_INFUSIONS: PreviewInfusion[] = [
  { id: 1, durationSeconds: 10, temperatureC: 85, notes: "Sweet" },
  { id: 2, durationSeconds: 15, temperatureC: 85, notes: "Floral" },
  { id: 3, durationSeconds: 20, temperatureC: 85, notes: "Soft" }
];

export function TastingCardArtworkPreview() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]>(THEMES[0]);
  const [flipped, setFlipped] = useState(false);
  const [sealAttached, setSealAttached] = useState(true);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [infusions, setInfusions] = useState(INITIAL_INFUSIONS);
  const setValue = <K extends keyof typeof INITIAL_VALUES>(key: K, nextValue: (typeof INITIAL_VALUES)[K]) => {
    setValues(current => ({ ...current, [key]: nextValue }));
  };
  const setInfusion = <K extends keyof Omit<PreviewInfusion, "id">>(id: number, key: K, nextValue: PreviewInfusion[K]) => {
    setInfusions(current => current.map(infusion => infusion.id === id ? { ...infusion, [key]: nextValue } : infusion));
  };
  const addInfusion = () => {
    setInfusions(current => {
      const last = current.at(-1);
      return [...current, {
        id: Math.max(0, ...current.map(infusion => infusion.id)) + 1,
        durationSeconds: (last?.durationSeconds ?? 0) + 5,
        temperatureC: last?.temperatureC ?? values.temperatureC,
        notes: ""
      }];
    });
  };
  const card: JournalCard = {
    id: "preview-card",
    source: "solo",
    sourceId: "preview-card",
    teaName: values.teaName,
    origin: values.origin,
    teaType: theme.label,
    rating: values.rating,
    intensity: values.intensity,
    descriptors: values.descriptors.split(",").map(label => ({ stableId: null, label: label.trim(), mapped: false })).filter(descriptor => descriptor.label),
    firstImpression: null,
    personalNotes: null,
    completedAt: "2026-08-03T12:00:00.000Z",
    saved: true,
    position: 1,
    sealClass: sealAttached ? "documented_tasting" : null,
    brewing: {
      style: "gongfu",
      leafGrams: values.leafGrams,
      waterMl: values.waterMl,
      waterTemperatureC: values.temperatureC,
      waterSource: values.waterSource,
      vessel: values.vessel,
      initialSteepSeconds: values.initialSteepSeconds,
      instructions: null,
      preparationNotes: null,
      stages: [
        { label: "Rinse (optional)", durationSeconds: 5, temperatureC: values.temperatureC, notes: "" },
        ...infusions.map((infusion, index) => ({
          label: `Infusion ${index + 1}`,
          durationSeconds: infusion.durationSeconds,
          temperatureC: infusion.temperatureC,
          notes: infusion.notes
        }))
      ]
    }
  };

  return <section className="artwork-card-preview">
    <div className="artwork-card-themes" aria-label="Tea card colour">
      {THEMES.map(option => <button
        className={option.slug === theme.slug ? "is-active" : ""}
        type="button"
        aria-pressed={option.slug === theme.slug}
        onClick={() => { setTheme(option); setFlipped(false); }}
        key={option.slug}
      >
        <span style={{ backgroundColor: option.colour }} aria-hidden="true"/>{option.label}
      </button>)}
    </div>

    <div className="artwork-seal-controls">
      <button type="button" aria-pressed={sealAttached} onClick={() => setSealAttached(current => !current)}>
        {sealAttached ? "Decouple seal" : "Couple seal"}
      </button>
      <span>{sealAttached ? "Seal attached to the tasting card" : "Seal detached from the tasting card"}</span>
    </div>

    <form className="artwork-card-editor" onSubmit={event => event.preventDefault()}>
      <label><span>Tea name</span><input value={values.teaName} onChange={event => setValue("teaName", event.target.value)}/></label>
      <label><span>Origin</span><input value={values.origin} onChange={event => setValue("origin", event.target.value)}/></label>
      <label><span>Rating</span><input type="number" min="0" max="5" value={values.rating} onChange={event => setValue("rating", Math.min(5, Math.max(0, Number(event.target.value))))}/></label>
      <label><span>Intensity</span><input value={values.intensity} onChange={event => setValue("intensity", event.target.value)}/></label>
      <label className="artwork-card-editor-wide"><span>Descriptors</span><input value={values.descriptors} onChange={event => setValue("descriptors", event.target.value)}/></label>
      <label><span>Leaf (g)</span><input type="number" min="0" value={values.leafGrams} onChange={event => setValue("leafGrams", Number(event.target.value))}/></label>
      <label><span>Water (ml)</span><input type="number" min="0" value={values.waterMl} onChange={event => setValue("waterMl", Number(event.target.value))}/></label>
      <label><span>Temperature (°C)</span><input type="number" min="0" max="100" value={values.temperatureC} onChange={event => setValue("temperatureC", Number(event.target.value))}/></label>
      <label><span>Initial steep (sec)</span><input type="number" min="0" value={values.initialSteepSeconds} onChange={event => setValue("initialSteepSeconds", Number(event.target.value))}/></label>
      <label><span>Vessel</span><input value={values.vessel} onChange={event => setValue("vessel", event.target.value)}/></label>
      <label><span>Water source</span><input value={values.waterSource} onChange={event => setValue("waterSource", event.target.value)}/></label>
      <fieldset className="artwork-infusion-editor">
        <legend>Infusions used by the combined data set</legend>
        {infusions.map((infusion, index) => <div className="artwork-infusion-row" key={infusion.id}>
          <strong>Infusion {index + 1}</strong>
          <label><span>Seconds</span><input type="number" min="0" value={infusion.durationSeconds} onChange={event => setInfusion(infusion.id, "durationSeconds", Number(event.target.value))}/></label>
          <label><span>Temperature (°C)</span><input type="number" min="0" max="100" value={infusion.temperatureC} onChange={event => setInfusion(infusion.id, "temperatureC", Number(event.target.value))}/></label>
          <label><span>Tasting notes</span><input value={infusion.notes} onChange={event => setInfusion(infusion.id, "notes", event.target.value)}/></label>
          <button type="button" disabled={infusions.length === 1} onClick={() => setInfusions(current => current.filter(candidate => candidate.id !== infusion.id))}>Remove</button>
        </div>)}
        <button className="artwork-add-infusion" type="button" onClick={addInfusion}>+ Add infusion</button>
      </fieldset>
    </form>

    <div className="artwork-card-scene">
      <div
        className="artwork-live-card"
        role="button"
        tabIndex={0}
        aria-label={flipped ? `Show ${theme.label} tea card front` : `Show ${theme.label} tea card back`}
        onClick={() => setFlipped(current => !current)}
        onKeyDown={event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setFlipped(current => !current);
        }}
      >
        <TastingCardPresentation card={card} contextLabel="Personal session" earnedAt="2026-08-03T12:00:00.000Z" flipped={flipped}/>
      </div>
    </div>
    <p className="artwork-card-hint">Edit any field above · tap the card to flip · showing {theme.label} tea accents</p>
  </section>;
}
