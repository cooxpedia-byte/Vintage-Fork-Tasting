import type { TeaReactionType } from "@/lib/live-communication";

export function TeaReactionIcon({ type }: { type: TeaReactionType }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="tea-reaction-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {type === "tea_cup" && <g {...common}><path d="M5 10h12v3.2A5.8 5.8 0 0 1 11.2 19h-.4A5.8 5.8 0 0 1 5 13.2V10Z"/><path d="M17 11h1.4a2.1 2.1 0 0 1 0 4.2h-1.8M7 21h10M9 7c-1-1.3 1-2 0-3.4M13 7c-1-1.3 1-2 0-3.4"/></g>}
    {type === "leaf" && <g {...common}><path d="M19.5 4.5C11.5 4.6 6.2 8.2 6 14.2c-.1 2.8 2.1 4.7 4.7 4.2 5.7-1.2 7.8-6.8 8.8-13.9Z"/><path d="M5 20c2.8-4.7 6.2-8.1 10.6-10.6"/></g>}
    {type === "flower" && <g {...common}><circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C8 8.4 8.7 4 12 4c3.3 0 4 4.4 0 5.8ZM14.2 12c1.4-4 5.8-3.3 5.8 0s-4.4 4-5.8 0ZM12 14.2c4 1.4 3.3 5.8 0 5.8s-4-4.4 0-5.8ZM9.8 12c-1.4 4-5.8 3.3-5.8 0s4.4-4 5.8 0Z"/></g>}
    {type === "honey_drop" && <g {...common}><path d="M12 3.8c3.7 5.2 6 8.2 6 11.2a6 6 0 0 1-12 0c0-3 2.3-6 6-11.2Z"/><path d="M9.2 15.2c.2 1.4 1.2 2.3 2.5 2.6"/></g>}
    {type === "spark" && <g {...common}><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m18.5 16 .6 2.2 2.2.6-2.2.6-.6 2.2-.6-2.2-2.2-.6 2.2-.6.6-2.2Z"/></g>}
    {type === "thinking" && <g {...common}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15 15.2 19.5 20M8.1 10.4h.1M10.5 10.4h.1M12.9 10.4h.1"/></g>}
    {type === "same" && <g {...common}><path d="M4 8h9M10 5l3 3-3 3M20 16h-9M14 13l-3 3 3 3"/><path d="M4 16h3M20 8h-3"/></g>}
    {type === "different" && <g {...common}><path d="M12 12 6 6M6 6v4M6 6h4M12 12l6-6M18 6v4M18 6h-4M12 12l-6 6M6 18v-4M6 18h4M12 12l6 6M18 18v-4M18 18h-4"/></g>}
    {type === "question" && <g {...common}><path d="M8.4 8.4a3.9 3.9 0 1 1 6.5 2.9c-1.8 1.5-2.9 2.1-2.9 4"/><path d="M12 19.2h.01"/></g>}
  </svg>;
}
