"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeaLabPhotoCapture } from "@/components/tea-lab/TeaLabPhotoCapture";
import { formatCustomerEventDateTime } from "@/lib/customer-dashboard";
import { IndexedDbTeaLabOfflineStore } from "@/lib/tea-lab/indexed-db";
import {
  inferTeaLabFlowStep,
  isTeaSelectionReady,
  nextTeaLabRating,
  parseOptionalNumber,
  toggleTeaLabDescriptor,
  type TeaLabFlowStep
} from "@/lib/tea-lab/lab-flow";
import { chooseDraftForHydration, type TeaLabDescriptorOption, type TeaLabTeaOption } from "@/lib/tea-lab/lab";
import { createSoloTeaDraft, resolveTeaLabSaveIndicator, type TeaLabOutboxOperation, type TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import type { TeaLabOfflineStore } from "@/lib/tea-lab/offline-store";
import {
  createTeaLabDraftAutosave,
  createTeaLabSyncRunner,
  queueTeaLabCompletion,
  queueTeaLabDraftSave,
  retryTeaLabConflictWithDeviceDraft,
  shouldRefreshTeaLabReadModels,
  startTeaLabSyncTriggers
} from "@/lib/tea-lab/outbox";

type Upcoming = { id: string; title: string; starts_at: string; timezone?: string | null; location_mode: string; invite_code: string | null };

type TeaLabWorkspaceProps = {
  ownerUserId: string;
  name: string;
  teaOptions: TeaLabTeaOption[];
  descriptorOptions: TeaLabDescriptorOption[];
  serverDrafts: TeaLabSoloDraft[];
  upcoming: Upcoming[];
  onOpenJournal: () => void;
};

export function teaLabDraftTeaName(draft: TeaLabSoloDraft, options: TeaLabTeaOption[]): string {
  if (!draft.tea) return "Tea not selected";
  if (draft.tea.kind === "personal") return draft.tea.name || "Manual tea";
  const canonicalTeaId = draft.tea.canonicalTeaId;
  return options.find(option => option.selection.kind === "canonical"
    && option.selection.canonicalTeaId === canonicalTeaId)?.name ?? "Vintage Fork tea";
}

function numericValue(value: number | null | undefined): string | number {
  return value ?? "";
}

export function TeaLabWorkspace({ ownerUserId, name, teaOptions, descriptorOptions, serverDrafts, upcoming, onOpenJournal }: TeaLabWorkspaceProps) {
  const router = useRouter();
  const storeRef = useRef<TeaLabOfflineStore | null>(null);
  const currentDraftRef = useRef<TeaLabSoloDraft | null>(null);
  const autosaveRef = useRef<ReturnType<typeof createTeaLabDraftAutosave> | null>(null);
  const runnerRef = useRef<(() => Promise<unknown>) | null>(null);
  const refreshedConflictOperationsRef = useRef(new Set<string>());
  const [drafts, setDrafts] = useState(serverDrafts.filter(draft => draft.status !== "completed"));
  const [operations, setOperations] = useState<TeaLabOutboxOperation[]>([]);
  const [draft, setDraft] = useState<TeaLabSoloDraft | null>(null);
  const [step, setStep] = useState<TeaLabFlowStep>("choose");
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [formError, setFormError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const refreshDeviceState = useCallback(async (store: TeaLabOfflineStore) => {
    const [storedDrafts, storedOperations] = await Promise.all([
      store.listDrafts(ownerUserId),
      store.listOperations(ownerUserId)
    ]);
    setDrafts(storedDrafts.filter(candidate => !candidate.archived && candidate.status !== "completed"));
    setOperations(storedOperations);
    const active = currentDraftRef.current;
    if (active) {
      const latest = await store.getDraft(ownerUserId, active.sessionId);
      if (latest) {
        currentDraftRef.current = latest;
        setDraft(latest);
      }
    }
  }, [ownerUserId]);

  useEffect(() => {
    const updateOnline = () => setOnline(window.navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopTriggers: () => void = () => undefined;

    try {
      const store = new IndexedDbTeaLabOfflineStore();
      storeRef.current = store;

      void (async () => {
        const existingOperations = await store.listOperations(ownerUserId);
        for (const serverDraft of serverDrafts) {
          const local = await store.getDraft(ownerUserId, serverDraft.sessionId);
          const hasPending = existingOperations.some(operation => operation.sessionId === serverDraft.sessionId);
          const hydrated = chooseDraftForHydration(local, serverDraft, hasPending);
          if (hydrated !== local) await store.putDraft(hydrated);
        }

        const runner = createTeaLabSyncRunner(store, ownerUserId);
        runnerRef.current = runner;
        const runAndRefresh = async () => {
          if (!window.navigator.onLine) return;
          const before = await store.listOperations(ownerUserId);
          const summary = await runner();
          if (disposed) return;
          await refreshDeviceState(store);
          const newlyConflicted = summary.conflicts > 0
            ? (await store.listOperations(ownerUserId)).filter(operation =>
                operation.state === "conflict" && !refreshedConflictOperationsRef.current.has(operation.id))
            : [];
          for (const operation of newlyConflicted) refreshedConflictOperationsRef.current.add(operation.id);
          if (shouldRefreshTeaLabReadModels(before) || newlyConflicted.length > 0) router.refresh();
        };
        autosaveRef.current = createTeaLabDraftAutosave(async nextDraft => {
          await queueTeaLabDraftSave(store, nextDraft);
          if (disposed) return;
          await refreshDeviceState(store);
          await runAndRefresh();
        }, 400, () => { if (!disposed) setStorageError("This draft could not be saved on this device."); });

        await refreshDeviceState(store);
        if (disposed) return;
        setReady(true);
        stopTriggers = startTeaLabSyncTriggers(runAndRefresh);
      })().catch(() => {
        if (!disposed) setStorageError("Private device storage is unavailable. Tea Lab cannot safely start a tasting in this browser.");
      });
    } catch {
      queueMicrotask(() => {
        if (!disposed) setStorageError("Private device storage is unavailable. Tea Lab cannot safely start a tasting in this browser.");
      });
    }

    return () => {
      void autosaveRef.current?.dispose();
      disposed = true;
      stopTriggers();
      storeRef.current = null;
      runnerRef.current = null;
      autosaveRef.current = null;
    };
  }, [ownerUserId, refreshDeviceState, router, serverDrafts]);

  const activeOperations = useMemo(() => draft
    ? operations.filter(operation => operation.sessionId === draft.sessionId)
    : [], [draft, operations]);
  const saveIndicator = resolveTeaLabSaveIndicator(activeOperations, online);
  const blocked = activeOperations.some(operation => operation.state === "conflict" || operation.state === "failed");
  const revisionConflict = activeOperations.some(operation => operation.state === "conflict" && operation.lastErrorCode === "revision_conflict");
  const latestServerDraft = draft ? serverDrafts.find(candidate => candidate.sessionId === draft.sessionId) : undefined;
  const canRetryDeviceCopy = revisionConflict && Boolean(latestServerDraft && latestServerDraft.serverRevision > (draft?.serverRevision ?? 0));

  function replaceDraft(update: (current: TeaLabSoloDraft) => TeaLabSoloDraft) {
    setFormError("");
    setDraft(current => {
      if (!current) return current;
      const next = update(current);
      currentDraftRef.current = next;
      autosaveRef.current?.schedule(next);
      return next;
    });
  }

  async function createTasting() {
    const store = storeRef.current;
    if (!store) return;
    const next = createSoloTeaDraft(ownerUserId);
    await store.putDraft(next);
    currentDraftRef.current = next;
    setDraft(next);
    setStep("choose");
    setFormError("");
    await refreshDeviceState(store);
  }

  function resumeTasting(selected: TeaLabSoloDraft) {
    currentDraftRef.current = selected;
    setDraft(selected);
    setStep(inferTeaLabFlowStep(selected));
    setFormError("");
  }

  async function leaveTasting() {
    await autosaveRef.current?.flush();
    currentDraftRef.current = null;
    setDraft(null);
    setFormError("");
    if (storeRef.current) await refreshDeviceState(storeRef.current);
  }

  async function completeTasting() {
    const store = storeRef.current;
    if (!store || !draft || blocked || photoBusy) return;
    if (!isTeaSelectionReady(draft) || !draft.tasting.rating) {
      setFormError("Choose a tea and add a rating before completing this tasting.");
      return;
    }
    setCompleting(true);
    setFormError("");
    try {
      await autosaveRef.current?.flush();
      const latest = await store.getDraft(ownerUserId, draft.sessionId) ?? draft;
      const queued = await queueTeaLabCompletion(store, latest);
      currentDraftRef.current = queued.draft;
      setDraft(queued.draft);
      await refreshDeviceState(store);
      if (window.navigator.onLine) await runnerRef.current?.();
      await refreshDeviceState(store);
      const completed = await store.getDraft(ownerUserId, draft.sessionId);
      if (completed?.status === "completed") router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "This tasting could not be completed just now.");
    } finally {
      setCompleting(false);
    }
  }

  async function preparePhotoCard() {
    const store = storeRef.current;
    if (!store || !draft) throw new Error("This tasting is not ready for photos yet.");
    if (!window.navigator.onLine) throw new Error("Connect to the internet before adding a photo.");
    await autosaveRef.current?.flush();
    await runnerRef.current?.();
    await refreshDeviceState(store);
    const pending = (await store.listOperations(ownerUserId)).filter(operation => operation.sessionId === draft.sessionId);
    if (pending.length > 0) {
      throw new Error("Finish syncing this tasting before adding a photo. Your notes are still safe on this device.");
    }
  }

  async function retryDeviceCopy() {
    const store = storeRef.current;
    if (!store || !draft) return;
    if (!latestServerDraft || latestServerDraft.serverRevision <= draft.serverRevision) {
      setFormError("Checking the latest saved version. Try this button again in a moment.");
      router.refresh();
      return;
    }
    setCompleting(true);
    setFormError("");
    try {
      const queued = await retryTeaLabConflictWithDeviceDraft(store, draft, latestServerDraft.serverRevision);
      currentDraftRef.current = queued.draft;
      setDraft(queued.draft);
      await refreshDeviceState(store);
      if (window.navigator.onLine) await runnerRef.current?.();
      await refreshDeviceState(store);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "This device copy could not be retried just now.");
    } finally {
      setCompleting(false);
    }
  }

  if (!draft) {
    return <div className="tea-lab-workspace">
      <section className="card tea-lab-hero">
        <div>
          <p className="eyebrow">Your private working table</p>
          <h1 className="page-title">Tea Lab</h1>
          <p className="page-lede">Welcome, {name}. Brew one tea, capture what you notice, and keep the result in your Journal.</p>
        </div>
        <button className="btn btn-gold btn-attention" type="button" disabled={!ready || Boolean(storageError)} onClick={createTasting}>Create a Tasting Session</button>
      </section>
      {storageError && <div className="notice error" role="alert" style={{ marginTop: 16 }}>{storageError}</div>}
      {!ready && !storageError && <p className="help" role="status" style={{ marginTop: 12 }}>Loading your private drafts…</p>}
      {drafts.length > 0 && <>
        <div className="section-label"><span>Continue a draft</span></div>
        <div className="grid grid-2">{drafts.map(savedDraft => <article className="card" key={savedDraft.sessionId}>
          <div className="card-header"><div><h2 className="card-title">{teaLabDraftTeaName(savedDraft, teaOptions)}</h2><p className="card-meta">Updated {new Date(savedDraft.updatedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="chip chip-warning">Draft</span></div>
          <button className="btn btn-primary btn-attention" type="button" onClick={() => resumeTasting(savedDraft)}>Continue tasting</button>
        </article>)}</div>
      </>}
      <div className="section-label"><span>Next at the table</span></div>
      {upcoming.length ? upcoming.map(event => <article className="card" key={event.id}>
        <div className="card-header"><div><h2 className="card-title">{event.title}</h2><p className="card-meta">{formatCustomerEventDateTime(event.starts_at, event.timezone)} · {event.location_mode === "remote" ? "Remote" : "In person"}</p></div><span className="chip chip-success">Booked</span></div>
        <div className="card-footer"><span>Your seat is linked to this account.</span>{event.invite_code && <Link className="btn btn-primary btn-attention" href={`/event/${event.invite_code}`}>Open event</Link>}</div>
      </article>) : <div className="empty-state"><h2>No upcoming live tastings.</h2><p>You can still document a tea at home.</p></div>}
    </div>;
  }

  if (draft.status === "completion_pending" || draft.status === "completed") {
    const completed = draft.status === "completed";
    return <section className="card tea-lab-complete">
      <p className="eyebrow">{completed ? "Documented Tasting" : "Completion pending"}</p>
      <h1 className="page-title">{completed ? "Tasting documented." : "Saved on this device."}</h1>
      <p className="page-lede">{completed
        ? "Your completed card is now available in the Journal."
        : "Your tasting is complete locally and will be added to the Journal when you’re connected and signed in."}</p>
      <p className="help" role="status" aria-live="polite">{saveIndicator.label}</p>
      {blocked && <div className="notice error" role="alert"><p>This tasting conflicts with a newer server version. Your device copy has been retained for review.</p>{revisionConflict && <button className="btn btn-secondary" type="button" disabled={completing} onClick={retryDeviceCopy}>{canRetryDeviceCopy ? "Use this device copy" : "Check latest version"}</button>}</div>}
      {formError && <div className="notice error" role="alert">{formError}</div>}
      <div className="row" style={{ marginTop: 20 }}>
        {completed && <button className="btn btn-primary btn-attention" type="button" onClick={onOpenJournal}>Open Journal</button>}
        <button className="btn btn-secondary" type="button" onClick={leaveTasting}>Back to Lab</button>
      </div>
    </section>;
  }

  return <div className="tea-lab-workspace">
    <div className="tea-lab-toolbar">
      <button className="btn btn-quiet" type="button" onClick={leaveTasting}>← Lab</button>
      <p className={`help tea-lab-save-state ${saveIndicator.state}`} role="status" aria-live="polite">{saveIndicator.label}</p>
    </div>
    <ol className="tea-lab-progress" aria-label="Tasting session progress">
      {(["choose", "brew", "taste", "review"] as TeaLabFlowStep[]).map((value, index) => <li className={step === value ? "active" : ""} aria-current={step === value ? "step" : undefined} key={value}><span>{index + 1}</span>{value === "choose" ? "Tea" : value === "brew" ? "Brew" : value === "taste" ? "Taste" : "Review"}</li>)}
    </ol>
    {blocked && <div className="notice error" role="alert"><p>This draft changed elsewhere. Your device copy is safe, but syncing is paused until the conflict is reviewed.</p>{revisionConflict && <button className="btn btn-secondary" type="button" disabled={completing} onClick={retryDeviceCopy}>{canRetryDeviceCopy ? "Use this device copy" : "Check latest version"}</button>}</div>}
    {formError && <div className="notice error" role="alert">{formError}</div>}
    {step === "choose" && <ChooseTeaStep draft={draft} options={teaOptions} update={replaceDraft} next={() => isTeaSelectionReady(draft) ? setStep("brew") : setFormError("Choose a tea or enter its name to continue.")} />}
    {step === "brew" && <BrewStep draft={draft} update={replaceDraft} back={() => setStep("choose")} next={() => setStep("taste")} />}
    {step === "taste" && <TasteStep draft={draft} descriptors={descriptorOptions} update={replaceDraft} back={() => setStep("brew")} next={() => setStep("review")} online={online} photoBusy={photoBusy} preparePhotoCard={preparePhotoCard} onPhotoBusyChange={setPhotoBusy} />}
    {step === "review" && <ReviewStep draft={draft} teaOptions={teaOptions} descriptors={descriptorOptions} back={() => setStep("taste")} complete={completeTasting} busy={completing || photoBusy} blocked={blocked} />}
  </div>;
}

function ChooseTeaStep({ draft, options, update, next }: { draft: TeaLabSoloDraft; options: TeaLabTeaOption[]; update: (recipe: (draft: TeaLabSoloDraft) => TeaLabSoloDraft) => void; next: () => void }) {
  const matchingKey = draft.tea?.kind === "canonical"
    ? `canonical:${draft.tea.canonicalTeaId}`
    : draft.tea?.kind === "personal" && options.some(option => option.key === `personal:${draft.tea && "personalTeaId" in draft.tea ? draft.tea.personalTeaId : ""}`)
      ? `personal:${draft.tea.personalTeaId}` : draft.tea ? "manual" : "";
  const saved = options.filter(option => option.saved);
  const personal = options.filter(option => option.selection.kind === "personal");
  const catalogue = options.filter(option => option.selection.kind === "canonical" && !option.saved);

  function selectTea(key: string) {
    if (key === "manual") {
      update(current => ({
        ...current,
        tea: current.tea?.kind === "personal" ? current.tea : { kind: "personal", personalTeaId: crypto.randomUUID(), name: "" }
      }));
      return;
    }
    const option = options.find(candidate => candidate.key === key);
    if (!option) return;
    update(current => ({
      ...current,
      tea: { ...option.selection },
      brewing: option.defaultSteepSeconds && !current.brewing.initialSteepSeconds
        ? { ...current.brewing, initialSteepSeconds: option.defaultSteepSeconds }
        : current.brewing
    }));
  }

  function updatePersonal(field: "name" | "producer" | "origin" | "teaType" | "harvest" | "lotCode", value: string) {
    update(current => current.tea?.kind === "personal" ? {
      ...current,
      tea: { ...current.tea, [field]: value || null, ...(field === "name" ? { name: value } : {}) }
    } : current);
  }

  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 1</p><h1 className="page-title">Choose the tea</h1><p className="page-lede">Use a saved or catalogue tea, reuse a personal tea, or document something new.</p>
    <div className="field"><label htmlFor="tea-lab-tea">Tea</label><select className="select" id="tea-lab-tea" value={matchingKey} onChange={event => selectTea(event.target.value)}>
      <option value="">Select a tea…</option>
      {saved.length > 0 && <optgroup label="Saved teas">{saved.map(option => <option value={option.key} key={option.key}>{option.name}{option.origin ? ` · ${option.origin}` : ""}</option>)}</optgroup>}
      {personal.length > 0 && <optgroup label="Your personal teas">{personal.map(option => <option value={option.key} key={option.key}>{option.name}{option.origin ? ` · ${option.origin}` : ""}</option>)}</optgroup>}
      {catalogue.length > 0 && <optgroup label="Vintage Fork catalogue">{catalogue.map(option => <option value={option.key} key={option.key}>{option.name}{option.origin ? ` · ${option.origin}` : ""}</option>)}</optgroup>}
      <option value="manual">Enter a tea manually</option>
    </select></div>
    {draft.tea?.kind === "personal" && <div className="grid grid-2">
      <div className="field"><label htmlFor="tea-name">Tea name</label><input className="input" id="tea-name" maxLength={160} required value={draft.tea.name} onChange={event => updatePersonal("name", event.target.value)} /></div>
      <div className="field"><label htmlFor="tea-producer">Producer</label><input className="input" id="tea-producer" maxLength={160} value={draft.tea.producer ?? ""} onChange={event => updatePersonal("producer", event.target.value)} /></div>
      <div className="field"><label htmlFor="tea-origin">Origin</label><input className="input" id="tea-origin" maxLength={160} value={draft.tea.origin ?? ""} onChange={event => updatePersonal("origin", event.target.value)} /></div>
      <div className="field"><label htmlFor="tea-type">Tea type</label><input className="input" id="tea-type" maxLength={80} value={draft.tea.teaType ?? ""} onChange={event => updatePersonal("teaType", event.target.value)} /></div>
      <div className="field"><label htmlFor="tea-harvest">Harvest</label><input className="input" id="tea-harvest" maxLength={120} value={draft.tea.harvest ?? ""} onChange={event => updatePersonal("harvest", event.target.value)} /></div>
      <div className="field"><label htmlFor="tea-lot">Lot or batch <span className="muted">(unverified)</span></label><input className="input" id="tea-lot" maxLength={160} value={draft.tea.lotCode ?? ""} onChange={event => updatePersonal("lotCode", event.target.value)} /></div>
    </div>}
    <div className="card-footer"><span className="muted">Manual tea details remain private to you.</span><button className="btn btn-primary btn-attention" type="button" disabled={!isTeaSelectionReady(draft)} onClick={next}>Continue to brew</button></div>
  </section>;
}

function BrewStep({ draft, update, back, next }: { draft: TeaLabSoloDraft; update: (recipe: (draft: TeaLabSoloDraft) => TeaLabSoloDraft) => void; back: () => void; next: () => void }) {
  const setBrewing = (field: keyof TeaLabSoloDraft["brewing"], value: string, numeric = false) => update(current => ({ ...current, brewing: { ...current.brewing, [field]: numeric ? parseOptionalNumber(value) : value || null } }));
  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 2</p><h1 className="page-title">Set up the brew</h1><p className="page-lede">Everything here is optional. Record only what will help you repeat or compare this tea.</p>
    <div className="grid grid-3">
      <div className="field"><label htmlFor="leaf-grams">Leaf weight (g)</label><input className="input" id="leaf-grams" type="number" min="0.01" max="1000" step="0.1" value={numericValue(draft.brewing.leafGrams)} onChange={event => setBrewing("leafGrams", event.target.value, true)} /></div>
      <div className="field"><label htmlFor="water-ml">Water (ml)</label><input className="input" id="water-ml" type="number" min="1" max="10000" step="1" value={numericValue(draft.brewing.waterMl)} onChange={event => setBrewing("waterMl", event.target.value, true)} /></div>
      <div className="field"><label htmlFor="water-temperature">Temperature (°C)</label><input className="input" id="water-temperature" type="number" min="0" max="100" step="1" value={numericValue(draft.brewing.waterTemperatureC)} onChange={event => setBrewing("waterTemperatureC", event.target.value, true)} /></div>
      <div className="field"><label htmlFor="vessel">Vessel</label><input className="input" id="vessel" maxLength={160} value={draft.brewing.vessel ?? ""} onChange={event => setBrewing("vessel", event.target.value)} /></div>
      <div className="field"><label htmlFor="water-source">Water source</label><input className="input" id="water-source" maxLength={160} value={draft.brewing.waterSource ?? ""} onChange={event => setBrewing("waterSource", event.target.value)} /></div>
      <div className="field"><label htmlFor="steep-seconds">Initial steep (seconds)</label><input className="input" id="steep-seconds" type="number" min="1" max="86400" step="1" value={numericValue(draft.brewing.initialSteepSeconds)} onChange={event => setBrewing("initialSteepSeconds", event.target.value, true)} /></div>
    </div>
    <div className="card-footer"><button className="btn btn-secondary" type="button" onClick={back}>Back</button><button className="btn btn-primary btn-attention" type="button" onClick={next}>Continue to taste</button></div>
  </section>;
}

export function TasteStep({ draft, descriptors, update, back, next, online = true, photoBusy = false, preparePhotoCard, onPhotoBusyChange }: { draft: TeaLabSoloDraft; descriptors: TeaLabDescriptorOption[]; update: (recipe: (draft: TeaLabSoloDraft) => TeaLabSoloDraft) => void; back: () => void; next: () => void; online?: boolean; photoBusy?: boolean; preparePhotoCard?: () => Promise<void>; onPhotoBusyChange?: (busy: boolean) => void }) {
  const setTasting = <K extends keyof TeaLabSoloDraft["tasting"]>(field: K, value: TeaLabSoloDraft["tasting"][K]) => update(current => ({ ...current, tasting: { ...current.tasting, [field]: value } }));
  function moveRating(event: React.KeyboardEvent<HTMLButtonElement>, current: number) {
    const rating = nextTeaLabRating(current, event.key);
    if (rating === null) return;
    event.preventDefault();
    setTasting("rating", rating);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-rating="${rating}"]`)?.focus();
  }
  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 3</p><h1 className="page-title">What did you notice?</h1><p className="page-lede">There are no wrong answers. Your prose stays private.</p>
    <div className="field"><label htmlFor="first-impression">First impression</label><textarea className="textarea" id="first-impression" maxLength={600} value={draft.tasting.firstImpression ?? ""} onChange={event => setTasting("firstImpression", event.target.value || null)} /></div>
    <fieldset className="tea-lab-fieldset"><legend>Flavor descriptors <span className="muted">Choose up to three</span></legend><div className="descriptor-grid">{descriptors.map(descriptor => {
      const selected = draft.tasting.descriptorIds.includes(descriptor.id);
      const unavailable = !selected && draft.tasting.descriptorIds.length >= 3;
      return <button className="descriptor" type="button" aria-pressed={selected} disabled={unavailable} title={descriptor.category} key={descriptor.id} onClick={() => setTasting("descriptorIds", toggleTeaLabDescriptor(draft.tasting.descriptorIds, descriptor.id))}>{descriptor.label}</button>;
    })}</div></fieldset>
    <fieldset className="tea-lab-fieldset"><legend>Overall intensity</legend><div className="grid grid-3">{(["subtle", "clear", "dominant"] as const).map(value => <button className={`btn ${draft.tasting.intensity === value ? "btn-gold" : "btn-secondary"}`} type="button" aria-pressed={draft.tasting.intensity === value} key={value} onClick={() => setTasting("intensity", value)}>{value}</button>)}</div></fieldset>
    <fieldset className="tea-lab-fieldset"><legend>Overall rating <span className="muted">Required to complete</span></legend><div className="rating" role="radiogroup" aria-label="Overall rating">{[1, 2, 3, 4, 5].map(value => <button className={(draft.tasting.rating ?? 0) >= value ? "active" : ""} type="button" role="radio" aria-checked={draft.tasting.rating === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} data-rating={value} tabIndex={draft.tasting.rating === value || (draft.tasting.rating === null && value === 1) ? 0 : -1} key={value} onKeyDown={event => moveRating(event, value)} onClick={() => setTasting("rating", value)}>★</button>)}</div></fieldset>
    <div className="field"><label htmlFor="personal-notes">Private notes</label><textarea className="textarea" id="personal-notes" maxLength={3000} value={draft.tasting.personalNotes ?? ""} onChange={event => setTasting("personalNotes", event.target.value || null)} placeholder="Anything you want to remember…" /></div>
    {preparePhotoCard && onPhotoBusyChange && <TeaLabPhotoCapture cardId={draft.cardId} online={online} prepareCard={preparePhotoCard} onBusyChange={onPhotoBusyChange} />}
    <div className="card-footer"><button className="btn btn-secondary" type="button" disabled={photoBusy} onClick={back}>Back</button><button className="btn btn-primary btn-attention" type="button" disabled={!draft.tasting.rating || photoBusy} onClick={next}>Review tasting</button></div>
  </section>;
}

function ReviewStep({ draft, teaOptions, descriptors, back, complete, busy, blocked }: { draft: TeaLabSoloDraft; teaOptions: TeaLabTeaOption[]; descriptors: TeaLabDescriptorOption[]; back: () => void; complete: () => void; busy: boolean; blocked: boolean }) {
  const labels = draft.tasting.descriptorIds.map(id => descriptors.find(option => option.id === id)?.label).filter(Boolean);
  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 4</p><h1 className="page-title">Review your tasting</h1><p className="page-lede">Completion adds one private card to your Journal and one Documented Tasting seal.</p>
    <dl className="tea-lab-review">
      <div><dt>Tea</dt><dd>{teaLabDraftTeaName(draft, teaOptions)}</dd></div>
      <div><dt>Rating</dt><dd>{draft.tasting.rating ? `${draft.tasting.rating} of 5` : "Required"}</dd></div>
      <div><dt>Intensity</dt><dd>{draft.tasting.intensity ?? "Not recorded"}</dd></div>
      <div><dt>Descriptors</dt><dd>{labels.join(" · ") || "Not recorded"}</dd></div>
      <div><dt>Brew</dt><dd>{[
        draft.brewing.leafGrams ? `${draft.brewing.leafGrams} g` : null,
        draft.brewing.waterMl ? `${draft.brewing.waterMl} ml` : null,
        draft.brewing.waterTemperatureC !== null && draft.brewing.waterTemperatureC !== undefined ? `${draft.brewing.waterTemperatureC} °C` : null,
        draft.brewing.initialSteepSeconds ? `${draft.brewing.initialSteepSeconds} sec` : null
      ].filter(Boolean).join(" · ") || "Not recorded"}</dd></div>
    </dl>
    <div className="notice"><strong>Private by default.</strong><p style={{ margin: "6px 0 0" }}>Your first impression, brewing record, rating and notes are visible only to you.</p></div>
    <div className="card-footer"><button className="btn btn-secondary" type="button" disabled={busy} onClick={back}>Back</button><button className="btn btn-gold btn-attention" type="button" disabled={busy || blocked || !draft.tasting.rating} onClick={complete}>{busy ? "Completing…" : "Complete Tasting"}</button></div>
  </section>;
}
