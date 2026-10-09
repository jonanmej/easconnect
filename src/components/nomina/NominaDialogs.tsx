import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { inputCls } from "@/components/RecordDialog";
import { fmtUSD, ETIQUETAS_MODALIDAD, type ModalidadPago } from "@/lib/nomina";
import { getDetalleNomina, historialColaborador } from "@/lib/nomina.functions";
import { MESES, CalcMes, SalarioFila } from "@/components/nomina/nomina-tipos";

export function guardadoOtros(data: CalcMes | undefined, userId: string): number {
  const g = data?.guardado?.find((x) => x.user_id === userId);
  return Number(g?.otros_descuentos ?? 0) || 0;
}

export function KPI({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${tone === "ok" ? "text-emerald-600" : ""}`}>{value}</p>
    </div>
  );
}

export function HistorialColaboradorDialog({
  colaborador, onClose, fetcher,
}: {
  colaborador: { id: string; nombre: string };
  onClose: () => void;
  fetcher: typeof historialColaborador;
}) {
  const f = useServerFn(fetcher);
  const q = useQuery({
    queryKey: ["nomina-historial", colaborador.id],
    queryFn: () => f({ data: { user_id: colaborador.id } }),
  });
  const filas = (q.data as any[] | undefined) ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Historial de pagos · {colaborador.nombre}</h3>
        </div>
        {q.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
        {!q.isLoading && filas.length === 0 && (
          <p className="text-xs text-muted-foreground">Este colaborador aún no tiene planillas guardadas.</p>
        )}
        {filas.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Período</th>
                  <th className="text-right px-3 py-2">Días</th>
                  <th className="text-right px-3 py-2">Extras diurnas</th>
                  <th className="text-right px-3 py-2">Extras nocturnas</th>
                  <th className="text-right px-3 py-2">Bruto</th>
                  <th className="text-right px-3 py-2">ISSS</th>
                  <th className="text-right px-3 py-2">AFP</th>
                  <th className="text-right px-3 py-2">Renta</th>
                  <th className="text-right px-3 py-2">Otros</th>
                  <th className="text-right px-3 py-2">Neto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((l) => (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">
                      {MESES[(l.mes ?? 1) - 1]} {l.anio}
                      {l.estado === "cerrado" && <span className="ml-1 text-[10px] text-emerald-600">(cerrada)</span>}
                      <span className="block text-[10px] text-muted-foreground">
                        {l.corte_label ?? "Mes completo"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.dias}</td>
                    <td className="px-3 py-2 text-right font-mono">{Number(l.horas_extra_diurnas).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{Number(l.horas_extra_nocturnas).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.total_bruto))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.isss))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.afp))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.renta))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.otros_descuentos))}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">
                      {fmtUSD(Number(l.total_neto))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export function DetallePeriodoDialog({
  periodo, onClose,
}: {
  periodo: { id: string; titulo: string };
  onClose: () => void;
}) {
  const f = useServerFn(getDetalleNomina);
  const q = useQuery({
    queryKey: ["nomina-detalle", periodo.id],
    queryFn: () => f({ data: { periodo_id: periodo.id } }),
  });
  const lineas = ((q.data as any)?.lineas as any[] | undefined) ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Planilla de {periodo.titulo}</h3>
        {q.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
        {!q.isLoading && lineas.length === 0 && (
          <p className="text-xs text-muted-foreground">Esta planilla no tiene líneas registradas.</p>
        )}
        {lineas.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-right px-3 py-2">Días</th>
                  <th className="text-right px-3 py-2">Bruto</th>
                  <th className="text-right px-3 py-2">ISSS</th>
                  <th className="text-right px-3 py-2">AFP</th>
                  <th className="text-right px-3 py-2">Renta</th>
                  <th className="text-right px-3 py-2">Otros</th>
                  <th className="text-right px-3 py-2">Neto</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{l.colaborador}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.dias}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.total_bruto))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.isss))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.afp))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.renta))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.otros_descuentos))}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">
                      {fmtUSD(Number(l.total_neto))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export function SalariosDialog({
  salarios, colaboradores, cargando, saving, onCancel, onSave,
}: {
  salarios: SalarioFila[];
  colaboradores: { id: string; nombre: string }[];
  cargando: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: { user_id: string; salario_mensual: number; modalidad: ModalidadPago; pago_diario: number }) => void;
}) {
  const [userId, setUserId] = useState("");
  const [modalidad, setModalidad] = useState<ModalidadPago>("mensual");
  const [monto, setMonto] = useState("");
  const lista = colaboradores.length
    ? colaboradores
    : salarios.map((s) => ({ id: s.user_id, nombre: s.colaborador }));

  const esDiario = modalidad === "diario";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Remuneración del personal</h3>
          <p className="text-xs text-muted-foreground">
            Personal fijo: ingrese el salario mensual (la hora ordinaria es salario ÷ 30 días ÷ 8 horas).
            Contratados por proyecto: elija «Pago por día» e ingrese el jornal; por cada día con marcación se paga
            el jornal completo, con recargo del 50 % en domingo y doble en feriado, más las horas extras.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_150px_auto] gap-2 items-end">
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">Colaborador</span>
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                const actual = salarios.find((s) => s.user_id === e.target.value);
                const m = (actual?.modalidad ?? "mensual") as ModalidadPago;
                setModalidad(m);
                setMonto(actual ? String(m === "diario" ? actual.pago_diario : actual.salario_mensual) : "");
              }}
              className={inputCls}
            >
              <option value="">{cargando ? "Cargando…" : "Seleccione un colaborador"}</option>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">Modalidad</span>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as ModalidadPago)}
              className={inputCls}
            >
              <option value="mensual">Salario mensual</option>
              <option value="diario">Pago por día (proyecto)</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">
              {esDiario ? "Pago por día (USD)" : "Salario mensual (USD)"}
            </span>
            <input
              type="number" min={0} step="0.01" value={monto}
              onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className={inputCls}
            />
          </label>
          <button
            type="button"
            disabled={saving || !userId || monto === "" || Number(monto) < 0}
            onClick={() =>
              onSave({
                user_id: userId,
                modalidad,
                salario_mensual: esDiario ? 0 : Number(monto),
                pago_diario: esDiario ? Number(monto) : 0,
              })
            }
            className="h-9 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />} Guardar
          </button>
        </div>

        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Colaborador</th>
                <th className="text-left px-3 py-2">Modalidad</th>
                <th className="text-right px-3 py-2">Base</th>
                <th className="text-right px-3 py-2">Hora ordinaria</th>
              </tr>
            </thead>
            <tbody>
              {salarios.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">Aún no hay remuneraciones registradas.</td></tr>
              )}
              {salarios.map((s) => {
                const diario = (s.modalidad ?? "mensual") === "diario";
                const base = diario ? s.pago_diario : s.salario_mensual;
                const hora = diario ? base / 8 : base / 30 / 8;
                return (
                  <tr key={s.user_id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{s.colaborador}</td>
                    <td className="px-3 py-2">{ETIQUETAS_MODALIDAD[(s.modalidad ?? "mensual") as ModalidadPago]}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtUSD(base)}{diario ? " / día" : " / mes"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(hora)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-1">
          <button type="button" onClick={onCancel} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
