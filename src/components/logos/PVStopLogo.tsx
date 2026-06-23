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
  return (
    <svg
      viewBox="0 0 260 70"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PVStop"
      className={className}
      {...props}
    >
      {/* 4 rombos del monograma */}
      <g
        className={accentClassName}
        fill="currentColor"
        transform="translate(4 6)"
      >
        <rect x="22" y="0" width="20" height="20" transform="rotate(45 32 10)" />
        <rect x="0" y="22" width="20" height="20" transform="rotate(45 10 32)" />
        <rect x="44" y="22" width="20" height="20" transform="rotate(45 54 32)" />
        <rect x="22" y="44" width="20" height="20" transform="rotate(45 32 54)" />
      </g>
      {/* Wordmark */}
      <text
        x="80"
        y="48"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="38"
        fontWeight="900"
        letterSpacing="0.5"
        fill="currentColor"
      >
        PV
      </text>
      <text
        x="128"
        y="48"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="38"
        fontWeight="500"
        letterSpacing="1"
        fill="currentColor"
        opacity="0.85"
      >
        ST
      </text>
      {/* "O" como rombo */}
      <g
        className={accentClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        transform="translate(186 18)"
      >
        <rect x="2" y="2" width="22" height="22" transform="rotate(45 13 13)" />
      </g>
      <text
        x="218"
        y="48"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="38"
        fontWeight="500"
        letterSpacing="1"
        fill="currentColor"
        opacity="0.85"
      >
        P
      </text>
    </svg>
  );
}
