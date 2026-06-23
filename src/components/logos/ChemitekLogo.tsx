import type { SVGProps } from "react";

/**
 * Wordmark Chemitek recreado como SVG con `currentColor` para
 * adaptarse al tema claro/oscuro. El acento (gota sobre la "i")
 * usa `accentClassName`.
 */
export function ChemitekLogo({
  className,
  accentClassName = "text-primary",
  ...props
}: SVGProps<SVGSVGElement> & { accentClassName?: string }) {
  return (
    <svg
      viewBox="0 0 320 70"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Chemitek"
      className={className}
      {...props}
    >
      <text
        x="0"
        y="52"
        fontFamily="var(--font-sans, Inter, sans-serif)"
        fontSize="56"
        fontWeight="800"
        letterSpacing="-1"
        fill="currentColor"
      >
        Chem
        <tspan dx="0">i</tspan>
        tek
      </text>
      {/* Droplet accent above the "i" */}
      <path
        d="M168 6 C172 14 176 18 176 24 C176 28 172.4 31 168 31 C163.6 31 160 28 160 24 C160 18 164 14 168 6 Z"
        className={accentClassName}
        fill="currentColor"
      />
    </svg>
  );
}
