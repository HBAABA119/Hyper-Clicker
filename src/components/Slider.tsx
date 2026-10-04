import { useCallback, useRef } from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  /** Rendered on the right of the label. */
  display: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Pointer-driven slider built from scratch rather than `input[type=range]`.
 *
 * A native range input cannot be styled to match the surface, and its thumb
 * hits the track inconsistently across densities. This uses pointer capture so
 * dragging continues correctly even when the cursor leaves the element, and
 * supports keyboard steps for accessibility.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  display,
  hint,
  disabled = false,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const span = Math.max(max - min, 1);
  const ratio = Math.min(Math.max((value - min) / span, 0), 1);

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return value;
      const rect = track.getBoundingClientRect();
      if (rect.width === 0) return value;
      const raw = (clientX - rect.left) / rect.width;
      const clamped = Math.min(Math.max(raw, 0), 1);
      const rawValue = min + clamped * span;
      const stepped = Math.round(rawValue / step) * step;
      // Re-round to kill floating point dust from the step division.
      return Math.min(Math.max(Math.round(stepped), min), max);
    },
    [max, min, span, step, value],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(valueFromClientX(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || disabled) return;
    onChange(valueFromClientX(event.clientX));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const bigStep = Math.max(step, Math.round(span / 10));
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = Math.min(value + step, max);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = Math.max(value - step, min);
    } else if (event.key === "PageUp") {
      next = Math.min(value + bigStep, max);
    } else if (event.key === "PageDown") {
      next = Math.max(value - bigStep, min);
    } else if (event.key === "Home") {
      next = min;
    } else if (event.key === "End") {
      next = max;
    }
    if (next !== null) {
      event.preventDefault();
      onChange(next);
    }
  };

  return (
    <div className={disabled ? "opacity-50" : undefined}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="label">{label}</span>
        <span className="font-mono text-xs tabular-nums text-accent">
          {display}
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="group relative mt-2 h-6 cursor-pointer touch-none select-none"
      >
        {/* Rail */}
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full border border-line bg-surface-sunk" />

        {/* Fill */}
        <div
          className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-accent/45 to-accent"
          style={{ width: `${ratio * 100}%` }}
        />

        {/* Tick marks at the quarter points */}
        {[0.25, 0.5, 0.75].map((mark) => (
          <span
            key={mark}
            aria-hidden
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong"
            style={{ left: `${mark * 100}%` }}
          />
        ))}

        {/* Thumb */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow-[0_2px_6px_rgb(22_19_15/0.25)] transition-transform duration-150 group-hover:scale-110 group-active:scale-95"
          style={{ left: `${ratio * 100}%` }}
        />
      </div>

      {hint ? <p className="mt-1 text-[0.6875rem] text-faint">{hint}</p> : null}
    </div>
  );
}