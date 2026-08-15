"use client";

import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import { playInterfaceFeedback } from "@/components/InterfaceFeedback";
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
  INTERFACE_FEEDBACK_STORAGE_KEY,
  resolveInterfaceFeedbackEnabled
} from "@/lib/interface-feedback";

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

function playDurationWheelFeedback() {
  try {
    if (!resolveInterfaceFeedbackEnabled(
      window.localStorage.getItem(INTERFACE_FEEDBACK_STORAGE_KEY),
      true
    )) return;
  } catch {
    // Feedback stays available when storage is unavailable in a secure webview.
  }
  playInterfaceFeedback("selection");
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
  onStep: (steps: number, playFeedback?: boolean) => void;
}) {
  const dragY = useRef<number | null>(null);
  const wheelDelta = useRef(0);
  const labelId = `${id}-label`;

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    wheelDelta.current += event.deltaY;
    const steps = Math.trunc(wheelDelta.current / 18);
    if (!steps) return;
    wheelDelta.current -= steps * 18;
    onStep(steps);
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
    onStep(steps);
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
    onStep(steps);
  }

  return <div className="tea-lab-duration-column">
    <span className="tea-lab-duration-label" id={labelId}>{label}</span>
    <button
      className="tea-lab-duration-step"
      type="button"
      aria-label={`Increase ${label.toLocaleLowerCase("en-CA")}`}
      data-feedback-kind="selection"
      disabled={disabled}
      onClick={() => onStep(1, false)}
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
      data-feedback-kind="selection"
      disabled={disabled}
      onClick={() => onStep(-1, false)}
    ><span aria-hidden="true">▼</span></button>
  </div>;
}

export function TeaLabDurationSlider({
  id,
  label,
  valueSeconds,
  preferredUnit,
  disabled = false,
  onChange
}: {
  id: string;
  label: string;
  valueSeconds: number | null | undefined;
  preferredUnit: TeaLabBrewDurationUnit;
  disabled?: boolean;
  onChange: (seconds: number | null) => void;
}) {
  const totalSeconds = normalizeTeaLabDurationSeconds(valueSeconds);
  const parts = splitTeaLabDuration(totalSeconds);

  function stepDuration(part: TeaLabDurationPart, steps: number, feedback = true) {
    const nextSeconds = adjustTeaLabDuration(totalSeconds, part, steps);
    if (nextSeconds === totalSeconds) return;
    onChange(nextSeconds || null);
    if (feedback) playDurationWheelFeedback();
  }

  return <div
    className="field tea-lab-slider-field tea-lab-duration-field"
    id={id}
    data-preferred-unit={preferredUnit}
  >
    <div className="tea-lab-slider-heading">
      <span className="tea-lab-field-label">{label}</span>
      <output>{formatTeaLabDuration(totalSeconds) ?? "0 sec"}</output>
    </div>
    <div className="tea-lab-duration-wheel" role="group" aria-label={`${label} duration`}>
      {DURATION_PARTS.map(definition => <DurationWheelColumn
        id={`${id}-${definition.part}`}
        label={definition.label}
        value={parts[definition.part]}
        max={definition.max}
        disabled={disabled}
        onStep={(steps, feedback) => stepDuration(definition.part, steps, feedback)}
        key={definition.part}
      />)}
    </div>
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
