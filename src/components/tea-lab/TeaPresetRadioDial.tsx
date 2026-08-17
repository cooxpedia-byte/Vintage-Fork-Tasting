"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent
} from "react";

export type TeaTimerPreset = Readonly<{
  id: string;
  label: string;
  seconds: number;
  temperatureC?: number;
  disabled?: boolean;
}>;

export type TeaPresetSelectionSource = "pointer" | "keyboard";

export function formatPresetDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function radioDialIndexForKey(key: string, currentIndex: number, itemCount: number) {
  if (itemCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowLeft") return Math.max(0, currentIndex - 1);
  if (key === "ArrowRight") return Math.min(itemCount - 1, currentIndex + 1);
  return currentIndex;
}

export function nearestRadioDialIndex(
  scrollLeft: number,
  viewportWidth: number,
  itemCentres: readonly number[]
) {
  if (itemCentres.length === 0) return -1;
  const pointerCentre = scrollLeft + viewportWidth / 2;
  let nearestIndex = 0;
  let nearestDistance = Math.abs(itemCentres[0] - pointerCentre);
  for (let index = 1; index < itemCentres.length; index += 1) {
    const distance = Math.abs(itemCentres[index] - pointerCentre);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestIndex;
}

export function presetMatchesDuration(preset: TeaTimerPreset | undefined, seconds: number | null) {
  return Boolean(preset && seconds !== null && preset.seconds === seconds);
}

type TeaPresetRadioDialProps = {
  presets: readonly TeaTimerPreset[];
  selectedPresetId: string | null;
  durationSeconds: number | null;
  disabled?: boolean;
  onSelect: (preset: TeaTimerPreset, source: TeaPresetSelectionSource) => void;
};

type PointerSession = {
  id: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  dragging: boolean;
  vertical: boolean;
};

const SETTLE_DELAY_MS = 118;
const PROGRAMMATIC_SCROLL_GUARD_MS = 340;
const HORIZONTAL_INTENT_PX = 9;

export function TeaPresetRadioDial({
  presets,
  selectedPresetId,
  durationSeconds,
  disabled = false,
  onSelect
}: TeaPresetRadioDialProps) {
  const scaleRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pointerSession = useRef<PointerSession | null>(null);
  const settleTimer = useRef<number | null>(null);
  const programmaticUntil = useRef(0);
  const suppressClick = useRef(false);
  const initialSelectedIndex = Math.max(0, presets.findIndex(preset => preset.id === selectedPresetId));
  const [previewIndex, setPreviewIndex] = useState(initialSelectedIndex);
  const committedIndex = presets.findIndex(preset => preset.id === selectedPresetId);
  const selectedIndex = committedIndex >= 0 ? committedIndex : previewIndex;

  const selectedPreset = useMemo(
    () => presets.find(preset => preset.id === selectedPresetId),
    [presets, selectedPresetId]
  );
  const exactPreset = presetMatchesDuration(selectedPreset, durationSeconds);
  const readout = exactPreset && selectedPreset
    ? `${selectedPreset.label} · ${formatPresetDuration(selectedPreset.seconds)}${typeof selectedPreset.temperatureC === "number" ? ` · ${selectedPreset.temperatureC}°C` : ""}`
    : `Custom time · ${formatPresetDuration(durationSeconds ?? 0)}`;

  const centreIndex = useCallback((index: number, behaviour: ScrollBehavior) => {
    const scale = scaleRef.current;
    const item = itemRefs.current[index];
    if (!scale || !item) return;
    const left = item.offsetLeft - (scale.clientWidth - item.offsetWidth) / 2;
    programmaticUntil.current = performance.now() + PROGRAMMATIC_SCROLL_GUARD_MS;
    scale.scrollTo({ left, behavior: behaviour });
  }, []);

  const nearestIndex = useCallback(() => {
    const scale = scaleRef.current;
    if (!scale) return -1;
    return nearestRadioDialIndex(
      scale.scrollLeft,
      scale.clientWidth,
      itemRefs.current.map(item => item ? item.offsetLeft + item.offsetWidth / 2 : 0)
    );
  }, []);

  const commitIndex = useCallback((index: number, source: TeaPresetSelectionSource) => {
    const preset = presets[index];
    if (!preset || disabled || preset.disabled) return;
    setPreviewIndex(index);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    centreIndex(index, reduceMotion ? "auto" : "smooth");
    if (preset.id !== selectedPresetId || !presetMatchesDuration(preset, durationSeconds)) {
      onSelect(preset, source);
    }
  }, [centreIndex, disabled, durationSeconds, onSelect, presets, selectedPresetId]);

  const settleNearest = useCallback((source: TeaPresetSelectionSource) => {
    const index = nearestIndex();
    if (index >= 0) commitIndex(index, source);
  }, [commitIndex, nearestIndex]);

  useEffect(() => {
    const index = presets.findIndex(preset => preset.id === selectedPresetId);
    if (index < 0) return;
    const frame = window.requestAnimationFrame(() => {
      setPreviewIndex(index);
      centreIndex(index, "auto");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [centreIndex, presets, selectedPresetId]);

  useEffect(() => {
    const scale = scaleRef.current;
    if (!scale || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => centreIndex(previewIndex, "auto"));
    observer.observe(scale);
    return () => observer.disconnect();
  }, [centreIndex, previewIndex]);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  function handleScroll() {
    const index = nearestIndex();
    if (index >= 0) setPreviewIndex(index);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (pointerSession.current?.dragging || performance.now() < programmaticUntil.current) return;
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      settleNearest("pointer");
    }, SETTLE_DELAY_MS);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    pointerSession.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scaleRef.current?.scrollLeft ?? 0,
      dragging: false,
      vertical: false
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const session = pointerSession.current;
    const scale = scaleRef.current;
    if (!session || !scale || session.id !== event.pointerId || session.vertical) return;
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (!session.dragging) {
      if (Math.abs(deltaY) > HORIZONTAL_INTENT_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
        session.vertical = true;
        return;
      }
      if (Math.abs(deltaX) < HORIZONTAL_INTENT_PX || Math.abs(deltaX) <= Math.abs(deltaY) * 1.08) return;
      session.dragging = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    scale.scrollLeft = session.startScrollLeft - deltaX;
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const session = pointerSession.current;
    if (!session || session.id !== event.pointerId) return;
    pointerSession.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (session.dragging) {
      if (cancelled) centreIndex(selectedIndex, "auto");
      else settleNearest("pointer");
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = radioDialIndexForKey(event.key, selectedIndex, presets.length);
    commitIndex(index, "keyboard");
    window.requestAnimationFrame(() => itemRefs.current[index]?.focus({ preventScroll: true }));
  }

  const previousDisabled = disabled || selectedIndex <= 0;
  const nextDisabled = disabled || selectedIndex >= presets.length - 1;

  return <section className="tea-preset-radio-dial" aria-label="Tea timer presets">
    <div className="tea-preset-radio-housing">
      <button
        className="tea-preset-radio-step tea-preset-radio-step-previous"
        type="button"
        data-feedback-silent="true"
        disabled={previousDisabled}
        aria-label="Previous tea preset"
        onClick={() => commitIndex(selectedIndex - 1, "pointer")}
      ><span aria-hidden="true">‹</span></button>
      <div className="tea-preset-radio-window">
        <div
          className="tea-preset-radio-scale"
          ref={scaleRef}
          role="radiogroup"
          aria-label="Tea infusion preset"
          aria-disabled={disabled || undefined}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={event => finishPointer(event)}
          onPointerCancel={event => finishPointer(event, true)}
        >
          {presets.map((preset, index) => {
            const selected = exactPreset && selectedPresetId === preset.id;
            const preview = previewIndex === index;
            const duration = formatPresetDuration(preset.seconds);
            const temperature = typeof preset.temperatureC === "number" ? `, ${preset.temperatureC} degrees Celsius` : "";
            return <button
              className="tea-preset-radio-station"
              type="button"
              data-feedback-silent="true"
              data-preview={preview ? "true" : "false"}
              data-selected={selected ? "true" : "false"}
              disabled={disabled || preset.disabled}
              role="radio"
              aria-checked={selected}
              aria-label={`${preset.label}, ${duration}${temperature}${selected ? ", selected" : ""}`}
              tabIndex={index === selectedIndex ? 0 : -1}
              onClick={event => {
                if (suppressClick.current) return;
                commitIndex(index, event.detail === 0 ? "keyboard" : "pointer");
              }}
              ref={element => { itemRefs.current[index] = element; }}
              key={preset.id}
            >
              <span className="tea-preset-radio-label">{preset.label}</span>
              <span className="tea-preset-radio-ticks" aria-hidden="true"><i /><i /><i /></span>
            </button>;
          })}
        </div>
        <span className="tea-preset-radio-pointer" aria-hidden="true" />
        <span className="tea-preset-radio-vignette" aria-hidden="true" />
      </div>
      <button
        className="tea-preset-radio-step tea-preset-radio-step-next"
        type="button"
        data-feedback-silent="true"
        disabled={nextDisabled}
        aria-label="Next tea preset"
        onClick={() => commitIndex(selectedIndex + 1, "pointer")}
      ><span aria-hidden="true">›</span></button>
      <p className="tea-preset-radio-readout" role="status" aria-live="polite">{readout}</p>
    </div>
  </section>;
}
