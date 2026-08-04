"use client";

import { useState } from "react";
import { ChooseTeaStep, teaLabDraftTeaName } from "@/components/tea-lab/TeaLabWorkspace";
import type { TeaLabTeaOption } from "@/lib/tea-lab/lab";
import { createSoloTeaDraft } from "@/lib/tea-lab/offline";

const previewOptions: TeaLabTeaOption[] = [
  {
    key: "canonical:10000000-0000-4000-8000-000000000101",
    name: "Moonlight White",
    producer: "Yunnan Sourcing",
    origin: "Yunnan",
    teaType: "White tea",
    defaultSteepSeconds: 90,
    saved: true,
    selection: { kind: "canonical", canonicalTeaId: "10000000-0000-4000-8000-000000000101" }
  },
  {
    key: "canonical:10000000-0000-4000-8000-000000000102",
    name: "Jasmine Silver Needle",
    producer: "Vintage Fork",
    origin: "Fujian",
    teaType: "Scented white tea",
    defaultSteepSeconds: 150,
    saved: false,
    selection: { kind: "canonical", canonicalTeaId: "10000000-0000-4000-8000-000000000102" }
  },
  {
    key: "personal:10000000-0000-4000-8000-000000000103",
    name: "Grandmother's Roasted Oolong",
    producer: null,
    origin: "Taiwan",
    teaType: "Oolong",
    defaultSteepSeconds: 35,
    saved: false,
    selection: { kind: "personal", personalTeaId: "10000000-0000-4000-8000-000000000103", name: "Grandmother's Roasted Oolong", producer: null, origin: "Taiwan", teaType: "Oolong", harvest: null, lotCode: null }
  },
  {
    key: "canonical:10000000-0000-4000-8000-000000000104",
    name: "Japanese Sencha",
    producer: "Vintage Fork",
    origin: "Shizuoka",
    teaType: "Green tea",
    defaultSteepSeconds: 60,
    saved: false,
    selection: { kind: "canonical", canonicalTeaId: "10000000-0000-4000-8000-000000000104" }
  }
];

export function TeaSearchPreview() {
  const [draft, setDraft] = useState(() => createSoloTeaDraft("preview-owner"));
  const [continued, setContinued] = useState(false);

  return <>
    <ChooseTeaStep
      draft={draft}
      options={previewOptions}
      update={recipe => {
        setContinued(false);
        setDraft(current => recipe(current));
      }}
      next={() => setContinued(true)}
    />
    <div className="notice" role="status" aria-live="polite">
      <strong>{continued ? "Ready to brew" : "Current tea"}</strong>
      <p>{draft.tea ? teaLabDraftTeaName(draft, previewOptions) : "Start typing to choose or create a tea."}</p>
    </div>
  </>;
}
