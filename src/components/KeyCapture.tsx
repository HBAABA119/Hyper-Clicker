import { useEffect, useState } from "react";

interface KeyCaptureProps {
  value: string;
  onCapture: (key: string) => void;
  label: string;
  hint?: string;
}

/**
 * Map a KeyboardEvent to the key names the Rust `vk_from_name` resolver
 * accepts. Anything unmappable is ignored rather than sent as garbage.
 */
export function toBindableKey(key: string): string | null {
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  if (key.length === 1 && /[a-z0-9]/i.test(key)) return key.toUpperCase();
  switch (key) {
    case " ":
      return "Space";
    case "Escape":
      return "Escape";
    case "Enter":
      return "Enter";
    case "Tab":
      return "Tab";
    case "Shift":
      return "Shift";
    case "Control":
      return "Ctrl";
    case "Alt":
      return "Alt";
    default:
      return null;
  }
}

export function KeyCapture({ value, onCapture, label, hint }: KeyCaptureProps) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Escape is the panic key and must stay reserved.
      if (event.key === "Escape") {
        event.preventDefault();
        setListening(false);
        return;
      }
      const bindable = toBindableKey(event.key);
      if (!bindable) return;
      event.preventDefault();
      event.stopPropagation();
      onCapture(bindable);
      setListening(false);
    };

    // Capture phase so the global hotkey hook does not also react first.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listening, onCapture]);

  return (
    <div>
      <span className="label">{label}</span>
      <button
        type="button"
        onClick={() => setListening((prev) => !prev)}
        onBlur={() => setListening(false)}
        aria-label={`${label}: ${value}. Activate to record a new key.`}
        className={`mt-2 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 font-mono text-sm transition-colors ${
          listening
            ? "border-accent bg-accent-soft text-accent"
            : "border-line bg-surface-sunk text-ink hover:border-line-strong"
        }`}
      >
        <span>{listening ? "Press a key…" : value}</span>
        <span
          className={`text-[0.625rem] uppercase tracking-widest ${
            listening ? "text-accent" : "text-faint"
          }`}
        >
          {listening ? "recording" : "change"}
        </span>
      </button>
      {hint ? <p className="mt-1 text-[0.6875rem] text-faint">{hint}</p> : null}
    </div>
  );
}