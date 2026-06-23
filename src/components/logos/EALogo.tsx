import type { SVGProps } from "react";

/**
 * Logo oficial EA Service & Consulting recreado como SVG vectorial,
 * basado en el isotipo original (triángulo "play" de dos tonos) más el
 * wordmark "EA" y tagline "Service and Consulting". Fondo transparente.
 * Usa `currentColor` para el cuerpo y `accentClassName` para el acento
 * (matiz claro del triángulo) de modo que adapte a temas claro y oscuro.
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
  const BRAND = "#5B85C2";
  const BRAND_LIGHT = "#B6CCE4";
  return (
    <svg
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="EA Service & Consulting"
      className={className}
      {...props}
    >
      {/* Isotipo "play" en dos tonos azules originales */}
      <path d="M40 10 L190 75 L110 75 Z" fill={BRAND_LIGHT} />
      <path d="M40 10 L40 140 L110 75 Z" fill={BRAND_LIGHT} />
      <path d="M110 75 L190 75 L40 140 Z" fill={BRAND} />
      <text
        x="100"
        y="190"
        textAnchor="middle"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="56"
        fontWeight="700"
        letterSpacing="6"
        fill={BRAND}
      >
        EA
      </text>
      {showTagline ? (
        <text
          x="100"
          y="212"
          textAnchor="middle"
          fontFamily="var(--font-sans, Inter, sans-serif)"
          fontSize="14"
          fontWeight="600"
          letterSpacing="0.5"
          fill={BRAND}
        >
          Service and Consulting
        </text>
      ) : null}
    </svg>
  );
}
