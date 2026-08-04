"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent
} from "react";
import { TEA_DESCRIPTOR_CATEGORY_ORDER, normalizeTeaDescriptor } from "@/lib/tea-lab/descriptors";

const knownDescriptorCategories = new Set<string>(TEA_DESCRIPTOR_CATEGORY_ORDER);

export type FlavorDescriptorPickerOption = {
  id: string;
  label: string;
  category: string;
  aliases?: readonly string[];
};

type WheelDrag = {
  pointerId: number;
  startAngle: number;
  startRotation: number;
};

type DescriptorPointerDrag = {
  pointerId: number;
  descriptorId: string;
  sourceElement: HTMLButtonElement;
  startX: number;
  startY: number;
  moved: boolean;
};

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function shortestAngle(value: number): number {
  return positiveModulo(value + 180, 360) - 180;
}

export function flavorWheelIndex(rotation: number, categoryCount: number): number {
  if (categoryCount < 1) return 0;
  return positiveModulo(-Math.round(rotation / (360 / categoryCount)), categoryCount);
}

export function flavorWheelRotation(index: number, categoryCount: number): number {
  return categoryCount < 1 ? 0 : -positiveModulo(index, categoryCount) * (360 / categoryCount);
}

function pointerAngle(event: PointerEvent<HTMLDivElement>): number {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.atan2(
    event.clientY - (bounds.top + bounds.height / 2),
    event.clientX - (bounds.left + bounds.width / 2)
  ) * 180 / Math.PI;
}

