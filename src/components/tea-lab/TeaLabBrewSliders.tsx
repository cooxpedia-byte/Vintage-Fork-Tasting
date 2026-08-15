"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import {
  adjustTeaLabDuration,
  formatTeaLabDuration,
  normalizeTeaLabDurationSeconds,
  splitTeaLabDuration,
  TEA_LAB_MAX_DURATION_HOURS,
  type TeaLabBrewDurationUnit,
  type TeaLabDurationPart
} from "@/lib/tea-lab/brewing";
import {
  playVintageTimerEvent,
  playVintageWheelDetents,
  preloadVintageTimerFeedback
} from "@/lib/vintage-timer-feedback";

const DURATION_PARTS: Array<{
  part: TeaLabDurationPart;
  label: string;
  max: number;
}> = [
  { part: "hours", label: "Hours", max: TEA_LAB_MAX_DURATION_HOURS },
  { part: "minutes", label: "Minutes", max: 59 },
  { part: "seconds", label: "Seconds", max: 59 }
];

function paddedDurationPart(value: number) {
  return String(value).padStart(2, "0");
}

function adjacentDurationPart(value: number, offset: number, max: number) {
  if (max === TEA_LAB_MAX_DURATION_HOURS) {
    return Math.min(max, Math.max(0, value + offset));
  }
  return (value + offset + max + 1) % (max + 1);
}

