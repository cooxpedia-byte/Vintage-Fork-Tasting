"use client";

import { useState } from "react";
import { TeaLabProgress } from "@/components/tea-lab/TeaLabWorkspace";
import type { TeaLabFlowStep } from "@/lib/tea-lab/lab-flow";

const labels: Record<TeaLabFlowStep, string> = {
  choose: "Tea",
  brew: "Brew",
  taste: "Taste",
  review: "Review"
};

export function TeaLabProgressPreview() {
  const [step, setStep] = useState<TeaLabFlowStep>("review");

  return <section className="card tea-lab-workspace">
    <TeaLabProgress step={step} furthestStep="review" onNavigate={setStep} />
    <div className="notice" role="status" aria-live="polite">
      <strong>{labels[step]} step</strong>
      <p>You are editing the {labels[step].toLowerCase()} page. Every previously visited page remains available above.</p>
    </div>
  </section>;
}
