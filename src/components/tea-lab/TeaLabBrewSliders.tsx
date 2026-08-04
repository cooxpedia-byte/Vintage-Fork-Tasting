"use client";

import { useState } from "react";
import {
  durationInputToSeconds,
  durationSecondsToInput,
  type TeaLabBrewDurationUnit
} from "@/lib/tea-lab/brewing";

const DURATION_UNITS: { value: TeaLabBrewDurationUnit; label: string; shortLabel: string }[] = [
  { value: "seconds", label: "Seconds", shortLabel: "sec" },
  { value: "minutes", label: "Minutes", shortLabel: "min" },
  { value: "hours", label: "Hours", shortLabel: "hr" }
];

function sliderDurationValue(seconds: number | null | undefined, unit: TeaLabBrewDurationUnit): number {
  const converted = durationSecondsToInput(seconds, unit);
  if (converted === "") return 0;
  return Math.min(60, Math.max(0, Number(converted)));
}

function bestDurationUnit(seconds: number | null | undefined, preferredUnit: TeaLabBrewDurationUnit): TeaLabBrewDurationUnit {
  if (!seconds) return preferredUnit;
  const candidates = [preferredUnit, ...DURATION_UNITS.map(option => option.value)];
  return candidates.find((unit, index) => candidates.indexOf(unit) === index && Number(durationSecondsToInput(seconds, unit)) <= 60) ?? "hours";
}

function durationFromSlider(value: string, unit: TeaLabBrewDurationUnit): number | null {
  if (Number(value) === 0) return null;
  return durationInputToSeconds(value, unit);
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
  const [unit, setUnit] = useState<TeaLabBrewDurationUnit>(() => bestDurationUnit(valueSeconds, preferredUnit));
  const value = sliderDurationValue(valueSeconds, unit);
  const unitDefinition = DURATION_UNITS.find(option => option.value === unit) ?? DURATION_UNITS[0];

  function changeUnit(nextUnit: TeaLabBrewDurationUnit) {
    setUnit(nextUnit);
  }

  return <div className="field tea-lab-slider-field">
    <div className="tea-lab-slider-heading">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{value} {unitDefinition.shortLabel}</output>
    </div>
    <input
      className="tea-lab-slider"
      id={id}
      type="range"
      min="0"
      max="60"
      step={unit === "seconds" ? "1" : "0.1"}
      value={value}
      disabled={disabled}
      aria-valuetext={`${value} ${unit}`}
      onChange={event => onChange(durationFromSlider(event.target.value, unit))}
    />
    <div className="tea-lab-slider-footer">
      <span aria-hidden="true">0</span>
      <label className="sr-only" htmlFor={`${id}-unit`}>{label} unit</label>
      <select
        className="tea-lab-duration-unit"
        id={`${id}-unit`}
        value={unit}
        disabled={disabled}
        onChange={event => changeUnit(event.target.value as TeaLabBrewDurationUnit)}
      >
        {DURATION_UNITS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
      <span aria-hidden="true">60</span>
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
