interface StatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "stop" | "accent";
}

const TONES = {
  neutral: "text-ink",
  good: "text-good",
  warn: "text-warn",
  stop: "text-stop",
  accent: "text-accent",
} as const;

export function Stat({ label, value, hint, tone = "neutral" }: StatProps) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div
        className={`mt-1 truncate font-mono text-lg leading-none font-medium tabular-nums ${TONES[tone]}`}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 truncate text-[0.6875rem] text-faint">{hint}</div>
      ) : null}
    </div>
  );
}