function DurationWheelColumn({
  id,
  label,
  value,
  max,
  disabled,
  onStep
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onStep: (steps: number, detentIntervalMs?: number) => void;
}) {
  const dragY = useRef<number | null>(null);
  const wheelDelta = useRef(0);
  const lastDetentAt = useRef(0);
  const labelId = `${id}-label`;

  function detentInterval(steps: number, now: number) {
    const elapsed = lastDetentAt.current ? now - lastDetentAt.current : 46;
    lastDetentAt.current = now;
    return Math.max(12, Math.min(90, elapsed / Math.max(1, Math.abs(steps))));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    wheelDelta.current += event.deltaY;
    const steps = Math.trunc(wheelDelta.current / 18);
    if (!steps) return;
    wheelDelta.current -= steps * 18;
    onStep(steps, detentInterval(steps, event.timeStamp));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    dragY.current = event.clientY;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (disabled || dragY.current === null) return;
    const distance = dragY.current - event.clientY;
    const steps = Math.trunc(distance / 22);
    if (!steps) return;
    dragY.current = event.clientY;
    onStep(steps, detentInterval(steps, event.timeStamp));
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    dragY.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const steps = event.key === "ArrowUp" ? 1
      : event.key === "ArrowDown" ? -1
      : event.key === "PageUp" ? 5
      : event.key === "PageDown" ? -5
      : event.key === "Home" ? -value
      : event.key === "End" ? max - value
      : null;
    if (steps === null) return;
    event.preventDefault();
    onStep(steps, detentInterval(steps, event.timeStamp));
  }

  function pressButton() {
    if (!disabled) playVintageTimerEvent("buttonDown", "softPress");
  }

  function releaseButton() {
    if (!disabled) playVintageTimerEvent("buttonRelease", "mechanicalEngage", { delayMs: 48 });
  }

  return <div className="tea-lab-duration-column">
    <span className="tea-lab-duration-label" id={labelId}>{label}</span>
    <button
      className="tea-lab-duration-step"
      type="button"
      aria-label={`Increase ${label.toLocaleLowerCase("en-CA")}`}
      data-feedback-silent="true"
      disabled={disabled}
      onPointerDown={pressButton}
      onPointerUp={releaseButton}
      onPointerCancel={releaseButton}
      onClick={() => onStep(1, 58)}
    ><span aria-hidden="true">▲</span></button>
    <div
      className="tea-lab-duration-viewport"
      id={id}
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-labelledby={labelId}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} ${label.toLocaleLowerCase("en-CA")}`}
      aria-disabled={disabled}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true">{paddedDurationPart(adjacentDurationPart(value, -1, max))}</span>
      <strong>{paddedDurationPart(value)}</strong>
      <span aria-hidden="true">{paddedDurationPart(adjacentDurationPart(value, 1, max))}</span>
    </div>
    <button
      className="tea-lab-duration-step"
      type="button"
      aria-label={`Decrease ${label.toLocaleLowerCase("en-CA")}`}
      data-feedback-silent="true"
      disabled={disabled}
      onPointerDown={pressButton}
      onPointerUp={releaseButton}
      onPointerCancel={releaseButton}
      onClick={() => onStep(-1, 58)}
    ><span aria-hidden="true">▼</span></button>
  </div>;
}

export function TeaLabDurationSlider({
  id,
  label,
  valueSeconds,
  preferredUnit,
  disabled = false,
  enableTimer = false,
  onChange
}: {
  id: string;
  label: string;
  valueSeconds: number | null | undefined;
  preferredUnit: TeaLabBrewDurationUnit;
  disabled?: boolean;
  enableTimer?: boolean;
  onChange: (seconds: number | null) => void;
}) {
  const totalSeconds = normalizeTeaLabDurationSeconds(valueSeconds);
  const parts = splitTeaLabDuration(totalSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const [warm, setWarm] = useState(false);
  const deadline = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    void preloadVintageTimerFeedback();
  }, []);

  useEffect(() => {
    if (!running || deadline.current === null) return;
    const updateRemaining = () => {
      if (deadline.current === null) return;
      const next = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next > 0) return;
      deadline.current = null;
      setRunning(false);
      setWarm(false);
      playVintageTimerEvent("timerCompletePrimary", "timerComplete");
      window.setTimeout(() => playVintageTimerEvent("timerCompleteSecondary"), 500);
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  function scheduleDetents(steps: number, intervalMs: number) {
    playVintageWheelDetents(steps, intervalMs);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      playVintageTimerEvent("wheelSettle", "wheelSettle");
      settleTimer.current = null;
    }, Math.max(92, Math.min(180, intervalMs * 2.4)));
  }

  function stepDuration(part: TeaLabDurationPart, steps: number, intervalMs = 46) {
    const nextSeconds = adjustTeaLabDuration(totalSeconds, part, steps);
    if (nextSeconds === totalSeconds) return;
    if (enableTimer && !running) setRemainingSeconds(nextSeconds);
    onChange(nextSeconds || null);
    scheduleDetents(steps, intervalMs);
  }

  function toggleTimer() {
    if (running) {
      const next = deadline.current === null ? remainingSeconds : Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      deadline.current = null;
      setRemainingSeconds(next);
      setRunning(false);
      setWarm(false);
      playVintageTimerEvent("buttonDown", "softPress");
      window.setTimeout(() => playVintageTimerEvent("buttonRelease", "mechanicalEngage"), 58);
      return;
    }
    const duration = remainingSeconds || totalSeconds;
    if (!duration) return;
    deadline.current = Date.now() + duration * 1000;
    setRemainingSeconds(duration);
    setRunning(true);
    setWarm(true);
    playVintageTimerEvent("startMechanical", "startTimer");
    window.setTimeout(() => playVintageTimerEvent("startRelay", "mechanicalEngage"), 82);
  }

  function resetTimer() {
    deadline.current = null;
    setRunning(false);
    setWarm(false);
    setRemainingSeconds(totalSeconds);
    playVintageTimerEvent("buttonDown", "softPress");
    window.setTimeout(() => playVintageTimerEvent("buttonRelease", "mechanicalEngage"), 58);
  }

  return <div
    className="field tea-lab-slider-field tea-lab-duration-field"
    id={id}
    data-preferred-unit={preferredUnit}
    data-timer-running={running ? "true" : "false"}
    data-timer-warm={warm ? "true" : "false"}
  >
    <div className="tea-lab-slider-heading">
      <span><span className="tea-lab-field-label">{label}</span>{enableTimer && <small>Set your first infusion</small>}</span>
      <output aria-live="polite">{formatTeaLabDuration(enableTimer ? remainingSeconds : totalSeconds) ?? "0 sec"}</output>
    </div>
    <div className="tea-lab-duration-wheel" role="group" aria-label={`${label} duration`}>
      {DURATION_PARTS.map(definition => <DurationWheelColumn
        id={`${id}-${definition.part}`}
        label={definition.label}
        value={parts[definition.part]}
        max={definition.max}
        disabled={disabled || running}
        onStep={(steps, intervalMs) => stepDuration(definition.part, steps, intervalMs)}
        key={definition.part}
      />)}
    </div>
    {enableTimer && <div className="tea-lab-timer-controls">
      <button
        className="btn tea-lab-timer-start"
        type="button"
        data-feedback-silent="true"
        disabled={!running && !remainingSeconds && !totalSeconds}
        aria-pressed={running}
        onClick={toggleTimer}
      ><span className="tea-lab-timer-indicator" aria-hidden="true" />{running ? "Pause steep" : remainingSeconds > 0 && remainingSeconds !== totalSeconds ? "Resume steep" : "Start steep"}</button>
      <button className="btn btn-quiet tea-lab-timer-reset" type="button" data-feedback-silent="true" disabled={!running && remainingSeconds === totalSeconds} onClick={resetTimer}>↻ Reset</button>
      <p className="tea-lab-timer-tip"><span aria-hidden="true">❧</span> Good tea takes patience. Breathe, steep, enjoy.</p>
    </div>}
  </div>;
}

export function TeaLabTemperatureSlider({
  id,
  label = "Temperature",
  valueC,
  disabled = false,
  onChange
}: {
  id: string;
  label?: string;
  valueC: number | null | undefined;
  disabled?: boolean;
  onChange: (temperatureC: number) => void;
}) {
  const value = Math.min(100, Math.max(0, valueC ?? 0));
  return <div className="field tea-lab-slider-field">
    <div className="tea-lab-slider-heading">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{value} °C</output>
    </div>
    <input
      className="tea-lab-slider"
      id={id}
      type="range"
      min="0"
      max="100"
      step="1"
      value={value}
      disabled={disabled}
      aria-valuetext={`${value} degrees Celsius`}
      onChange={event => onChange(Number(event.target.value))}
    />
    <div className="tea-lab-slider-scale" aria-hidden="true"><span>0 °C</span><span>100 °C</span></div>
  </div>;
}
