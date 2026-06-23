import type { SVGProps } from "react";

/**
 * Logo oficial EA Service & Consulting recreado como SVG vectorial.
 * Usa `currentColor` para adaptarse al color del tema (claro/oscuro)
 * y permite un acento opcional vía la prop `accentClassName`.
 */
export function EALogo({
  className,
  accentClassName = "text-primary",
  showTagline = true,
  ...props
}: SVGProps<SVGSVGElement> & {
  accentClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 220 96"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="EA Service & Consulting"
      className={className}
      {...props}
    >
      <g fill="currentColor">
        {/* Letter E */}
        <path d="M8 12 H58 V24 H22 V36 H52 V48 H22 V60 H58 V72 H8 Z" />
        {/* Letter A */}
        <path d="M92 72 L74 12 H98 L116 72 H102 L98.4 60 H82.6 L79 72 Z M86 48 H95 L90.5 30 Z" />
      </g>
      {/* Triangular arrow accent */}
      <path
        d="M134 18 L196 42 L134 66 Z"
        className={accentClassName}
        fill="currentColor"
      />
      {showTagline ? (
        <text
          x="8"
          y="90"
          fontFamily="var(--font-sans, Inter, sans-serif)"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.2"
          fill="currentColor"
        >
          SERVICE AND CONSULTING
        </text>
      ) : null}
    </svg>
  );
}
