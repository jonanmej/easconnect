import { useEffect, useMemo, useState } from "react";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";

/**
 * Cabecera + pie normalizados ISO 9001:2015 para vistas imprimibles (HTML → print).
 * Solo se renderiza en `@media print`; en pantalla queda oculto vía `.print-only`.
 *
 * Aplica los mismos elementos que los PDF de reportes/recursos:
 *  - Marca EA Service & Consulting con logo
 *  - Código de documento · versión · clasificación
 *  - Referencia a cláusula ISO 9001:2015 relevante
 *  - Pie con retención documental §7.5, responsable y fecha de emisión
 */
export type PrintDocFrameProps = {
  titulo: string;
  subtitulo?: string | null;
  codigo?: string;
  version?: string;
  clasificacion?: string;
  clausulaIso?: string;
  responsable?: string | null;
  filtros?: { label: string; value: string }[];
};

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function PrintDocHeader({
  titulo,
  subtitulo,
  codigo = "EA-DOC",
  version = "1.0",
  clasificacion = "Uso interno",
  clausulaIso = "§7.5",
  filtros,
}: PrintDocFrameProps) {
  // Franja institucional: los documentos imprimibles muestran los tres
  // logos corporativos (EA · PVSTOP · Chemitek) en la cabecera para
  // cumplir con la identidad ISO 9001:2015.
  const emitido = useMemo(
    () =>
      new Date().toLocaleString("es-SV", {
        timeZone: "America/El_Salvador",
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );
  return (
    <div className="print-only print-doc-header">
      <div className="print-doc-header__logos">
        <img src={BRAND_LOGO_URLS["ea-main"].light} alt="EA Service & Consulting" />
        <img src={BRAND_LOGO_URLS.pvstop.light} alt="PVSTOP El Salvador" className="print-doc-header__logo-pv" />
        <img src={BRAND_LOGO_URLS.chemitek.light} alt="Chemitek Solar" className="print-doc-header__logo-ch" />
      </div>
      <div className="print-doc-header__row">
        <div className="print-doc-header__brand">
          <div>
            <p className="print-doc-header__brand-title">EA SERVICE AND CONSULTING</p>
            <p className="print-doc-header__brand-sub">{subtitulo ?? titulo}</p>
            <p className="print-doc-header__brand-sub">ISO 9001:2015 · {clausulaIso}</p>
          </div>
        </div>
        <div className="print-doc-header__meta">
          <p className="print-doc-header__meta-top">{titulo}</p>
          <p className="print-doc-header__meta-line">{codigo} · v{version}</p>
          <p className="print-doc-header__meta-line">{clasificacion}</p>
          <p className="print-doc-header__meta-line">Emitido: {emitido}</p>
        </div>
      </div>
      {filtros && filtros.length > 0 && (
        <div className="print-doc-header__filters">
          {filtros.map((f, i) => (
            <span key={i}>
              <b>{f.label}:</b> {f.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PrintDocFooter({
  codigo = "EA-DOC",
  version = "1.0",
  responsable,
}: Pick<PrintDocFrameProps, "codigo" | "version" | "responsable">) {
  const [docId] = useState(() =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : Math.random().toString(16).slice(2)
    )
      .slice(0, 8)
      .toUpperCase(),
  );
  const emitido = useMemo(
    () =>
      new Date().toLocaleString("es-SV", {
        timeZone: "America/El_Salvador",
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );
  // Forzamos el tema light en impresión (no depende del tema activo).
  useEffect(() => {
    void currentTheme();
  }, []);
  return (
    <div className="print-only print-doc-footer">
      <span>ID Doc: {docId} · {codigo} · v{version}</span>
      <span>Retención: 5 años · ISO 9001:2015 §7.5</span>
      <span>
        {responsable ? `Responsable: ${responsable}` : "Equipo EA Service and Consulting"} · {emitido}
      </span>
    </div>
  );
}