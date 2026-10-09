import { useState } from "react";
import { Loader2 } from "lucide-react";
import { inputCls } from "@/components/RecordDialog";
import { fmtUSD, ETIQUETAS_MODALIDAD, type ModalidadPago } from "@/lib/nomina";
import { SalarioFila, hoyISO, isoALocal, localAIso, Fila } from "@/components/jornada/jornada-utils";

export function KPI({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
      <p className={"text-lg font-bold " + (tone === "danger" ? "text-destructive" : tone === "ok" ? "text-accent" : "")}>
        {value}
      </p>
    </div>
  );
}

export function EditarJornadaDialog({
  fila, onCancel, onSave, saving,
}: {
  fila: Fila;
  onCancel: () => void;
  saving: boolean;
  onSave: (v: {
    id: string; hora_inicio: string; hora_fin: string | null;
    almuerzo_inicio: string | null; almuerzo_fin: string | null; notas: string | null;
  }) => void;
}) {
  const [ini, setIni] = useState(isoALocal(fila.hora_inicio));
  const [fin, setFin] = useState(isoALocal(fila.hora_fin));
  const [almIni, setAlmIni] = useState(isoALocal(fila.almuerzo_inicio));
  const [almFin, setAlmFin] = useState(isoALocal(fila.almuerzo_fin));
  const [notas, setNotas] = useState(fila.notas ?? "");

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Corregir marcación</h3>
          <p className="text-xs text-muted-foreground">{fila.tecnico_nombre} · {fila.fecha}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Entrada">
            <input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Salida">
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Almuerzo inicio">
            <input type="datetime-local" value={almIni} onChange={(e) => setAlmIni(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Almuerzo fin">
            <input type="datetime-local" value={almFin} onChange={(e) => setAlmFin(e.target.value)} className={inputCls} />
          </Campo>
        </div>
        <Campo label="Notas / justificación">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={inputCls} />
        </Campo>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !ini}
            onClick={() =>
              onSave({
                id: fila.id,
                hora_inicio: localAIso(ini)!,
                hora_fin: localAIso(fin),
                almuerzo_inicio: localAIso(almIni),
                almuerzo_fin: localAIso(almFin),
                notas: notas.trim() || null,
              })
            }
            className="h-9 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export type NuevaMarcacion = {
  tecnico_id: string; fecha: string; hora_inicio: string; hora_fin: string | null;
  almuerzo_inicio: string | null; almuerzo_fin: string | null; notas: string | null;
};

export function CrearJornadaDialog({
  colaboradores, cargando, onCancel, onSave, saving,
}: {
  colaboradores: { id: string; nombre: string; cargo?: string | null }[];
  cargando: boolean;
  onCancel: () => void;
  saving: boolean;
  onSave: (v: NuevaMarcacion) => void;
}) {
  const hoy = hoyISO();
  const [tecnicoId, setTecnicoId] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [ini, setIni] = useState(`${hoy}T07:00`);
  const [fin, setFin] = useState(`${hoy}T16:00`);
  const [almIni, setAlmIni] = useState(`${hoy}T12:00`);
  const [almFin, setAlmFin] = useState(`${hoy}T13:00`);
  const [notas, setNotas] = useState("");

  function cambiarFecha(nueva: string) {
    setFecha(nueva);
    const mover = (v: string) => (v ? `${nueva}T${v.slice(11)}` : v);
    setIni(mover(ini));
    setFin(mover(fin));
    setAlmIni(mover(almIni));
    setAlmFin(mover(almFin));
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Registrar marcación</h3>
          <p className="text-xs text-muted-foreground">
            Para cuando un colaborador olvidó marcar su entrada o salida. Indique la justificación en las notas.
          </p>
        </div>
        <Campo label="Colaborador">
          <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className={inputCls}>
            <option value="">{cargando ? "Cargando…" : "Seleccione un colaborador"}</option>
            {colaboradores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.cargo ? ` · ${p.cargo}` : ""}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha">
          <input type="date" value={fecha} max={hoy} onChange={(e) => cambiarFecha(e.target.value)} className={inputCls} />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Entrada">
            <input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Salida">
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Almuerzo inicio">
            <input type="datetime-local" value={almIni} onChange={(e) => setAlmIni(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Almuerzo fin">
            <input type="datetime-local" value={almFin} onChange={(e) => setAlmFin(e.target.value)} className={inputCls} />
          </Campo>
        </div>
        <Campo label="Notas / justificación">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            placeholder="Ej.: olvidó marcar la salida, confirmado por el supervisor."
            className={inputCls}
          />
        </Campo>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !tecnicoId || !fecha || !ini}
            onClick={() =>
              onSave({
                tecnico_id: tecnicoId,
                fecha,
                hora_inicio: localAIso(ini)!,
                hora_fin: localAIso(fin),
                almuerzo_inicio: localAIso(almIni),
                almuerzo_fin: localAIso(almFin),
                notas: notas.trim() || null,
              })
            }
            className="h-9 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />} Registrar
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
            Personal fijo: salario mensual (la hora ordinaria es salario ÷ 30 días ÷ 8 horas).
            Contratados por proyecto: «Pago por día»; por cada día con marcación se paga el jornal completo,
            con recargo del 50 % en domingo y doble en feriado, más las horas extras.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_150px_auto] gap-2 items-end">
          <Campo label="Colaborador">
            <select value={userId} onChange={(e) => {
              setUserId(e.target.value);
              const actual = salarios.find((s) => s.user_id === e.target.value);
              const m = (actual?.modalidad ?? "mensual") as ModalidadPago;
              setModalidad(m);
              setMonto(actual ? String(m === "diario" ? actual.pago_diario : actual.salario_mensual) : "");
            }} className={inputCls}>
              <option value="">{cargando ? "Cargando…" : "Seleccione un colaborador"}</option>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Modalidad">
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as ModalidadPago)}
              className={inputCls}
            >
              <option value="mensual">Salario mensual</option>
              <option value="diario">Pago por día (proyecto)</option>
            </select>
          </Campo>
          <Campo label={esDiario ? "Pago por día (USD)" : "Salario mensual (USD)"}>
            <input
              type="number" min={0} step="0.01" value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00" className={inputCls}
            />
          </Campo>
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
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(base)}{diario ? " / día" : " / mes"}</td>
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
