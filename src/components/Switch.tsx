interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Toggle control.
 *
 * The off state used to be `surface-sunk` (#ebe8e2) with a white knob, which
 * is almost the same value as the card it sits on -- the control read as a
 * washed-out smudge and its state was ambiguous. The track is now a clearly
 * darker neutral when off, the knob carries a hairline ring so it has an edge
 * on any background, and an explicit ON/OFF word removes any doubt about the
 * current state.
 *
 * Geometry: a 26px track with a 3px inset and an 18px knob gives travel of
 * 3px -> 23px, which is symmetric (3px inset at each end when the knob is
 * 18px wide in a 44px track).
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: SwitchProps) {
  return (
    <label
      className={`flex items-start justify-between gap-5 ${
        disabled ? "opacity-50" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-1 block text-[0.6875rem] leading-relaxed text-muted">
            {description}
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-2.5 pt-0.5">
        {/* The word is the unambiguous part; the pill is the fast part. */}
        <span
          aria-hidden
          className={`w-7 text-right font-mono text-[0.625rem] uppercase tracking-[0.08em] transition-colors duration-200 ${
            checked ? "text-accent" : "text-faint"
          }`}
        >
          {checked ? "On" : "Off"}
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-[26px] w-11 shrink-0 rounded-full border transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            checked
              ? "border-accent/40 bg-accent"
              : "border-line-strong bg-line-strong"
          }`}
        >
          {/* Inset shading so the track reads as a channel, not a flat blob. */}
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200 ${
              checked ? "opacity-0" : "opacity-60"
            }`}
            style={{
              boxShadow: "inset 0 1px 2px rgb(0 0 0 / 0.22)",
            }}
          />
          <span
            aria-hidden
            className={`absolute top-1/2 size-[18px] -translate-y-1/2 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] ring-1 ring-black/10 transition-[left] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              checked ? "left-[23px]" : "left-[3px]"
            }`}
          />
        </button>
      </span>
    </label>
  );
}