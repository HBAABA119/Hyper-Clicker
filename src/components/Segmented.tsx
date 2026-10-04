import { useId } from "react";

interface SegmentedProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: SegmentedProps<T>) {
  const groupId = useId();
  const activeIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const pad = size === "sm" ? 2 : 3;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid gap-1 rounded-xl bg-surface-sunk p-1 ring-1 ring-line"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {/* Sliding pill: one element that transitions rather than per-option
          colour swaps, so the change reads as movement. */}
      <span
        aria-hidden
        className="absolute rounded-lg bg-surface shadow-sm ring-1 ring-line transition-transform duration-200 ease-out"
        style={{
          top: pad,
          bottom: pad,
          left: pad,
          width: `calc((100% - ${pad * 2}px) / ${options.length})`,
          transform: `translateX(calc(${activeIndex} * 100%))`,
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`relative rounded-lg text-center font-medium transition-colors duration-150 ${
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
            } ${active ? "text-ink" : "text-muted hover:text-ink-soft"}`}
          >
            {option.label}
          </button>
        );
      })}
      <span className="sr-only" id={groupId} />
    </div>
  );
}