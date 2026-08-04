"use client";

import { useState } from "react";
import { FlavorDescriptorPicker } from "@/components/tea-lab/FlavorDescriptorPicker";
import { TEA_DESCRIPTOR_PALETTE } from "@/lib/tea-lab/descriptors";

const options = TEA_DESCRIPTOR_PALETTE.map(({ id, label, category, aliases }) => ({
  id,
  label,
  category,
  aliases
}));

export function FlavorPalettePreview() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedLabels = selectedIds.flatMap(id => {
    const descriptor = TEA_DESCRIPTOR_PALETTE.find(item => item.id === id);
    return descriptor ? [descriptor.label] : [];
  });

  return <section className="card tea-lab-step">
    <FlavorDescriptorPicker
      options={options}
      selectedIds={selectedIds}
      onToggle={id => setSelectedIds(current => current.includes(id)
        ? current.filter(selectedId => selectedId !== id)
        : current.length < 5 ? [...current, id] : current)}
    />
    <div className="notice" aria-live="polite">
      <strong>Current selection</strong>
      <p>{selectedLabels.length > 0 ? selectedLabels.join(" · ") : "Nothing selected yet."}</p>
    </div>
  </section>;
}
