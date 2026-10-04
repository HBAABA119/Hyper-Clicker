interface LogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

const TICK_COUNT = 48;
const majorEvery = 4;

/**
 * Static version of the app mark, for the marketing site. Same geometry as the
 * desktop logo so the brand reads identically in both places.
 */
export function Logo({
  size = 28,
  animated = false,
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
        <linearGradient id="site-face" x1="10" y1="6" x2="54" y2="58">
          <stop offset="0%" stopColor="#312E81" />
          <stop offset="55%" stopColor="#4338CA" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        <linearGradient id="site-arrow" x1="22" y1="20" x2="40" y2="42">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>
        <linearGradient id="site-ring" x1="14" y1="14" x2="50" y2="50">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#site-face)" />
      <path
        d="M2 18a16 16 0 0 1 16-16h28a16 16 0 0 0-16 16v4H2z"
        fill="#FFFFFF"
        opacity="0.07"
      />

      <g stroke="#FFFFFF" strokeLinecap="round">
        {ticks.map((i) => {
          const angle = (i / TICK_COUNT) * Math.PI * 2;
          const major = i % majorEvery === 0;
          const r1 = major ? 25.4 : 26.6;
          const r2 = 28;
          return (
            <line
              key={i}
              x1={32 + Math.cos(angle) * r1}
              y1={32 + Math.sin(angle) * r1}
              x2={32 + Math.cos(angle) * r2}
              y2={32 + Math.sin(angle) * r2}
              strokeWidth={major ? 1.5 : 0.9}
              strokeOpacity={major ? 0.55 : 0.3}
            />
          );
        })}
      </g>

      <g stroke="url(#site-ring)" fill="none" strokeWidth="1.6">
        <circle cx="32" cy="32" r="9" opacity="0.95" />
        <circle cx="32" cy="32" r="15" opacity="0.5" />
        <circle cx="32" cy="32" r="21" opacity="0.26" />
      </g>

      {animated ? (
        <circle
          cx="32"
          cy="32"
          r="9"
          fill="none"
          stroke="#22D3EE"
          strokeWidth="1.6"
          className="origin-center motion-safe:animate-[hc-pulse_2.6s_ease-out_infinite]"
        />
      ) : null}

      <path
        d="M25.4 22.2 41 30.1l-6.3 1.6-2.5 6.6z"
        fill="url(#site-arrow)"
      />
      <circle cx="32" cy="32" r="2.4" fill="#FFFFFF" opacity="0.95" />
    </svg>
  );
}