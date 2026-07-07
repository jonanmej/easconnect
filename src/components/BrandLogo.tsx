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

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  variant: Variant;
  /** Fuerza tema en lugar de leer el contexto. Útil en previews/PDF. */
  themeOverride?: "light" | "dark";
  alt?: string;
};

/**
 * `<BrandLogo>` — muestra el logo apropiado según el tema activo (`light` u `oscuro`)
 * con fondo transparente para integrarse a cualquier superficie.
 */
export function BrandLogo({ variant, themeOverride, alt, className, ...rest }: Props) {
  const { theme } = useTheme();
  const effective = themeOverride ?? theme;
  const src = BRAND_LOGO_URLS[variant][effective];
  return (
    <img
      src={src}
      alt={alt ?? DEFAULT_ALT[variant]}
      className={className ?? "h-8 w-auto object-contain"}
      {...rest}
    />
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