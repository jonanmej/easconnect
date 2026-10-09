import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Field, inputCls } from "@/components/RecordDialog";
import { getReportesPeriodoPref, setReportesPeriodoPref } from "@/lib/profile.functions";


export function Stat({ label, value, tone }: { label: string; value: number; tone?: "primary" | "accent" }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10 min-w-[80px]">
      <p className={"text-2xl font-mono font-semibold " + (tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent" : "")}>
        {String(value).padStart(2, "0")}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{label}</p>
    </div>
  );
}

export function quarterInfo(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const q = Math.floor((month - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    label: `Q${q} ${year}`,
    inicio: `${year}-${pad(startMonth)}-01`,
    fin: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
    key: `${year}-Q${q}`,
  };
}

export function fmtSV(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

export const PERIODO_STORAGE_KEY = "reportes:periodo-form";

export function PeriodoTrimestralFields() {
  const fGetPref = useServerFn(getReportesPeriodoPref);
  const fSetPref = useServerFn(setReportesPeriodoPref);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [manual, setManual] = useState(false);
  const [periodo, setPeriodo] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [modo, setModo] = useState<"rango" | "dia">("rango");
  const [diaEspecifico, setDiaEspecifico] = useState("");

  // Rehidratar: primero cache local (rápido), luego perfil (autoritativo cross-device).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERIODO_STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { desde?: string; hasta?: string; periodo?: string; manual?: boolean };
        if (s.desde) setDesde(s.desde);
        if (s.hasta) setHasta(s.hasta);
        if (s.periodo) setPeriodo(s.periodo);
        if (s.manual) setManual(true);
      }
    } catch { /* ignore */ }
    fGetPref()
      .then((pref) => {
        if (pref) {
          if (pref.desde) setDesde(pref.desde);
          if (pref.hasta) setHasta(pref.hasta);
          if (pref.periodo) setPeriodo(pref.periodo);
          if (typeof pref.manual === "boolean") setManual(pref.manual);
        }
      })
      .catch(() => { /* silencioso: usar cache local */ })
      .finally(() => setHydrated(true));
  }, []);

  // Validación de rango.
  const invalidRange = desde && hasta && desde > hasta ? true : false;

  // Trimestre(s) que abarca el rango seleccionado.
  const trimestre = useMemo(() => {
    const qD = quarterInfo(desde);
    const qH = quarterInfo(hasta);
    if (!qD && !qH) return null;
    if (qD && qH && qD.key !== qH.key) {
      return { label: `${qD.label} – ${qH.label}`, inicio: qD.inicio, fin: qH.fin };
    }
    const q = qD ?? qH!;
    return { label: q.label, inicio: q.inicio, fin: q.fin };
  }, [desde, hasta]);

  // Rango exacto seleccionado (coincide siempre con las fechas del formulario).
  const rangoSeleccionado = useMemo(() => {
    if (!desde || !hasta || invalidRange) return null;
    return { inicio: desde, fin: hasta };
  }, [desde, hasta, invalidRange]);

  // Auto-completar etiqueta si el usuario no la editó manualmente.
  useEffect(() => {
    if (manual) return;
    setPeriodo(trimestre?.label ?? "");
  }, [trimestre, manual]);

  // Persistir en localStorage + perfil (debounced).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PERIODO_STORAGE_KEY, JSON.stringify({ desde, hasta, periodo, manual }));
    } catch { /* ignore */ }
    if (invalidRange) return; // no persistimos estados inválidos en el perfil
    const t = setTimeout(() => {
      fSetPref({ data: { desde: desde || null, hasta: hasta || null, periodo: periodo || null, manual } })
        .catch(() => { /* silencioso */ });
    }, 600);
    return () => clearTimeout(t);
  }, [desde, hasta, periodo, manual, hydrated, invalidRange]);

  // Sincronizar el modo "día específico" con desde/hasta y etiqueta.
  useEffect(() => {
    if (modo !== "dia") return;
    if (!diaEspecifico) return;
    setDesde(diaEspecifico);
    setHasta(diaEspecifico);
    if (!manual) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(diaEspecifico);
      setPeriodo(m ? `${m[3]}-${m[2]}-${m[1]}` : diaEspecifico);
    }
  }, [modo, diaEspecifico, manual]);

  return (
    <>
      <Field label="Cobertura del reporte">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setModo("rango")}
            className={"px-3 h-9 " + (modo === "rango" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary")}
          >Rango de fechas</button>
          <button
            type="button"
            onClick={() => setModo("dia")}
            className={"px-3 h-9 border-l border-border " + (modo === "dia" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary")}
          >Un día específico</button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Elige "Un día específico" para generar el reporte ejecutivo con lo reportado ese día únicamente.
        </p>
      </Field>
      {modo === "dia" && (
        <Field label="Día del reporte">
          <input
            type="date"
            required
            value={diaEspecifico}
            onChange={(e) => setDiaEspecifico(e.currentTarget.value)}
            className={inputCls}
          />
          {/* Hidden mirrors para que el submit reciba desde/hasta */}
          <input type="hidden" name="desde" value={diaEspecifico} />
          <input type="hidden" name="hasta" value={diaEspecifico} />
        </Field>
      )}
      <Field label="Etiqueta del periodo (trimestre auto)">
        <input
          name="periodo"
          required
          value={periodo}
          onChange={(e) => { setManual(true); setPeriodo(e.currentTarget.value); }}
          placeholder="Q2 2026"
          className={inputCls}
        />
        {trimestre && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Trimestre {trimestre.label}: <span className="font-mono">{fmtSV(trimestre.inicio)}</span> → <span className="font-mono">{fmtSV(trimestre.fin)}</span>
            {manual && <> · <button type="button" className="underline" onClick={() => { setManual(false); setPeriodo(trimestre.label); }}>usar automático</button></>}
          </p>
        )}
        {rangoSeleccionado && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Rango del reporte: <span className="font-mono">{fmtSV(rangoSeleccionado.inicio)}</span> → <span className="font-mono">{fmtSV(rangoSeleccionado.fin)}</span>
          </p>
        )}
      </Field>
      {modo === "rango" && (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde">
          <input name="desde" type="date" required value={desde} max={hasta || undefined}
            onChange={(e) => setDesde(e.currentTarget.value)}
            aria-invalid={invalidRange || undefined}
            className={inputCls + (invalidRange ? " border-destructive" : "")} />
        </Field>
        <Field label="Hasta">
          <input name="hasta" type="date" required value={hasta} min={desde || undefined}
            onChange={(e) => setHasta(e.currentTarget.value)}
            aria-invalid={invalidRange || undefined}
            className={inputCls + (invalidRange ? " border-destructive" : "")} />
        </Field>
      </div>
      )}
      {modo === "rango" && invalidRange && (
        <p className="text-[11px] text-destructive">La fecha "Desde" no puede ser posterior a "Hasta".</p>
      )}
    </>
  );
}
