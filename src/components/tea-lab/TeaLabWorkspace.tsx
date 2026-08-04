"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { TeaLabPhotoCapture } from "@/components/tea-lab/TeaLabPhotoCapture";
import { FlavorDescriptorPicker } from "@/components/tea-lab/FlavorDescriptorPicker";
import { TeaLabDurationSlider, TeaLabTemperatureSlider } from "@/components/tea-lab/TeaLabBrewSliders";
import { formatCustomerEventDateTime } from "@/lib/customer-dashboard";
import { IndexedDbTeaLabOfflineStore } from "@/lib/tea-lab/indexed-db";
import {
  collapseUneditedDefaultInfusions,
  createDefaultTeaLabBrewStages,
  formatTeaLabDuration,
  getTeaLabBrewingStyle,
  nextTeaLabBrewStageLabel,
  TEA_LAB_BREWING_STYLE_GROUPS,
  TEA_LAB_BREWING_STYLES,
  teaLabBrewingStyleLabel
} from "@/lib/tea-lab/brewing";
import {
  canNavigateTeaLabFlowStep,
  furthestTeaLabFlowStep,
  inferTeaLabFlowStep,
  isTeaSelectionReady,
  nextTeaLabRating,
  parseOptionalNumber,
  TEA_LAB_FLOW_STEPS,
  toggleTeaLabDescriptor,
  type TeaLabFlowStep
} from "@/lib/tea-lab/lab-flow";
import { chooseDraftForHydration, searchTeaOptions, type TeaLabDescriptorOption, type TeaLabTeaOption } from "@/lib/tea-lab/lab";
import { createSoloTeaDraft, resolveTeaLabSaveIndicator, type TeaLabBrewStageDraft, type TeaLabBrewingStyle, type TeaLabOutboxOperation, type TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import type { TeaLabOfflineStore } from "@/lib/tea-lab/offline-store";
import {
  createTeaLabDraftAutosave,
  createTeaLabSyncRunner,
  fetchTeaLabSessionState,
  queueTeaLabCompletion,
  queueTeaLabDraftSave,
  retryTeaLabBlockedDeviceDraft,
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

const teaLabProgressLabels: Record<TeaLabFlowStep, string> = {
  choose: "Tea",
  brew: "Brew",
  taste: "Taste",
  review: "Review"
};

export function TeaLabProgress({ step, furthestStep, onNavigate }: {
  step: TeaLabFlowStep;
  furthestStep: TeaLabFlowStep;
  onNavigate: (step: TeaLabFlowStep) => void;
}) {
  return <ol className="tea-lab-progress" aria-label="Tasting session progress">
    {TEA_LAB_FLOW_STEPS.map((value, index) => {
      const label = teaLabProgressLabels[value];
      const current = step === value;
      const available = canNavigateTeaLabFlowStep(furthestStep, value);
      return <li className={`${current ? "active " : ""}${available ? "visited" : "locked"}`.trim()} key={value}>
        <button
          type="button"
          data-step={value}
          aria-current={current ? "step" : undefined}
          aria-label={current ? `${label}, current step` : available ? `Edit ${label} step` : `${label} step, complete earlier steps first`}
          disabled={!available}
          onClick={() => onNavigate(value)}
        ><span aria-hidden="true">{index + 1}</span><span>{label}</span></button>
      </li>;
    })}
  </ol>;
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
  const [furthestStep, setFurthestStep] = useState<TeaLabFlowStep>("choose");
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [formError, setFormError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
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
  const recoverableSyncIssue = activeOperations.some(operation =>
    (operation.state === "conflict" || operation.state === "failed")
      && (operation.kind === "save" || operation.kind === "complete")
  );
  const latestServerDraft = draft ? serverDrafts.find(candidate => candidate.sessionId === draft.sessionId) : undefined;
  const conflictRetryCompletesTasting = Boolean(draft && (
    draft.status === "completion_pending"
      || (step === "review" && isTeaSelectionReady(draft) && draft.brewing.style && draft.tasting.rating)
  ));
  const conflictActionLabel = conflictRetryCompletesTasting ? "Save tasting & create Passport seal" : "Use this device copy";

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
    setFurthestStep("choose");
    setFormError("");
    await refreshDeviceState(store);
  }

  function resumeTasting(selected: TeaLabSoloDraft) {
    const compactedStages = selected.brewing.style && selected.brewing.stages
      ? collapseUneditedDefaultInfusions(selected.brewing.style, selected.brewing.stages)
      : selected.brewing.stages;
    const resumed = compactedStages && compactedStages.length !== selected.brewing.stages?.length
      ? { ...selected, brewing: { ...selected.brewing, stages: compactedStages } }
      : selected;
    const resumedStep = inferTeaLabFlowStep(resumed);
    currentDraftRef.current = resumed;
    setDraft(resumed);
    if (resumed !== selected) autosaveRef.current?.schedule(resumed);
    setStep(resumedStep);
    setFurthestStep(resumedStep);
    setFormError("");
  }

  function advanceToStep(nextStep: TeaLabFlowStep) {
    setFormError("");
    setStep(nextStep);
    setFurthestStep(current => furthestTeaLabFlowStep(current, nextStep));
  }

  function navigateToVisitedStep(nextStep: TeaLabFlowStep) {
    if (!canNavigateTeaLabFlowStep(furthestStep, nextStep)) return;
    setFormError("");
    setStep(nextStep);
  }

  async function saveAndReviewTasting() {
    const store = storeRef.current;
    if (!store || !draft || reviewing || photoBusy || !draft.tasting.rating) return;
    setReviewing(true);
    setFormError("");
    try {
      await autosaveRef.current?.flush();
      await refreshDeviceState(store);
      advanceToStep("review");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "This tasting could not be saved before review.");
    } finally {
      setReviewing(false);
    }
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
    if (!store || !draft || photoBusy) return;
    if (!isTeaSelectionReady(draft) || !draft.brewing.style || !draft.tasting.rating) {
      setFormError("Choose a tea and brewing style, then add a rating before completing this tasting.");
      return;
    }
    if (blocked) {
      if (recoverableSyncIssue) await retryDeviceCopy();
      else setFormError("This tasting has a sync issue that must be retried before it can be completed.");
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
    setCompleting(true);
    setFormError("");
    try {
      const serverState = window.navigator.onLine ? await fetchTeaLabSessionState(draft.sessionId) : null;
      const latestServerRevision = Math.max(
        serverState?.revision ?? 0,
        latestServerDraft?.serverRevision ?? 0,
        draft.serverRevision
      );
      const queued = await retryTeaLabBlockedDeviceDraft(
        store,
        draft,
        latestServerRevision,
        conflictRetryCompletesTasting
      );
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
      {blocked && <div className="notice error" role="alert"><p>{recoverableSyncIssue ? "This tasting could not finish syncing. Your device copy is safe and can be saved again." : "This tasting has a sync issue and your device copy has been retained."}</p>{recoverableSyncIssue && <button className="btn btn-secondary" type="button" disabled={completing} onClick={retryDeviceCopy}>{conflictActionLabel}</button>}</div>}
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
    <TeaLabProgress step={step} furthestStep={furthestStep} onNavigate={navigateToVisitedStep} />
    {blocked && <div className="notice error" role="alert"><p>{recoverableSyncIssue ? "This draft could not finish syncing. Your device copy is safe and can be saved again." : "This draft has a sync issue. Your device copy is safe, but syncing is paused until it is reviewed."}</p>{recoverableSyncIssue && <button className="btn btn-secondary" type="button" disabled={completing} onClick={retryDeviceCopy}>{conflictActionLabel}</button>}</div>}
    {formError && <div className="notice error" role="alert">{formError}</div>}
    {step === "choose" && <ChooseTeaStep draft={draft} options={teaOptions} update={replaceDraft} next={() => isTeaSelectionReady(draft) ? advanceToStep("brew") : setFormError("Choose a tea or enter its name to continue.")} />}
    {step === "brew" && <BrewStep draft={draft} update={replaceDraft} back={() => navigateToVisitedStep("choose")} next={() => advanceToStep("taste")} />}
    {step === "taste" && <TasteStep draft={draft} descriptors={descriptorOptions} update={replaceDraft} back={() => navigateToVisitedStep("brew")} next={saveAndReviewTasting} online={online} photoBusy={photoBusy} reviewing={reviewing} preparePhotoCard={preparePhotoCard} onPhotoBusyChange={setPhotoBusy} />}
    {step === "review" && <ReviewStep draft={draft} teaOptions={teaOptions} descriptors={descriptorOptions} back={() => navigateToVisitedStep("taste")} complete={completeTasting} busy={completing || photoBusy} blocked={blocked} recoverableConflict={recoverableSyncIssue} />}
  </div>;
}

function teaSearchValue(draft: TeaLabSoloDraft, options: TeaLabTeaOption[]): string {
  if (!draft.tea) return "";
  if (draft.tea.kind === "personal") return draft.tea.name;
  const canonicalTeaId = draft.tea.canonicalTeaId;
  return options.find(option => option.selection.kind === "canonical"
    && option.selection.canonicalTeaId === canonicalTeaId)?.name ?? "";
}

function teaSearchSource(option: TeaLabTeaOption): string {
  if (option.saved) return "Saved tea";
  return option.selection.kind === "personal" ? "Your tea" : "Catalogue";
}

export function ChooseTeaStep({ draft, options, update, next }: { draft: TeaLabSoloDraft; options: TeaLabTeaOption[]; update: (recipe: (draft: TeaLabSoloDraft) => TeaLabSoloDraft) => void; next: () => void }) {
  const listboxId = useId();
  const helpId = useId();
  const blurTimer = useRef<number | null>(null);
  const [query, setQuery] = useState(() => teaSearchValue(draft, options));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(() => searchTeaOptions(options, query), [options, query]);
  const activeSuggestion = open ? suggestions[activeIndex] : undefined;

  function typeTea(value: string) {
    setQuery(value);
    setOpen(Boolean(value.trim()));
    setActiveIndex(0);
    update(current => ({
      ...current,
      tea: current.tea?.kind === "personal"
        ? { ...current.tea, name: value }
        : {
            kind: "personal",
            personalTeaId: crypto.randomUUID(),
            name: value,
            producer: null,
            origin: null,
            teaType: null,
            cultivar: null,
            harvest: null,
            productIdentifier: null,
            lotCode: null
          }
    }));
  }

  function selectTea(option: TeaLabTeaOption) {
    setQuery(option.name);
    setOpen(false);
    setActiveIndex(0);
    update(current => ({
      ...current,
      tea: { ...option.selection },
      brewing: option.defaultSteepSeconds && !current.brewing.initialSteepSeconds
        ? { ...current.brewing, initialSteepSeconds: option.defaultSteepSeconds }
        : current.brewing
    }));
  }

  function updatePersonal(field: "producer" | "origin" | "teaType" | "harvest" | "lotCode", value: string) {
    update(current => current.tea?.kind === "personal" ? {
      ...current,
      tea: { ...current.tea, [field]: value || null }
    } : current);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length > 0) {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActiveIndex(current => (current + direction + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter" && activeSuggestion) {
      event.preventDefault();
      selectTea(activeSuggestion);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(0);
    }
  }

  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 1</p><h1 className="page-title">Choose the tea</h1><p className="page-lede">Search your saved teas and the Vintage Fork catalogue, or type any tea name—even if it is not in our inventory.</p>
    <div className="field tea-search-field">
      <label htmlFor="tea-lab-tea-search">Choose your tea</label>
      <div className="tea-search-control">
        <input
          className="input"
          id="tea-lab-tea-search"
          type="search"
          role="combobox"
          autoComplete="off"
          maxLength={160}
          value={query}
          placeholder="Start typing a tea name…"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open && suggestions.length > 0 ? listboxId : undefined}
          aria-activedescendant={activeSuggestion ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-describedby={helpId}
          onFocus={() => {
            if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
            setOpen(Boolean(query.trim()));
          }}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 100); }}
          onChange={event => typeTea(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {open && query.trim() && <div className="tea-search-popover">
          {suggestions.length > 0 ? <ul className="tea-search-listbox" id={listboxId} role="listbox" aria-label="Matching teas">
            {suggestions.map((option, index) => <li
              id={`${listboxId}-option-${index}`}
              className="tea-search-option"
              role="option"
              aria-selected={index === activeIndex}
              key={option.key}
              onPointerDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectTea(option)}
            >
              <span><strong>{option.name}</strong><small>{[option.producer, option.origin, option.teaType].filter(Boolean).join(" · ") || "Tea details available"}</small></span>
              <span className="tea-search-source">{teaSearchSource(option)}</span>
            </li>)}
          </ul> : <div className="tea-search-no-match" role="status"><strong>No inventory match</strong><span>Continue with “{query.trim()}” as your private tea.</span></div>}
        </div>}
      </div>
      <p className="help" id={helpId}>{query.trim() && suggestions.length === 0
        ? "No match is required. Your typed tea name can continue to brewing."
        : "Start typing, then choose a suggestion or keep your own full tea name."}</p>
    </div>
    {draft.tea?.kind === "personal" && <>
      <p className="help tea-search-private-note">Optional details for your private tea</p>
      <div className="grid grid-2">
        <div className="field"><label htmlFor="tea-producer">Producer</label><input className="input" id="tea-producer" maxLength={160} value={draft.tea.producer ?? ""} onChange={event => updatePersonal("producer", event.target.value)} /></div>
        <div className="field"><label htmlFor="tea-origin">Origin</label><input className="input" id="tea-origin" maxLength={160} value={draft.tea.origin ?? ""} onChange={event => updatePersonal("origin", event.target.value)} /></div>
        <div className="field"><label htmlFor="tea-type">Tea type</label><input className="input" id="tea-type" maxLength={80} value={draft.tea.teaType ?? ""} onChange={event => updatePersonal("teaType", event.target.value)} /></div>
        <div className="field"><label htmlFor="tea-harvest">Harvest</label><input className="input" id="tea-harvest" maxLength={120} value={draft.tea.harvest ?? ""} onChange={event => updatePersonal("harvest", event.target.value)} /></div>
        <div className="field"><label htmlFor="tea-lot">Lot or batch <span className="muted">(unverified)</span></label><input className="input" id="tea-lot" maxLength={160} value={draft.tea.lotCode ?? ""} onChange={event => updatePersonal("lotCode", event.target.value)} /></div>
      </div>
    </>}
    <div className="card-footer"><span className="muted">Teas outside our inventory remain private to you.</span><button className="btn btn-primary btn-attention" type="button" disabled={!isTeaSelectionReady(draft)} onClick={next}>Continue to brew</button></div>
  </section>;
}

export function BrewStep({ draft, update, back, next }: { draft: TeaLabSoloDraft; update: (recipe: (draft: TeaLabSoloDraft) => TeaLabSoloDraft) => void; back: () => void; next: () => void }) {
  const setBrewing = (field: keyof TeaLabSoloDraft["brewing"], value: string, numeric = false) => update(current => ({ ...current, brewing: { ...current.brewing, [field]: numeric ? parseOptionalNumber(value) : value || null } }));
  const style = getTeaLabBrewingStyle(draft.brewing.style);

  function selectStyle(value: string) {
    if (value !== draft.brewing.style
      && draft.brewing.stages?.some(stage => Boolean(stage.notes?.trim()))
      && !window.confirm("Changing the brewing style will replace your stage plan and its notes. Continue?")) return;
    if (!value) {
      update(current => ({ ...current, brewing: { ...current.brewing, style: null, stages: [] } }));
      return;
    }
    const selected = value as TeaLabBrewingStyle;
    const definition = getTeaLabBrewingStyle(selected);
    if (!definition) return;
    const stages = createDefaultTeaLabBrewStages(selected);
    update(current => ({
      ...current,
      brewing: {
        ...current.brewing,
        style: selected,
        initialSteepSeconds: stages.find(stage => stage.durationSeconds)?.durationSeconds || null,
        stages
      }
    }));
  }

  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 2</p><h1 className="page-title">Choose how you’re brewing</h1><p className="page-lede">Select a method to get an editable stage-by-stage flow. The starting points are guides, not rules.</p>
    <div className="field"><label htmlFor="brewing-style">Brewing style</label><select className="select" id="brewing-style" required value={draft.brewing.style ?? ""} onChange={event => selectStyle(event.target.value)}>
      <option value="">Select a brewing style…</option>
      {TEA_LAB_BREWING_STYLE_GROUPS.map(group => <optgroup label={group.label} key={group.id}>{TEA_LAB_BREWING_STYLES.filter(candidate => candidate.group === group.id).map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}</optgroup>)}
    </select></div>
    {style && <aside className="tea-lab-method-guide" aria-live="polite">
      <div><p className="eyebrow">Your flow</p><h2>{style.label}</h2><p>{style.summary}</p><p className="muted"><strong>Suggested vessel:</strong> {style.vesselSuggestion}</p></div>
      <ul>{style.setupGuidance.map(item => <li key={item}>{item}</li>)}</ul>
    </aside>}
    <p className="help">Changing the style replaces the stage plan. Your leaf, water, and setup notes stay in place.</p>
    <div className="grid grid-3">
      <div className="field"><label htmlFor="leaf-grams">Leaf weight (g)</label><input className="input" id="leaf-grams" type="number" min="0.01" max="1000" step="0.1" value={numericValue(draft.brewing.leafGrams)} onChange={event => setBrewing("leafGrams", event.target.value, true)} /></div>
      <div className="field"><label htmlFor="water-ml">Water (ml)</label><input className="input" id="water-ml" type="number" min="1" max="10000" step="1" value={numericValue(draft.brewing.waterMl)} onChange={event => setBrewing("waterMl", event.target.value, true)} /></div>
      <TeaLabTemperatureSlider id="water-temperature" label="Water temperature" valueC={draft.brewing.waterTemperatureC} onChange={value => update(current => ({ ...current, brewing: { ...current.brewing, waterTemperatureC: value } }))} />
      <div className="field"><label htmlFor="vessel">Vessel</label><input className="input" id="vessel" maxLength={160} value={draft.brewing.vessel ?? ""} onChange={event => setBrewing("vessel", event.target.value)} placeholder={style?.vesselSuggestion} /></div>
      <div className="field"><label htmlFor="water-source">Water source</label><input className="input" id="water-source" maxLength={160} value={draft.brewing.waterSource ?? ""} onChange={event => setBrewing("waterSource", event.target.value)} /></div>
      <TeaLabDurationSlider key={`initial-${style?.id ?? "seconds"}`} id="steep-seconds" label="Initial steep" valueSeconds={draft.brewing.initialSteepSeconds} preferredUnit={style?.durationUnit ?? "seconds"} onChange={value => update(current => ({ ...current, brewing: { ...current.brewing, initialSteepSeconds: value } }))} />
    </div>
    <div className="field"><label htmlFor="preparation-notes">Setup notes</label><textarea className="textarea" id="preparation-notes" maxLength={1200} value={draft.brewing.preparationNotes ?? ""} onChange={event => setBrewing("preparationNotes", event.target.value)} placeholder="Leaf arrangement, rinse, ice amount, spice mix, milk ratio…" /></div>
    <div className="card-footer"><button className="btn btn-secondary" type="button" onClick={back}>Back</button><button className="btn btn-primary btn-attention" type="button" disabled={!draft.brewing.style} onClick={next}>Continue to brew notes</button></div>
  </section>;
}

function BrewStageNotes({ draft, update }: { draft: TeaLabSoloDraft; update: (recipe: (draft: TeaLabSoloDraft) => TeaLabSoloDraft) => void }) {
  const style = getTeaLabBrewingStyle(draft.brewing.style);
  if (!style || !draft.brewing.style) return null;
  const stages = draft.brewing.stages ?? [];
  const isGongfuStyle = style.id === "gongfu" || style.id === "chaozhou_gongfu";
  const updateStages = (recipe: (stages: TeaLabBrewStageDraft[]) => TeaLabBrewStageDraft[]) => update(current => ({
    ...current,
    brewing: { ...current.brewing, stages: recipe(current.brewing.stages ?? []) }
  }));
  const updateStage = (index: number, stageUpdate: Partial<TeaLabBrewStageDraft>) => updateStages(current => current.map((stage, stageIndex) => stageIndex === index ? {
    ...stage,
    ...stageUpdate
  } : stage));
  const addStage = () => updateStages(current => current.length >= 20 ? current : [...current, {
    label: nextTeaLabBrewStageLabel(draft.brewing.style as TeaLabBrewingStyle, current),
    durationSeconds: null,
    temperatureC: null,
    notes: null
  }]);

  return <fieldset className="tea-lab-fieldset tea-lab-brew-stages">
    <legend>{style.label} {style.stageNoun} notes <span className="muted">Optional, private, up to 20</span></legend>
    <p className="help">Capture each stage while you brew. Edit the guide to match this tea and your own practice.</p>
    <div className="tea-lab-stage-list">{stages.map((stage, index) => {
      const prompt = style.stages[index]?.notePrompt ?? `What did you notice during this ${style.stageNoun}?`;
      const noteLabel = isGongfuStyle
        ? index === 0 ? "How’s your first infusion?" : "What’s changed?"
        : "What changed?";
      return <article className="tea-lab-stage" key={index}>
        <div className="tea-lab-stage-heading"><span>{index + 1}</span><div className="field"><label htmlFor={`brew-stage-label-${index}`}>Stage name</label><input className="input" id={`brew-stage-label-${index}`} maxLength={80} value={stage.label} onChange={event => { if (event.target.value.trim()) updateStage(index, { label: event.target.value }); }} /></div>{stages.length > 1 && <button className="btn btn-quiet danger" type="button" aria-label={`Remove ${stage.label}`} onClick={() => updateStages(current => current.filter((_, stageIndex) => stageIndex !== index))}>Remove</button>}</div>
        <div className="grid grid-2">
          <TeaLabDurationSlider key={`${style.id}-${index}-duration`} id={`brew-stage-duration-${index}`} label="Infusion time" valueSeconds={stage.durationSeconds} preferredUnit={style.durationUnit} onChange={value => updateStage(index, { durationSeconds: value })} />
          <TeaLabTemperatureSlider id={`brew-stage-temperature-${index}`} label="Water temperature" valueC={stage.temperatureC} onChange={value => updateStage(index, { temperatureC: value })} />
        </div>
        <div className="field"><label htmlFor={`brew-stage-notes-${index}`}>{noteLabel}</label><textarea className="textarea" id={`brew-stage-notes-${index}`} maxLength={600} value={stage.notes ?? ""} onChange={event => updateStage(index, { notes: event.target.value || null })} placeholder={prompt} /></div>
      </article>;
    })}</div>
    {stages.length < 20 && <button className="btn btn-secondary" type="button" onClick={addStage}>+ Add {style.nextStageLabel?.toLocaleLowerCase("en-CA") ?? "infusion"}</button>}
  </fieldset>;
}

export function TasteStep({ draft, descriptors, update, back, next, online = true, photoBusy = false, reviewing = false, preparePhotoCard, onPhotoBusyChange }: { draft: TeaLabSoloDraft; descriptors: TeaLabDescriptorOption[]; update: (recipe: (draft: TeaLabSoloDraft) => TeaLabSoloDraft) => void; back: () => void; next: () => void | Promise<void>; online?: boolean; photoBusy?: boolean; reviewing?: boolean; preparePhotoCard?: () => Promise<void>; onPhotoBusyChange?: (busy: boolean) => void }) {
  const setTasting = <K extends keyof TeaLabSoloDraft["tasting"]>(field: K, value: TeaLabSoloDraft["tasting"][K]) => update(current => ({ ...current, tasting: { ...current.tasting, [field]: value } }));
  function moveRating(event: React.KeyboardEvent<HTMLButtonElement>, current: number) {
    const rating = nextTeaLabRating(current, event.key);
    if (rating === null) return;
    event.preventDefault();
    setTasting("rating", rating);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-rating="${rating}"]`)?.focus();
  }
  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 3</p><h1 className="page-title">Brew and notice</h1><p className="page-lede">Follow your {teaLabBrewingStyleLabel(draft.brewing.style) ?? "chosen"} flow, then capture the cup as a whole. Your prose stays private.</p>
    <BrewStageNotes draft={draft} update={update} />
    <div className="field"><label htmlFor="first-impression">First impression</label><textarea className="textarea" id="first-impression" maxLength={600} value={draft.tasting.firstImpression ?? ""} onChange={event => setTasting("firstImpression", event.target.value || null)} /></div>
    <FlavorDescriptorPicker options={descriptors} selectedIds={draft.tasting.descriptorIds} onToggle={descriptorId => setTasting("descriptorIds", toggleTeaLabDescriptor(draft.tasting.descriptorIds, descriptorId))} />
    <fieldset className="tea-lab-fieldset"><legend>Overall intensity</legend><div className="grid grid-3">{(["subtle", "clear", "dominant"] as const).map(value => <button className={`btn ${draft.tasting.intensity === value ? "btn-gold" : "btn-secondary"}`} type="button" aria-pressed={draft.tasting.intensity === value} key={value} onClick={() => setTasting("intensity", value)}>{value}</button>)}</div></fieldset>
    <fieldset className="tea-lab-fieldset"><legend>Overall rating <span className="muted">Required to complete</span></legend><div className="rating" role="radiogroup" aria-label="Overall rating">{[1, 2, 3, 4, 5].map(value => <button className={(draft.tasting.rating ?? 0) >= value ? "active" : ""} type="button" role="radio" aria-checked={draft.tasting.rating === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} data-rating={value} tabIndex={draft.tasting.rating === value || (draft.tasting.rating === null && value === 1) ? 0 : -1} key={value} onKeyDown={event => moveRating(event, value)} onClick={() => setTasting("rating", value)}>★</button>)}</div></fieldset>
    <div className="field"><label htmlFor="personal-notes">Private notes</label><textarea className="textarea" id="personal-notes" maxLength={3000} value={draft.tasting.personalNotes ?? ""} onChange={event => setTasting("personalNotes", event.target.value || null)} placeholder="Anything you want to remember…" /></div>
    {preparePhotoCard && onPhotoBusyChange && <TeaLabPhotoCapture cardId={draft.cardId} online={online} prepareCard={preparePhotoCard} onBusyChange={onPhotoBusyChange} />}
    <div className="card-footer"><button className="btn btn-secondary" type="button" disabled={photoBusy || reviewing} onClick={back}>Back</button><button className="btn btn-primary btn-attention" type="button" disabled={!draft.tasting.rating || photoBusy || reviewing} onClick={next}>{reviewing ? "Saving…" : "Save & Review"}</button></div>
  </section>;
}

export function ReviewStep({ draft, teaOptions, descriptors, back, complete, busy, blocked, recoverableConflict = false }: { draft: TeaLabSoloDraft; teaOptions: TeaLabTeaOption[]; descriptors: TeaLabDescriptorOption[]; back: () => void; complete: () => void; busy: boolean; blocked: boolean; recoverableConflict?: boolean }) {
  const labels = draft.tasting.descriptorIds.map(id => descriptors.find(option => option.id === id)?.label).filter(Boolean);
  return <section className="card tea-lab-step">
    <p className="eyebrow">Step 4</p><h1 className="page-title">Review your tasting</h1><p className="page-lede">Completion adds one private card to your Journal and one Documented Tasting seal.</p>
    <dl className="tea-lab-review">
      <div><dt>Tea</dt><dd>{teaLabDraftTeaName(draft, teaOptions)}</dd></div>
      <div><dt>Brewing style</dt><dd>{teaLabBrewingStyleLabel(draft.brewing.style) ?? "Not recorded"}</dd></div>
      <div><dt>Rating</dt><dd>{draft.tasting.rating ? `${draft.tasting.rating} of 5` : "Required"}</dd></div>
      <div><dt>Intensity</dt><dd>{draft.tasting.intensity ?? "Not recorded"}</dd></div>
      <div><dt>Descriptors</dt><dd>{labels.join(" · ") || "Not recorded"}</dd></div>
      <div><dt>Brew</dt><dd>{[
        draft.brewing.leafGrams ? `${draft.brewing.leafGrams} g` : null,
        draft.brewing.waterMl ? `${draft.brewing.waterMl} ml` : null,
        draft.brewing.waterTemperatureC !== null && draft.brewing.waterTemperatureC !== undefined ? `${draft.brewing.waterTemperatureC} °C` : null,
        formatTeaLabDuration(draft.brewing.initialSteepSeconds)
      ].filter(Boolean).join(" · ") || "Not recorded"}</dd></div>
      <div><dt>Stages</dt><dd>{draft.brewing.stages?.length ? `${draft.brewing.stages.length} recorded` : "Not recorded"}</dd></div>
    </dl>
    <div className="notice"><strong>Private by default.</strong><p style={{ margin: "6px 0 0" }}>Your first impression, brewing record, rating and notes are visible only to you.</p></div>
    <div className="card-footer"><button className="btn btn-secondary" type="button" disabled={busy} onClick={back}>Back</button><button className="btn btn-gold btn-attention" type="button" disabled={busy || (blocked && !recoverableConflict) || !draft.brewing.style || !draft.tasting.rating} onClick={complete}>{busy ? "Completing…" : recoverableConflict ? "Save This Copy & Complete" : "Complete Tasting"}</button></div>
  </section>;
}
