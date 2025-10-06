"use client";

export default function Spinner({ size = 16 }: { size?: number }) {
  const s = `${size}px`;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      className="animate-spin text-white/80"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}