export function FlavorDescriptorPicker({
  options,
  selectedIds,
  onToggle,
  maximum = 5
}: {
  options: FlavorDescriptorPickerOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  maximum?: number;
}) {
  const searchId = useId();
  const panelHeadingId = useId();
  const dropzoneId = useId();
  const wheelDrag = useRef<WheelDrag | null>(null);
  const descriptorPointerDrag = useRef<DescriptorPointerDrag | null>(null);
  const suppressDescriptorClick = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [rotation, setRotation] = useState(0);
  const [draggingWheel, setDraggingWheel] = useState(false);
  const [draggingDescriptor, setDraggingDescriptor] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const optionById = useMemo(() => new Map(options.map(option => [option.id, option])), [options]);
  const categories = useMemo(() => {
    const available = new Set(options.map(option => option.category));
    const known = TEA_DESCRIPTOR_CATEGORY_ORDER.filter(category => available.has(category));
    const additional = [...available].filter(category => !knownDescriptorCategories.has(category)).sort();
    return [...known, ...additional];
  }, [options]);

  const currentCategory = categories.includes(activeCategory) ? activeCategory : categories[0] ?? "";
  const normalizedQuery = normalizeTeaDescriptor(query);
  const visibleOptions = useMemo(() => {
    if (!normalizedQuery) return options.filter(option => option.category === currentCategory);
    return options.filter(option => [option.label, option.category, ...(option.aliases ?? [])]
      .some(term => normalizeTeaDescriptor(term).includes(normalizedQuery)));
  }, [currentCategory, normalizedQuery, options]);
  const selectedOptions = selectedIds.flatMap(id => {
    const option = optionById.get(id);
    return option ? [option] : [];
  });

  function openCategory(category: string) {
    const index = categories.indexOf(category);
    if (index < 0) return;
    setActiveCategory(category);
    setRotation(flavorWheelRotation(index, categories.length));
    setQuery("");
  }

  function finishWheel(nextRotation: number) {
    const index = flavorWheelIndex(nextRotation, categories.length);
    const category = categories[index];
    setRotation(flavorWheelRotation(index, categories.length));
    if (category) setActiveCategory(category);
    setQuery("");
    wheelDrag.current = null;
    setDraggingWheel(false);
  }

  function onWheelPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button") || categories.length < 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    wheelDrag.current = { pointerId: event.pointerId, startAngle: pointerAngle(event), startRotation: rotation };
    setDraggingWheel(true);
  }

  function onWheelPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = wheelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setRotation(drag.startRotation + shortestAngle(pointerAngle(event) - drag.startAngle));
  }

  function onWheelPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = wheelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishWheel(drag.startRotation + shortestAngle(pointerAngle(event) - drag.startAngle));
  }

  function addDescriptor(id: string) {
    if (!optionById.has(id) || selected.has(id) || selectedIds.length >= maximum) return;
    onToggle(id);
  }

  function pointerIsOverDropzone(event: PointerEvent<HTMLElement>): boolean {
    const dropzone = document.getElementById(dropzoneId);
    const target = document.elementFromPoint(event.clientX, event.clientY);
    return Boolean(dropzone && target && dropzone.contains(target));
  }

  function startDescriptorPointerDrag(event: PointerEvent<HTMLButtonElement>, descriptorId: string, unavailable: boolean) {
    if (unavailable || selected.has(descriptorId)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    descriptorPointerDrag.current = {
      pointerId: event.pointerId,
      descriptorId,
      sourceElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  }

  function moveDescriptorPointerDrag(event: PointerEvent<HTMLElement>) {
    const drag = descriptorPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7;
    drag.moved = moved;
    if (!moved) return;
    event.preventDefault();
    setDraggingDescriptor(drag.descriptorId);
    setDropActive(pointerIsOverDropzone(event));
  }

  function finishDescriptorPointerDrag(event: PointerEvent<HTMLElement>) {
    const drag = descriptorPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.sourceElement.hasPointerCapture(event.pointerId)) drag.sourceElement.releasePointerCapture(event.pointerId);
    const dropped = drag.moved && pointerIsOverDropzone(event);
    descriptorPointerDrag.current = null;
    setDraggingDescriptor(null);
    setDropActive(false);
    if (!drag.moved) return;
    suppressDescriptorClick.current = drag.descriptorId;
    window.setTimeout(() => {
      if (suppressDescriptorClick.current === drag.descriptorId) suppressDescriptorClick.current = null;
    }, 0);
    if (dropped) addDescriptor(drag.descriptorId);
  }

  const wheelStyle = {
    "--wheel-step": `${categories.length > 0 ? 360 / categories.length : 360}deg`,
    "--wheel-rotation": `${rotation}deg`
  } as CSSProperties;

  return <fieldset className="tea-lab-fieldset flavor-descriptor-picker" onPointerMove={moveDescriptorPointerDrag} onPointerUp={finishDescriptorPointerDrag} onPointerCancel={finishDescriptorPointerDrag}>
    <legend>Flavour descriptors <span className="muted">Choose up to {maximum}</span></legend>
    <div className="descriptor-toolbar">
      <div className="field"><label htmlFor={searchId}>Search every flavour</label><input className="input" id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try peach, malt, seaweed, silky…" /></div>
      <output aria-live="polite">{selectedIds.length} of {maximum} selected</output>
    </div>

    {categories.length === 0 ? <div className="empty-state descriptor-empty"><p>No flavour descriptors are available.</p></div> : <div className="flavor-picker-stage">
      <section className="descriptor-wheel-area" aria-label="Flavour category wheel">
        <div className="descriptor-wheel-marker" aria-hidden="true"><span /></div>
        <div
          className={`descriptor-wheel ${draggingWheel ? "dragging" : ""}`}
          style={wheelStyle}
          onPointerDown={onWheelPointerDown}
          onPointerMove={onWheelPointerMove}
          onPointerUp={onWheelPointerEnd}
          onPointerCancel={onWheelPointerEnd}
        >
          <div className="descriptor-wheel-disc" aria-hidden="true" />
          {categories.map((category, index) => {
            const angle = index * (360 / categories.length) + rotation;
            const radians = angle * Math.PI / 180;
            const categoryStyle = {
              left: `${50 + Math.sin(radians) * 39}%`,
              top: `${50 - Math.cos(radians) * 39}%`
            };
            return <button className="descriptor-wheel-category" type="button" aria-pressed={currentCategory === category} style={categoryStyle} key={category} onPointerDown={event => event.stopPropagation()} onClick={() => openCategory(category)}>{category}</button>;
          })}
          <div className="descriptor-wheel-center" aria-live="polite"><span>Open palette</span><strong>{currentCategory}</strong><small>Drag wheel or tap a category</small></div>
        </div>
      </section>

      <div className="flavor-picker-workspace">
        <section
          id={dropzoneId}
          className={`flavor-palette-dropzone ${dropActive ? "drop-active" : ""}`}
          aria-label="Your flavour palette"
        >
          <div className="flavor-palette-heading"><div><p className="eyebrow">Your flavour palette</p><h3>Drop flavours here</h3></div><output aria-live="polite">{selectedIds.length}/{maximum}</output></div>
          {selectedOptions.length > 0 ? <div className="flavor-palette-selection">{selectedOptions.map(option => <div className="flavor-palette-chip" key={option.id}><span>{option.label}</span><button type="button" aria-label={`Remove ${option.label}`} onClick={() => onToggle(option.id)}>×</button></div>)}</div> : <p className="flavor-palette-empty">Drag a descriptor from the open category, or tap one to add it.</p>}
          <div className="flavor-palette-slots" aria-hidden="true">{Array.from({ length: Math.max(0, maximum - selectedIds.length) }, (_, index) => <span key={index}>+</span>)}</div>
        </section>

        <section className="descriptor-source-panel" aria-labelledby={panelHeadingId}>
          <div className="descriptor-source-heading"><div><p className="eyebrow">{normalizedQuery ? "Search results" : "Open category"}</p><h3 id={panelHeadingId}>{normalizedQuery ? `Matching “${query}”` : currentCategory}</h3></div>{normalizedQuery && <button className="btn btn-quiet" type="button" onClick={() => setQuery("")}>Clear</button>}</div>
          {visibleOptions.length === 0 ? <div className="empty-state descriptor-empty"><p>No descriptors match “{query}”.</p></div> : <div className="descriptor-source-grid">{visibleOptions.map(option => {
            const isSelected = selected.has(option.id);
            const unavailable = !isSelected && selectedIds.length >= maximum;
            return <button
              className={`descriptor descriptor-source ${draggingDescriptor === option.id ? "dragging" : ""}`}
              type="button"
              aria-pressed={isSelected}
              disabled={unavailable}
              key={option.id}
              onPointerDown={event => startDescriptorPointerDrag(event, option.id, unavailable)}
              onClick={() => {
                if (suppressDescriptorClick.current === option.id) {
                  suppressDescriptorClick.current = null;
                  return;
                }
                onToggle(option.id);
              }}
            ><span className="descriptor-drag-handle" aria-hidden="true">⠿</span>{option.label}</button>;
          })}</div>}
          <p className="help">Drag into your palette. On touch or keyboard, tap to add or remove.</p>
        </section>
      </div>
    </div>}
  </fieldset>;
}
