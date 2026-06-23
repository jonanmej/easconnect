import type { SVGProps } from "react";

/**
 * Logo PVStop recreado como SVG con `currentColor`. El monograma
 * (4 rombos) y la "O" estilizada utilizan `accentClassName` para
 * destacarse sobre el tema activo.
 */
export function PVStopLogo({
  className,
  accentClassName = "text-primary",
  ...props
}: SVGProps<SVGSVGElement> & { accentClassName?: string }) {
  const RED = "#E4322C";
  return (
    <svg
      viewBox="0 0 360 110"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PVStop"
      className={className}
      {...props}
    >
      {/* Monograma: 4 rombos en disposición diamante */}
      <g fill="currentColor" transform="translate(10 15)">
        <rect x="28" y="-2" width="24" height="24" rx="3" transform="rotate(45 40 10)" />
        <rect x="6" y="20" width="24" height="24" rx="3" transform="rotate(45 18 32)" />
        <rect x="50" y="20" width="24" height="24" rx="3" transform="rotate(45 62 32)" />
        <rect x="28" y="42" width="24" height="24" rx="3" transform="rotate(45 40 54)" />
      </g>
      {/* Wordmark PVST_P */}
      <text
        x="105"
        y="68"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="58"
        fontWeight="900"
        letterSpacing="0"
        fill="currentColor"
      >
        PVST
      </text>
      {/* "O" como rombo rojo (accent) */}
      <g
        fill="none"
        stroke={RED}
        strokeWidth="6"
        strokeLinejoin="round"
        transform="translate(243 24)"
      >
        <rect x="3" y="3" width="32" height="32" transform="rotate(45 19 19)" />
      </g>
      <text
        x="285"
        y="68"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="58"
        fontWeight="900"
        fill="currentColor"
      >
        P
      </text>
      {/* Tagline */}
      <text
        x="105"
        y="98"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="20"
        fontWeight="700"
        letterSpacing="3"
        fill="currentColor"
      >
        EL SALVADOR
      </text>
    </svg>
  );
}
