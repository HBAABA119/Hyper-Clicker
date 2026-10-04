import { useId } from "react";

interface SparklineProps {
  points: number[];
  /** Upper bound of the y-axis; auto-scales when omitted. */
  ceiling?: number;
  height?: number;
  accent?: string;
}

/**
 * Compact area chart for the live throughput readout.
 *
 * Rendered as SVG so it stays crisp at any DPI and costs nothing to redraw at
 * 10 Hz, unlike a canvas that would need re-measuring.
 */
export function Sparkline({
  points,
  ceiling,
  height = 56,
  accent = "var(--color-accent)",
}: SparklineProps) {
  const gradientId = useId();

  const width = 240;
  const values = points.length > 0 ? points : [0, 0];
  const max = ceiling ?? Math.max(...values, 1);
  const span = Math.max(max, 1);

  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = values.map((value, index) => {
    const x = index * step;
    const clamped = Math.min(Math.max(value, 0), span);
    const y = height - (clamped / span) * (height - 6) - 3;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0]} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Recent measured throughput"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.26" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      <line
        x1="0"
        y1={height - 3}
        x2={width}
        y2={height - 3}
        stroke="var(--color-line)"
        strokeWidth="1"
      />

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={accent}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {coords.length > 0 && (
        <circle
          cx={coords[coords.length - 1][0]}
          cy={coords[coords.length - 1][1]}
          r="2.5"
          fill={accent}
        />
      )}
    </svg>
  );
}