"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "./SplitFlapTimer.module.css";
import { formatSplitFlapTime, splitFlapTimeParts } from "./time";

export type SplitFlapTimerProps = {
  totalSeconds: number;
  powered?: boolean;
  running?: boolean;
  statusText?: string;
  flipDurationMs?: number;
  className?: string;
};

type DigitTransition = {
  current: string;
  previous: string;
  sequence: number;
  flipping: boolean;
};

function SplitFlapDigit({ digit, flipDurationMs }: { digit: string; flipDurationMs: number }) {
  const [transition, setTransition] = useState<DigitTransition>({
    current: digit,
    previous: digit,
    sequence: 0,
    flipping: false,
  });

  if (transition.current !== digit) {
    setTransition({
      current: digit,
      previous: transition.current,
      sequence: transition.sequence + 1,
      flipping: true,
    });
  }

  useEffect(() => {
    if (!transition.flipping) return;
    const sequence = transition.sequence;
    const timeout = window.setTimeout(() => {
      setTransition((current) => {
        if (current.sequence !== sequence) return current;
        return { ...current, previous: current.current, flipping: false };
      });
    }, flipDurationMs + 24);

    return () => window.clearTimeout(timeout);
  }, [flipDurationMs, transition.flipping, transition.sequence]);

  return (
    <span className={styles.digit} data-flipping={transition.flipping ? "true" : "false"} aria-hidden="true">
      <span className={`${styles.panel} ${styles.staticTop}`}>
        <span data-digit={transition.current}>{transition.current}</span>
      </span>
      <span className={`${styles.panel} ${styles.staticBottom}`}>
        <span data-digit={transition.current}>{transition.current}</span>
      </span>

      {transition.flipping && (
        <span className={styles.animationSet} key={transition.sequence}>
          <span className={`${styles.panel} ${styles.holdBottom}`}>
            <span data-digit={transition.previous}>{transition.previous}</span>
          </span>
          <span className={`${styles.panel} ${styles.flipTop}`}>
            <span data-digit={transition.previous}>{transition.previous}</span>
          </span>
          <span className={`${styles.panel} ${styles.flipBottom}`}>
            <span data-digit={transition.current}>{transition.current}</span>
          </span>
        </span>
      )}

      <span className={styles.axle} />
      <span className={`${styles.hinge} ${styles.hingeLeft}`} />
      <span className={`${styles.hinge} ${styles.hingeRight}`} />
    </span>
  );
}

function TimeBank({ value, label, flipDurationMs }: { value: number; label: string; flipDurationMs: number }) {
  const digits = String(value).padStart(2, "0").split("");

  return (
    <span className={styles.bank}>
      <span className={styles.bankFrame}>
        {digits.map((digit, index) => (
          <SplitFlapDigit digit={digit} flipDurationMs={flipDurationMs} key={`${label}-${index}`} />
        ))}
      </span>
    </span>
  );
}

function Separator() {
  return (
    <span className={styles.separator} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function SplitFlapTimer({
  totalSeconds,
  powered = true,
  running = false,
  statusText,
  flipDurationMs = 520,
  className = "",
}: SplitFlapTimerProps) {
  const parts = splitFlapTimeParts(totalSeconds);
  const formattedTime = formatSplitFlapTime(totalSeconds);
  const resolvedStatus = statusText ?? (powered ? (running ? "COUNTING" : "READY") : "STANDBY");
  const resolvedFlipDuration = Math.min(1200, Math.max(160, flipDurationMs));
  const machineStyle = {
    "--flip-duration": `${resolvedFlipDuration}ms`,
  } as CSSProperties;

  return (
    <section
      className={`${styles.machine} ${className}`.trim()}
      style={machineStyle}
      data-powered={powered ? "true" : "false"}
      data-running={running ? "true" : "false"}
      aria-label={`Infusion timer, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds. ${resolvedStatus}.`}
    >
      <div className={styles.display} role="timer" aria-label={formattedTime}>
        <TimeBank value={parts.hours} label="HR" flipDurationMs={resolvedFlipDuration} />
        <Separator />
        <TimeBank value={parts.minutes} label="MIN" flipDurationMs={resolvedFlipDuration} />
        <Separator />
        <TimeBank value={parts.seconds} label="SEC" flipDurationMs={resolvedFlipDuration} />
      </div>
      <div className={styles.gearTrain} aria-hidden="true">
        <span className={`${styles.gear} ${styles.gearLeft}`} />
        <span className={`${styles.gear} ${styles.gearRight}`} />
      </div>
    </section>
  );
}
