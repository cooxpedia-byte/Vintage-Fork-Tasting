"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
  preloadVintageTimerFeedback,
  VINTAGE_TIMER_COMPLETION_CHIME
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

const WHEEL_DRAG_DETENT_PX = 22;
const WHEEL_MIN_DETENT_MS = 64;
const WHEEL_MAX_COAST_MS = 148;
const WHEEL_MIN_COAST_VELOCITY = .11;
const WHEEL_COAST_FRICTION = .82;
const WHEEL_MAX_COAST_STEPS = 18;

type WheelDirection = -1 | 1;

function wheelDirection(value: number): WheelDirection {
  return value < 0 ? -1 : 1;
}

function wheelCoastIntervalMs(velocityPxPerMs: number) {
  return Math.max(
    WHEEL_MIN_DETENT_MS,
    Math.min(WHEEL_MAX_COAST_MS, Math.round(WHEEL_DRAG_DETENT_PX / Math.abs(velocityPxPerMs)))
  );
}

function TeaTimerBotanicalMark() {
  return <Image
    className="tea-lab-duration-mark"
    src="/brand/vintage-fork-icon.jpg"
    alt=""
    width={96}
    height={96}
    aria-hidden="true"
    priority
  />;
}

type MachineTimerStatus = "ready" | "steeping" | "paused" | "complete";

const MACHINE_STATUS_LABELS: Record<MachineTimerStatus, string> = {
  ready: "Ready",
  steeping: "Steeping",
  paused: "Paused",
  complete: "Complete"
};

function SplitFlapDigit({ value }: { value: string }) {
  const [transition, setTransition] = useState({
    previous: value,
    current: value,
    sequence: 0
  });

  if (transition.current !== value) {
    setTransition({
      previous: transition.current,
      current: value,
      sequence: transition.sequence + 1
    });
  }

  return <span className="machine-odometer-digit" aria-hidden="true">
    <span
      className="machine-split-flap"
      data-changing={transition.previous === transition.current ? "false" : "true"}
      key={transition.sequence}
    >
      <span className="machine-split-flap-face machine-split-flap-top">
        <span>{transition.current}</span>
      </span>
      <span className="machine-split-flap-face machine-split-flap-bottom">
        <span>{transition.current}</span>
      </span>
      {transition.previous !== transition.current ? <>
        <span className="machine-split-flap-face machine-split-flap-flip-out">
          <span>{transition.previous}</span>
        </span>
        <span className="machine-split-flap-face machine-split-flap-flip-in">
          <span>{transition.current}</span>
        </span>
      </> : null}
      <span className="machine-split-flap-seam" />
    </span>
  </span>;
}

function MechanicalClock({ totalSeconds }: { totalSeconds: number }) {
  const parts = splitTeaLabDuration(totalSeconds);
  const groups = [
    { value: parts.hours, unit: "hr" },
    { value: parts.minutes, unit: "min" },
    { value: parts.seconds, unit: "sec" }
  ];

  return <span className="machine-clock" aria-hidden="true">
    {groups.map((group, groupIndex) => {
      const digits = paddedDurationPart(group.value).split("");
      return <span className="machine-clock-section" key={group.unit}>
        {groupIndex > 0 ? <span className="machine-clock-colon">:</span> : null}
        <span className="machine-odometer-module">
          <span className="machine-odometer-axle machine-odometer-axle-left" />
          <span className="machine-odometer-digits">
            {digits.map((digit, digitIndex) => <SplitFlapDigit
              value={digit}
              key={`${group.unit}-${digitIndex}`}
            />)}
          </span>
          <span className="machine-odometer-axle machine-odometer-axle-right" />
        </span>
        <small>{group.unit}</small>
      </span>;
    })}
  </span>;
}

function TeaTimerNixieReadout({ totalSeconds }: { totalSeconds: number }) {
  const parts = splitTeaLabDuration(totalSeconds);
  const groups = [
    { value: parts.hours, unit: "hr" },
    { value: parts.minutes, unit: "min" },
    { value: parts.seconds, unit: "sec" }
  ];

  return <span className="tea-lab-duration-nixie" aria-hidden="true">
    {groups.map(group => <span className="tea-lab-duration-nixie-group" key={group.unit}>
      <span className="tea-lab-duration-nixie-tube">{paddedDurationPart(group.value)}</span>
      <small>{group.unit}</small>
    </span>)}
  </span>;
}

