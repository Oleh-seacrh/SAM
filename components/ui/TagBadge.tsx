import * as React from "react";

// стабільний “колір” від тексту тега
function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

const palettes = [
  { bg: "bg-blue-100", text: "text-blue-800", ring: "ring-blue-200" },
  { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-200" },
  { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-200" },
  { bg: "bg-violet-100", text: "text-violet-800", ring: "ring-violet-200" },
  { bg: "bg-rose-100", text: "text-rose-800", ring: "ring-rose-200" },
  { bg: "bg-cyan-100", text: "text-cyan-800", ring: "ring-cyan-200" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-800", ring: "ring-fuchsia-200" },
];

export function TagBadge({ tag }: { tag: string }) {
  const p = palettes[hashCode(tag) % palettes.length];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${p.bg} ${p.text} ${p.ring}`}>
      <span className="truncate max-w-[9rem]">{tag}</span>
    </span>
  );
}
