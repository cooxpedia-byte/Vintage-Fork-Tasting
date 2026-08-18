"use client";

import { useEffect, useState } from "react";
import { getConductorStage } from "@/lib/conductor";
import type { ConductorStage } from "@/types/domain";

export function ConductorStageHeader({ stage, sequenceNumber, lateJoin = false }: {
  stage: ConductorStage;
  sequenceNumber: number;
  lateJoin?: boolean;
}) {
  const [visible, setVisible] = useState(true);
  const definition = getConductorStage(stage);

  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), 0);
    const hide = window.setTimeout(() => setVisible(false), 2_600);
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, [sequenceNumber, stage]);

  return <>
    {visible && <div className="conductor-stage-transition" role="status" aria-live="polite" aria-atomic="true">
      <span>{lateJoin ? "You joined during" : "Now"}</span>
      <strong>{definition.label}</strong>
      <p>{definition.instruction}</p>
    </div>}
    <header className="conductor-stage-header">
      <span className="eyebrow">Current stage</span>
      <strong>{definition.label}</strong>
      <p>{definition.instruction}</p>
    </header>
  </>;
}
