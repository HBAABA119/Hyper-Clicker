interface LogoProps {
  size?: number;
  /** Animate the ripple. Disabled automatically under reduced-motion. */
  animated?: boolean;
  className?: string;
}

const TICK_COUNT = 32;
const MAJOR_EVERY = 4;

/**
 * HyperClicker mark.
 *
 * Drawn as one SVG so it stays crisp from 16px in the Windows taskbar up to the
 * sidebar. The visual language matches the UI: warm paper badge, an indigo rule
 * system, and a single ink arrow for the click itself. Hierarchy is chosen for
 * small sizes -- the badge silhouette and the arrow survive at 16px, while the
 * tick ring and the inner rings are progressively finer detail.
 *
 * The same geometry is drawn in `scripts/make_icons.py` to generate the
 * Windows icon files; keep the two in step.
 */
export function Logo({
  size = 32,
  animated = true,
  className = "",
}: LogoProps) {
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => i);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="HyperClicker"
    >
      <defs>
        <linearGradient id="hc-badge" x1="6" y1="6" x2="58" y2="58">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E6E9FB" />
        </linearGradient>

        <clipPath id="hc-badge-clip">
          <rect x="3" y="3" width="58" height="58" rx="15" />
        </clipPath>
      </defs>

      {/* Badge: light fill, indigo rule around it so the edge reads on any
          taskbar background. */}
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="15"
        fill="url(#hc-badge)"
        stroke="#4338CA"
        strokeOpacity="0.42"
        strokeWidth="1.6"
      />

      {/* Interval ticks: the timing face. */}
      <g clipPath="url(#hc-badge-clip)" stroke="#4338CA" strokeLinecap="round">
        {ticks.map((i) => {
          const angle = (i / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
          const major = i % MAJOR_EVERY === 0;
          const r1 = major ? 24 : 25.6;
          const r2 = 28.5;
          return (
            <line
              key={i}
              x1={32 + Math.cos(angle) * r1}
              y1={32 + Math.sin(angle) * r1}
              x2={32 + Math.cos(angle) * r2}
              y2={32 + Math.sin(angle) * r2}
              strokeWidth={major ? 1.8 : 1.1}
              strokeOpacity={major ? 0.5 : 0.26}
            />
          );
        })}
      </g>

      {/* Pulse rings radiating from the click point. */}
      <g clipPath="url(#hc-badge-clip)" fill="none" stroke="#4338CA">
        <circle cx="32" cy="32" r="20" strokeWidth="1.8" strokeOpacity="0.42" />
        <circle cx="32" cy="32" r="13.5" strokeWidth="1.5" strokeOpacity="0.2" />
      </g>

      {/* Expanding ripple. */}
      {animated ? (
        <g clipPath="url(#hc-badge-clip)">
          <circle
            cx="32"
            cy="32"
            r="20"
            fill="none"
            stroke="#4338CA"
            strokeWidth="1.8"
            className="origin-center animate-[hc-pulse_2.8s_ease-out_infinite]"
          />
        </g>
      ) : null}

      {/* The click itself: a solid ink cursor arrow. */}
      <path
        d="M24.6 21.4 42.4 30.6l-7.4 1.9-2.9 7.8z"
        fill="#1C1917"
      />
      <path
        d="M24.6 21.4 42.4 30.6l-7.4 1.9-2.9 7.8z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.1"
        strokeOpacity="0.35"
      />

      {/* Teal click point. */}
      <circle cx="32" cy="32" r="2.6" fill="#0F766E" />
    </svg>
  );
}