function MachineHeader({
  soundEnabled,
  powerOn,
  disabled,
  onSoundToggle,
  onPowerToggle
}: {
  soundEnabled: boolean;
  powerOn: boolean;
  disabled: boolean;
  onSoundToggle?: () => void;
  onPowerToggle: () => void;
}) {
  return <div className="tea-lab-duration-title machine-header">
    <span className="machine-brand-medallion">
      <TeaTimerBotanicalMark />
    </span>
    <div className="tea-lab-duration-copy machine-identification-plate">
      <span className="tea-lab-field-label">Infusion Time Machine</span>
      <small>Precision Tea Timer</small>
    </div>
    <div className="machine-header-controls" data-has-sound={onSoundToggle ? "true" : "false"}>
      {onSoundToggle ? <button
        className="tea-lab-duration-sound-switch"
        type="button"
        role="switch"
        data-on={soundEnabled ? "true" : "false"}
        data-feedback-silent="true"
        aria-label={`Mechanical sound ${soundEnabled ? "on" : "off"}`}
        aria-checked={soundEnabled}
        onClick={onSoundToggle}
      >
        <span className="machine-sound-lamp" aria-hidden="true" />
        <small>Sound</small>
        <strong>{soundEnabled ? "On" : "Off"}</strong>
      </button> : null}
      <button
        className="tea-lab-duration-power-switch"
        type="button"
        role="switch"
        data-on={powerOn ? "true" : "false"}
        data-feedback-silent="true"
        disabled={disabled}
        aria-label={powerOn ? "Turn infusion timer power off" : "Turn infusion timer power on"}
        aria-checked={powerOn}
        onClick={onPowerToggle}
      >
        <span className="tea-lab-duration-switch-on">On</span>
        <span className="tea-lab-duration-switch-lever" aria-hidden="true" />
        <span className="tea-lab-duration-switch-off">Off</span>
      </button>
    </div>
  </div>;
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
  onStep: (direction: WheelDirection, detentIntervalMs?: number) => boolean;
}) {
  const pointerY = useRef<number | null>(null);
  const pointerAt = useRef(0);
  const dragDistance = useRef(0);
  const dragVelocity = useRef(0);
  const wheelDelta = useRef(0);
  const lastDetentAt = useRef(0);
  const coastTimer = useRef<number | null>(null);
  const disabledRef = useRef(disabled);
  const [dragProgress, setDragProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [motion, setMotion] = useState({ direction: 0 as -1 | 0 | 1, sequence: 0, intervalMs: WHEEL_MIN_DETENT_MS });
  const [gearMotion, setGearMotion] = useState({ teeth: 0, intervalMs: WHEEL_MIN_DETENT_MS });
  const labelId = `${id}-label`;

  useEffect(() => () => {
    if (coastTimer.current !== null) window.clearTimeout(coastTimer.current);
  }, []);

  useEffect(() => {
    disabledRef.current = disabled;
    if (disabled && coastTimer.current !== null) {
      window.clearTimeout(coastTimer.current);
      coastTimer.current = null;
    }
  }, [disabled]);

  function stopCoast() {
    if (coastTimer.current !== null) window.clearTimeout(coastTimer.current);
    coastTimer.current = null;
  }

  function detentInterval(now: number) {
    const elapsed = lastDetentAt.current ? now - lastDetentAt.current : WHEEL_MIN_DETENT_MS;
    lastDetentAt.current = now;
    return Math.max(WHEEL_MIN_DETENT_MS, Math.min(WHEEL_MAX_COAST_MS, elapsed));
  }

  function animateCoastStep(direction: WheelDirection, intervalMs: number) {
    setMotion(current => ({ direction, intervalMs, sequence: current.sequence + 1 }));
    turnGear(direction, intervalMs);
  }

  function turnGear(direction: WheelDirection, intervalMs: number) {
    setGearMotion(current => ({ teeth: current.teeth + direction, intervalMs }));
  }

  function startCoast(initialVelocity: number) {
    stopCoast();
    let velocity = Math.max(-2.4, Math.min(2.4, initialVelocity));
    let coastSteps = 0;

    const coast = () => {
      if (disabledRef.current || Math.abs(velocity) < WHEEL_MIN_COAST_VELOCITY || coastSteps >= WHEEL_MAX_COAST_STEPS) {
        coastTimer.current = null;
        return;
      }
      const intervalMs = wheelCoastIntervalMs(velocity);
      coastTimer.current = window.setTimeout(() => {
        coastTimer.current = null;
        const direction = wheelDirection(velocity);
        const changed = onStep(direction, intervalMs);
        if (!changed) return;
        lastDetentAt.current = window.performance.now();
        animateCoastStep(direction, intervalMs);
        velocity *= WHEEL_COAST_FRICTION;
        coastSteps += 1;
        coast();
      }, intervalMs);
    };

    coast();
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    stopCoast();
    wheelDelta.current += event.deltaY;
    if (Math.abs(wheelDelta.current) < 18) return;
    if (lastDetentAt.current && event.timeStamp - lastDetentAt.current < WHEEL_MIN_DETENT_MS) return;
    const direction = wheelDirection(wheelDelta.current);
    wheelDelta.current -= direction * 18;
    const intervalMs = detentInterval(event.timeStamp);
    if (onStep(direction, intervalMs)) animateCoastStep(direction, intervalMs);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    stopCoast();
    pointerY.current = event.clientY;
    pointerAt.current = event.timeStamp;
    dragDistance.current = 0;
    dragVelocity.current = 0;
    setDragProgress(0);
    setDragging(true);
    setMotion(current => ({ ...current, direction: 0 }));
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (disabled || pointerY.current === null) return;
    const elapsed = Math.max(1, event.timeStamp - pointerAt.current);
    const distance = pointerY.current - event.clientY;
    const instantVelocity = distance / elapsed;
    dragVelocity.current = dragVelocity.current * .58 + instantVelocity * .42;
    dragDistance.current += distance;
    pointerY.current = event.clientY;
    pointerAt.current = event.timeStamp;

    const readyForDetent = !lastDetentAt.current || event.timeStamp - lastDetentAt.current >= WHEEL_MIN_DETENT_MS;
    if (readyForDetent && Math.abs(dragDistance.current) >= WHEEL_DRAG_DETENT_PX) {
      const direction = wheelDirection(dragDistance.current);
      const intervalMs = detentInterval(event.timeStamp);
      if (onStep(direction, intervalMs)) {
        dragDistance.current -= direction * WHEEL_DRAG_DETENT_PX;
        turnGear(direction, intervalMs);
      } else {
        dragDistance.current = 0;
        dragVelocity.current = 0;
      }
    }
    setDragProgress(Math.max(-.96, Math.min(.96, dragDistance.current / WHEEL_DRAG_DETENT_PX)));
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    const velocity = dragVelocity.current;
    pointerY.current = null;
    dragDistance.current = 0;
    dragVelocity.current = 0;
    setDragProgress(0);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (Math.abs(velocity) >= WHEEL_MIN_COAST_VELOCITY) startCoast(velocity);
  }

  function cancelPointer(event: PointerEvent<HTMLDivElement>) {
    dragVelocity.current = 0;
    finishPointer(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const steps = event.key === "ArrowUp" ? 1
      : event.key === "ArrowDown" ? -1
      : event.key === "PageUp" ? 1
      : event.key === "PageDown" ? -1
      : event.key === "Home" ? value ? -1 : 0
      : event.key === "End" ? value < max ? 1 : 0
      : null;
    if (steps === null) return;
    event.preventDefault();
    if (steps) {
      const direction = wheelDirection(steps);
      const intervalMs = detentInterval(event.timeStamp);
      if (onStep(direction, intervalMs)) animateCoastStep(direction, intervalMs);
    }
  }

  function stepButton(direction: WheelDirection) {
    if (onStep(direction, WHEEL_MIN_DETENT_MS)) turnGear(direction, WHEEL_MIN_DETENT_MS);
  }

  return <div className="tea-lab-duration-column" data-machine-part={label.toLocaleLowerCase("en-CA")}>
    <span
      className="tea-lab-duration-rotary"
      aria-hidden="true"
      style={{
        "--gear-turn": `${gearMotion.teeth * 18}deg`,
        "--gear-counter-turn": `${gearMotion.teeth * -27}deg`,
        "--gear-step-duration": `${gearMotion.intervalMs}ms`
      } as CSSProperties}
    />
    <span className="tea-lab-duration-label" id={labelId}>{label}</span>
    <button
      className="tea-lab-duration-step"
      type="button"
      aria-label={`Increase ${label.toLocaleLowerCase("en-CA")}`}
      data-feedback-silent="true"
      disabled={disabled}
      onClick={() => stepButton(1)}
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
      data-dragging={dragging ? "true" : "false"}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={cancelPointer}
      onKeyDown={handleKeyDown}
    >
      <span className="tea-lab-duration-knob tea-lab-duration-knob-left" aria-hidden="true" />
      <span className="tea-lab-duration-knob tea-lab-duration-knob-right" aria-hidden="true" />
      <div
        className="tea-lab-duration-strip"
        data-step={motion.direction}
        key={motion.sequence}
        style={{
          "--wheel-drag-offset": `${-20 - dragProgress * 20}%`,
          "--wheel-step-duration": `${motion.intervalMs}ms`
        } as CSSProperties}
      >
        {([-2, -1, 0, 1, 2] as const).map(offset => offset === 0
          ? <strong key={offset}>{paddedDurationPart(value)}</strong>
          : <span aria-hidden="true" key={offset}>{paddedDurationPart(adjacentDurationPart(value, offset, max))}</span>)}
      </div>
      <span className="tea-lab-duration-glass" aria-hidden="true" />
      <span className="tea-lab-duration-sight" aria-hidden="true" />
    </div>
    <button
      className="tea-lab-duration-step"
      type="button"
      aria-label={`Decrease ${label.toLocaleLowerCase("en-CA")}`}
      data-feedback-silent="true"
      disabled={disabled}
      onClick={() => stepButton(-1)}
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
  soundEnabled = true,
  onSoundToggle,
  onChange
}: {
  id: string;
  label: string;
  valueSeconds: number | null | undefined;
  preferredUnit: TeaLabBrewDurationUnit;
  disabled?: boolean;
  enableTimer?: boolean;
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
  onChange: (seconds: number | null) => void;
}) {
  const totalSeconds = normalizeTeaLabDurationSeconds(valueSeconds);
  const parts = splitTeaLabDuration(totalSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const [warm, setWarm] = useState(false);
  const [powerOn, setPowerOn] = useState(true);
  const [timerStatus, setTimerStatus] = useState<MachineTimerStatus>("ready");
  const [completionAnnouncement, setCompletionAnnouncement] = useState("");
  const deadline = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const durationSecondsRef = useRef(totalSeconds);

  useEffect(() => {
    durationSecondsRef.current = totalSeconds;
  }, [totalSeconds]);

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
      setTimerStatus("complete");
      setCompletionAnnouncement("Infusion complete.");
      playVintageTimerEvent("timerCompletePrimary", "timerComplete");
      window.setTimeout(() => playVintageTimerEvent("timerCompleteSecondary"), 500);
      playVintageTimerEvent("timerCompleteChime", undefined, {
        delayMs: VINTAGE_TIMER_COMPLETION_CHIME.delayMs
      });
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  function scheduleDetent(intervalMs: number) {
    playVintageWheelDetents(1, intervalMs);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      playVintageTimerEvent("wheelSettle", "wheelSettle");
      settleTimer.current = null;
    }, Math.max(92, Math.min(180, intervalMs * 2.4)));
  }

  function stepDuration(part: TeaLabDurationPart, direction: WheelDirection, intervalMs = WHEEL_MIN_DETENT_MS) {
    const currentSeconds = durationSecondsRef.current;
    const nextSeconds = adjustTeaLabDuration(currentSeconds, part, direction);
    if (nextSeconds === currentSeconds) return false;
    durationSecondsRef.current = nextSeconds;
    if (enableTimer && !running) {
      setRemainingSeconds(nextSeconds);
      setTimerStatus("ready");
      setCompletionAnnouncement("");
    }
    onChange(nextSeconds || null);
    scheduleDetent(intervalMs);
    return true;
  }

  function toggleTimer() {
    if (!powerOn) return;
    if (running) {
      const next = deadline.current === null ? remainingSeconds : Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      deadline.current = null;
      setRemainingSeconds(next);
      setRunning(false);
      setWarm(false);
      setTimerStatus("paused");
      setCompletionAnnouncement("");
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
    setTimerStatus("steeping");
    setCompletionAnnouncement("");
    playVintageTimerEvent("startMechanical", "startTimer");
    window.setTimeout(() => playVintageTimerEvent("startRelay", "mechanicalEngage"), 82);
  }

  function resetTimer() {
    deadline.current = null;
    durationSecondsRef.current = 0;
    setRunning(false);
    setWarm(false);
    setRemainingSeconds(0);
    setTimerStatus("ready");
    setCompletionAnnouncement("");
    onChange(null);
    playVintageTimerEvent("buttonDown", "softPress");
    window.setTimeout(() => playVintageTimerEvent("buttonRelease", "mechanicalEngage"), 58);
  }

  function togglePower() {
    const nextPowerOn = !powerOn;
    if (!nextPowerOn) {
      deadline.current = null;
      setRunning(false);
      setWarm(false);
      setTimerStatus("ready");
      setCompletionAnnouncement("");
    }
    setPowerOn(nextPowerOn);
    playVintageTimerEvent("buttonDown", "softPress");
    window.setTimeout(() => playVintageTimerEvent("buttonRelease", "mechanicalEngage"), 58);
  }

  return <div
    className="field tea-lab-slider-field tea-lab-duration-field"
    id={id}
    data-preferred-unit={preferredUnit}
    data-timer-running={running ? "true" : "false"}
    data-timer-warm={warm ? "true" : "false"}
    data-timer-status={timerStatus}
    data-power-on={powerOn ? "true" : "false"}
    data-timer-machine={enableTimer ? "true" : "false"}
  >
    <div className="tea-lab-slider-heading">
      {enableTimer ? <MachineHeader
        soundEnabled={soundEnabled}
        powerOn={powerOn}
        disabled={disabled}
        onSoundToggle={onSoundToggle}
        onPowerToggle={togglePower}
      /> : <div className="tea-lab-duration-title">
        <TeaTimerBotanicalMark />
        <div className="tea-lab-duration-copy">
          <span className="tea-lab-field-label">{label}</span>
        </div>
      </div>}
      {enableTimer ? <div className="machine-clock-panel">
        <div
          className="machine-clock-output"
          role="timer"
          aria-label={formatTeaLabDuration(remainingSeconds) ?? "0 sec"}
        >
          <MechanicalClock totalSeconds={remainingSeconds} />
        </div>
        <div
          className="machine-status"
          role="status"
          aria-label={`Timer status: ${powerOn ? MACHINE_STATUS_LABELS[timerStatus] : "Power off"}`}
        >
          <span className="machine-status-lamp" aria-hidden="true" />
          <span>Machine status</span>
          <strong>{powerOn ? MACHINE_STATUS_LABELS[timerStatus] : "Power off"}</strong>
        </div>
      </div> : <output aria-label={formatTeaLabDuration(totalSeconds) ?? "0 sec"}>
        <TeaTimerNixieReadout totalSeconds={totalSeconds} />
      </output>}
    </div>
    <div className="tea-lab-duration-wheel" role="group" aria-label={`${enableTimer ? "Infusion Time Machine" : label} duration`}>
      {DURATION_PARTS.map(definition => <DurationWheelColumn
        id={`${id}-${definition.part}`}
        label={definition.label}
        value={parts[definition.part]}
        max={definition.max}
        disabled={disabled || running || !powerOn}
        onStep={(steps, intervalMs) => stepDuration(definition.part, steps, intervalMs)}
        key={definition.part}
      />)}
    </div>
    {enableTimer && <div className="tea-lab-timer-controls">
      <button
        className="btn tea-lab-timer-start"
        type="button"
        data-feedback-silent="true"
        disabled={!powerOn || (!running && !remainingSeconds && !totalSeconds)}
        aria-pressed={running}
        onClick={toggleTimer}
      >
        <span className="tea-lab-timer-indicator" aria-hidden="true" />
        <span>{running ? "Pause steep" : timerStatus === "paused" ? "Resume steep" : "Start steep"}</span>
      </button>
      <button
        className="btn btn-quiet tea-lab-timer-reset"
        type="button"
        data-feedback-silent="true"
        disabled={disabled || !powerOn}
        aria-label="Reset infusion timer to zero"
        onClick={resetTimer}
      ><span aria-hidden="true">↻</span> Reset</button>
      <p className="tea-lab-timer-tip"><span aria-hidden="true">❧</span> Good tea takes patience. Breathe. Steep. Enjoy.</p>
      <span className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {completionAnnouncement}
      </span>
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
