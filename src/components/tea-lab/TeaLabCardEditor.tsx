"use client";

import { FlavorDescriptorPicker } from "@/components/tea-lab/FlavorDescriptorPicker";
import { TeaLabDurationSlider, TeaLabTemperatureSlider } from "@/components/tea-lab/TeaLabBrewSliders";
import {
  getTeaLabBrewingStyle,
  nextTeaLabBrewStageLabel,
  TEA_LAB_BREWING_STYLE_GROUPS,
  TEA_LAB_BREWING_STYLES
} from "@/lib/tea-lab/brewing";
import type { TeaLabDescriptorOption } from "@/lib/tea-lab/lab";
import { toggleTeaLabDescriptor } from "@/lib/tea-lab/lab-flow";
import type {
  TeaLabBrewingDraft,
  TeaLabBrewStageDraft,
  TeaLabPersonalTeaSelection,
  TeaLabSoloDraft,
  TeaLabTastingDraft
} from "@/lib/tea-lab/offline";

type TeaLabCardEditorProps = {
  draft: TeaLabSoloDraft;
  descriptorOptions: TeaLabDescriptorOption[];
  busy: boolean;
  onChange: (draft: TeaLabSoloDraft) => void;
  onCancel: () => void;
  onSave: () => void;
};

function numericValue(value: number | null | undefined): string | number {
  return value ?? "";
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function TeaLabCardEditor({ draft, descriptorOptions, busy, onChange, onCancel, onSave }: TeaLabCardEditorProps) {
  const setTea = <K extends keyof TeaLabPersonalTeaSelection>(field: K, value: TeaLabPersonalTeaSelection[K]) => {
    if (draft.tea?.kind !== "personal") return;
    onChange({ ...draft, tea: { ...draft.tea, [field]: value } });
  };
  const setBrewing = <K extends keyof TeaLabBrewingDraft>(field: K, value: TeaLabBrewingDraft[K]) => {
    onChange({ ...draft, brewing: { ...draft.brewing, [field]: value } });
  };
  const setTasting = <K extends keyof TeaLabTastingDraft>(field: K, value: TeaLabTastingDraft[K]) => {
    onChange({ ...draft, tasting: { ...draft.tasting, [field]: value } });
  };
  const updateStage = (index: number, update: Partial<TeaLabBrewStageDraft>) => {
    setBrewing("stages", (draft.brewing.stages ?? []).map((stage, stageIndex) => stageIndex === index ? { ...stage, ...update } : stage));
  };
  const stages = draft.brewing.stages ?? [];
  const brewingStyleId = draft.brewing.style;
  const brewingStyle = getTeaLabBrewingStyle(brewingStyleId);
  const preferredDurationUnit = brewingStyle?.durationUnit ?? "seconds";
  const addStage = () => {
    if (!brewingStyleId || !brewingStyle || stages.length >= 20) return;
    setBrewing("stages", [...stages, {
      label: nextTeaLabBrewStageLabel(brewingStyleId, stages),
      durationSeconds: null,
      temperatureC: null,
      notes: null
    }]);
  };

  return <form className="tea-lab-card-editor" aria-labelledby={`edit-card-${draft.cardId}`} onSubmit={event => { event.preventDefault(); onSave(); }}>
    <div className="section-label"><span id={`edit-card-${draft.cardId}`}>Edit tasting card</span></div>
    {draft.tea?.kind === "personal" ? <fieldset className="tea-lab-fieldset">
      <legend>Tea details</legend>
      <div className="grid grid-2">
        <div className="field"><label htmlFor={`edit-tea-name-${draft.cardId}`}>Tea name</label><input className="input" id={`edit-tea-name-${draft.cardId}`} maxLength={160} required value={draft.tea.name} onChange={event => setTea("name", event.target.value)} /></div>
        <div className="field"><label htmlFor={`edit-tea-producer-${draft.cardId}`}>Producer</label><input className="input" id={`edit-tea-producer-${draft.cardId}`} maxLength={160} value={draft.tea.producer ?? ""} onChange={event => setTea("producer", event.target.value || null)} /></div>
        <div className="field"><label htmlFor={`edit-tea-origin-${draft.cardId}`}>Origin</label><input className="input" id={`edit-tea-origin-${draft.cardId}`} maxLength={160} value={draft.tea.origin ?? ""} onChange={event => setTea("origin", event.target.value || null)} /></div>
        <div className="field"><label htmlFor={`edit-tea-type-${draft.cardId}`}>Tea type</label><input className="input" id={`edit-tea-type-${draft.cardId}`} maxLength={80} value={draft.tea.teaType ?? ""} onChange={event => setTea("teaType", event.target.value || null)} /></div>
        <div className="field"><label htmlFor={`edit-tea-cultivar-${draft.cardId}`}>Cultivar</label><input className="input" id={`edit-tea-cultivar-${draft.cardId}`} maxLength={120} value={draft.tea.cultivar ?? ""} onChange={event => setTea("cultivar", event.target.value || null)} /></div>
        <div className="field"><label htmlFor={`edit-tea-harvest-${draft.cardId}`}>Harvest</label><input className="input" id={`edit-tea-harvest-${draft.cardId}`} maxLength={120} value={draft.tea.harvest ?? ""} onChange={event => setTea("harvest", event.target.value || null)} /></div>
        <div className="field"><label htmlFor={`edit-tea-lot-${draft.cardId}`}>Lot or batch</label><input className="input" id={`edit-tea-lot-${draft.cardId}`} maxLength={160} value={draft.tea.lotCode ?? ""} onChange={event => setTea("lotCode", event.target.value || null)} /></div>
        <div className="field"><label htmlFor={`edit-tea-product-${draft.cardId}`}>Product ID</label><input className="input" id={`edit-tea-product-${draft.cardId}`} maxLength={160} value={draft.tea.productIdentifier ?? ""} onChange={event => setTea("productIdentifier", event.target.value || null)} /></div>
      </div>
    </fieldset> : <div className="notice"><strong>Catalogue tea</strong><p style={{ margin: "6px 0 0" }}>The tea identity stays linked to the catalogue. You can edit your tasting and brewing record below.</p></div>}

    <fieldset className="tea-lab-fieldset">
      <legend>Rating and intensity</legend>
      <div className="grid grid-2">
        <div className="field"><label htmlFor={`edit-rating-${draft.cardId}`}>Rating</label><select className="select" id={`edit-rating-${draft.cardId}`} required value={draft.tasting.rating ?? ""} onChange={event => setTasting("rating", optionalNumber(event.target.value))}>
          <option value="" disabled>Select a rating…</option>
          {[1, 2, 3, 4, 5].map(rating => <option value={rating} key={rating}>{rating} of 5</option>)}
        </select></div>
        <div className="field"><label htmlFor={`edit-intensity-${draft.cardId}`}>Intensity</label><select className="select" id={`edit-intensity-${draft.cardId}`} value={draft.tasting.intensity ?? ""} onChange={event => setTasting("intensity", event.target.value === "subtle" || event.target.value === "clear" || event.target.value === "dominant" ? event.target.value : null)}>
          <option value="">Not recorded</option><option value="subtle">Subtle</option><option value="clear">Clear</option><option value="dominant">Dominant</option>
        </select></div>
      </div>
    </fieldset>

    <FlavorDescriptorPicker options={descriptorOptions} selectedIds={draft.tasting.descriptorIds} onToggle={descriptorId => setTasting("descriptorIds", toggleTeaLabDescriptor(draft.tasting.descriptorIds, descriptorId))} />

    <div className="grid grid-2">
      <div className="field"><label htmlFor={`edit-impression-${draft.cardId}`}>First impression</label><textarea className="textarea" id={`edit-impression-${draft.cardId}`} maxLength={600} value={draft.tasting.firstImpression ?? ""} onChange={event => setTasting("firstImpression", event.target.value || null)} /></div>
      <div className="field"><label htmlFor={`edit-notes-${draft.cardId}`}>Private notes</label><textarea className="textarea" id={`edit-notes-${draft.cardId}`} maxLength={3000} value={draft.tasting.personalNotes ?? ""} onChange={event => setTasting("personalNotes", event.target.value || null)} /></div>
    </div>

    <fieldset className="tea-lab-fieldset">
      <legend>Brewing record</legend>
      <div className="field"><label htmlFor={`edit-style-${draft.cardId}`}>Brewing style</label><select className="select" id={`edit-style-${draft.cardId}`} value={draft.brewing.style ?? ""} onChange={event => setBrewing("style", event.target.value as TeaLabBrewingDraft["style"] || null)}>
        <option value="">Not recorded</option>
        {TEA_LAB_BREWING_STYLE_GROUPS.map(group => <optgroup label={group.label} key={group.id}>{TEA_LAB_BREWING_STYLES.filter(style => style.group === group.id).map(style => <option value={style.id} key={style.id}>{style.label}</option>)}</optgroup>)}
      </select></div>
      <div className="grid grid-3">
        <div className="field"><label htmlFor={`edit-leaf-${draft.cardId}`}>Leaf weight (g)</label><input className="input" id={`edit-leaf-${draft.cardId}`} type="number" min="0.01" max="1000" step="0.1" value={numericValue(draft.brewing.leafGrams)} onChange={event => setBrewing("leafGrams", optionalNumber(event.target.value))} /></div>
        <div className="field"><label htmlFor={`edit-water-${draft.cardId}`}>Water (ml)</label><input className="input" id={`edit-water-${draft.cardId}`} type="number" min="1" max="10000" step="1" value={numericValue(draft.brewing.waterMl)} onChange={event => setBrewing("waterMl", optionalNumber(event.target.value))} /></div>
        <TeaLabTemperatureSlider id={`edit-temperature-${draft.cardId}`} label="Water temperature" valueC={draft.brewing.waterTemperatureC} disabled={busy} onChange={value => setBrewing("waterTemperatureC", value)} />
        <div className="field"><label htmlFor={`edit-vessel-${draft.cardId}`}>Vessel</label><input className="input" id={`edit-vessel-${draft.cardId}`} maxLength={160} value={draft.brewing.vessel ?? ""} onChange={event => setBrewing("vessel", event.target.value || null)} /></div>
        <div className="field"><label htmlFor={`edit-water-source-${draft.cardId}`}>Water source</label><input className="input" id={`edit-water-source-${draft.cardId}`} maxLength={160} value={draft.brewing.waterSource ?? ""} onChange={event => setBrewing("waterSource", event.target.value || null)} /></div>
        <TeaLabDurationSlider key={`edit-initial-${draft.cardId}-${draft.brewing.style ?? "seconds"}`} id={`edit-steep-${draft.cardId}`} label="Initial steep" valueSeconds={draft.brewing.initialSteepSeconds} preferredUnit={preferredDurationUnit} disabled={busy} onChange={value => setBrewing("initialSteepSeconds", value)} />
      </div>
      <div className="field"><label htmlFor={`edit-preparation-${draft.cardId}`}>Setup notes</label><textarea className="textarea" id={`edit-preparation-${draft.cardId}`} maxLength={1200} value={draft.brewing.preparationNotes ?? ""} onChange={event => setBrewing("preparationNotes", event.target.value || null)} /></div>
    </fieldset>

    <fieldset className="tea-lab-fieldset">
      <legend>Brew stages {brewingStyle && <span className="muted">Up to 20</span>}</legend>
      <div className="stack">{stages.map((stage, index) => <article className="tea-lab-stage" key={index}>
        <div className="card-header"><strong>Stage {index + 1}</strong>{stages.length > 1 && <button className="btn btn-quiet danger" type="button" disabled={busy} onClick={() => setBrewing("stages", stages.filter((_, stageIndex) => stageIndex !== index))}>Remove</button>}</div>
        <div className="grid grid-3">
          <div className="field"><label htmlFor={`edit-stage-name-${draft.cardId}-${index}`}>Stage name</label><input className="input" id={`edit-stage-name-${draft.cardId}-${index}`} maxLength={80} required value={stage.label} onChange={event => updateStage(index, { label: event.target.value })} /></div>
          <TeaLabDurationSlider key={`edit-${draft.cardId}-${draft.brewing.style ?? "seconds"}-${index}`} id={`edit-stage-time-${draft.cardId}-${index}`} label="Infusion time" valueSeconds={stage.durationSeconds} preferredUnit={preferredDurationUnit} disabled={busy} onChange={value => updateStage(index, { durationSeconds: value })} />
          <TeaLabTemperatureSlider id={`edit-stage-temp-${draft.cardId}-${index}`} label="Water temperature" valueC={stage.temperatureC} disabled={busy} onChange={value => updateStage(index, { temperatureC: value })} />
        </div>
        <div className="field"><label htmlFor={`edit-stage-notes-${draft.cardId}-${index}`}>Notes</label><textarea className="textarea" id={`edit-stage-notes-${draft.cardId}-${index}`} maxLength={600} value={stage.notes ?? ""} onChange={event => updateStage(index, { notes: event.target.value || null })} /></div>
      </article>)}</div>
      {brewingStyle && stages.length < 20 && <button className="btn btn-secondary" type="button" disabled={busy} onClick={addStage}>+ Add {brewingStyle.nextStageLabel?.toLocaleLowerCase("en-CA") ?? "infusion"}</button>}
    </fieldset>

    <div className="notice"><strong>Passport stays intact.</strong><p style={{ margin: "6px 0 0" }}>Editing updates this card without changing its original completion date or Documented Tasting seal.</p></div>
    <div className="card-footer">
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="btn btn-gold btn-attention" type="submit" disabled={busy || !draft.tea || (draft.tea.kind === "personal" && !draft.tea.name.trim()) || !draft.tasting.rating}>{busy ? "Saving…" : "Save card"}</button>
    </div>
  </form>;
}
