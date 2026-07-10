import { type ImgHTMLAttributes } from "react";
import { useTheme } from "@/lib/theme-context";

import eaMainLight from "@/assets/brand-ea-main-light.png.asset.json";
import eaMainDark from "@/assets/brand-ea-main-dark.png.asset.json";
import eaConnectLight from "@/assets/brand-ea-connect-light.png.asset.json";
import eaConnectDark from "@/assets/brand-ea-connect-dark.png.asset.json";
import pvstopLight from "@/assets/brand-pvstop-light.png.asset.json";
import pvstopDark from "@/assets/brand-pvstop-dark.png.asset.json";

type Variant = "ea-main" | "ea-connect" | "pvstop";

/**
 * Mapa central de logos por marca y por tema.
 * Todas las variantes son PNG con fondo transparente para adaptarse
 * al color del contenedor. Reemplazar aquí el asset actualiza toda la app.
 */
export const BRAND_LOGO_URLS: Record<Variant, { light: string; dark: string }> = {
  "ea-main": { light: eaMainLight.url, dark: eaMainDark.url },
  "ea-connect": { light: eaConnectLight.url, dark: eaConnectDark.url },
  pvstop: { light: pvstopLight.url, dark: pvstopDark.url },
};

const DEFAULT_ALT: Record<Variant, string> = {
  "ea-main": "EA Service & Consulting",
  "ea-connect": "EA Service Connect",
  pvstop: "PVSTOP El Salvador",
};

/**
 * Escalado inteligente por variante.
 *
 * Cada PNG tiene distinta relación entre el contenido tipográfico (wordmark)
 * y el alto total del archivo — p. ej. PVSTOP incluye ícono + wordmark +
 * bajada "EL SALVADOR", mientras que "EA Service" es casi puro wordmark.
 *
 * `wordmarkRatio` = altura aproximada del texto principal / altura total del PNG.
 * A partir de ese ratio calculamos un factor de escala para que, dada una caja
 * de alto `H`, el texto del logo mida siempre ≈ `TARGET_WORDMARK_RATIO * H`,
 * sin importar el tamaño real del archivo.
 */
// Ratios medidos empíricamente sobre los PNG (altura del wordmark / altura total).
const WORDMARK_RATIO: Record<Variant, number> = {
  "ea-main": 0.45,
  "ea-connect": 0.28,
  pvstop: 0.68,
};
// Usamos el ratio más alto (pvstop) como referencia → nunca escalamos > 1.5x
// para evitar que un logo se desborde de su caja.
const TARGET_WORDMARK_RATIO = 0.68;

// Ajuste fino por tema para compensar diferencias visuales entre variantes light/dark.
const THEME_SCALE: Record<Variant, { light: number; dark: number }> = {
  "ea-main": { light: 1.0, dark: 1.0 },
  "ea-connect": { light: 1.0, dark: 1.0 },
  // El PNG oscuro es más alto (247px vs 218px del light), así que a igual
  // altura de caja el wordmark se ve más chico. Compensamos con 247/218 ≈ 1.13.
  pvstop: { light: 1.0, dark: 1.13 },
};

function scaleFor(variant: Variant, theme: "light" | "dark"): number {
  return (TARGET_WORDMARK_RATIO / WORDMARK_RATIO[variant]) * THEME_SCALE[variant][theme];
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  variant: Variant;
  /** Fuerza tema en lugar de leer el contexto. Útil en previews/PDF. */
  themeOverride?: "light" | "dark";
  alt?: string;
};

/**
 * `<BrandLogo>` — muestra el logo apropiado según el tema activo (`light` u `oscuro`)
 * con fondo transparente para integrarse a cualquier superficie.
 *
 * El `className` define la caja (alto de referencia). Internamente aplicamos
 * un factor de escala por variante para que el texto del logo conserve la
 * misma legibilidad óptica sin importar el tamaño del PNG de origen.
 */
export function BrandLogo({ variant, themeOverride, alt, className, ...rest }: Props) {
  const { theme } = useTheme();
  const effective = themeOverride ?? theme;
  const src = BRAND_LOGO_URLS[variant][effective];
  const scale = scaleFor(variant, effective);
  return (
    <span
      className={`inline-flex items-center justify-center overflow-visible ${className ?? "h-8"}`}
      aria-hidden={rest["aria-hidden"]}
    >
      <img
        src={src}
        alt={alt ?? DEFAULT_ALT[variant]}
        style={{ height: `${scale * 100}%`, width: "auto" }}
        className="max-w-none object-contain"
        {...rest}
      />
    </span>
  );
}

/** URL absoluta lista para embebido en emails/PDF. */
export function brandLogoAbsoluteUrl(
  variant: Variant,
  theme: "light" | "dark",
  origin = "https://easconnect.lovable.app",
): string {
  return `${origin}${BRAND_LOGO_URLS[variant][theme]}`;
}