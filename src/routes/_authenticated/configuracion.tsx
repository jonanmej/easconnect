import { createFileRoute } from "@tanstack/react-router";
import { Sun, Moon, Laptop, ShieldCheck, AlertTriangle, MailX, CalendarDays, Plus, Trash2, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getPasswordPolicy,
  setPasswordPolicy,
  getReportUploadEmailPaused,
  setReportUploadEmailPaused,
  type PasswordPolicy,
} from "@/lib/system-config.functions";
import {
  listFeriados,
  upsertFeriado,
  deleteFeriado,
  toggleFeriadoActivo,
  seedFeriadosAnio,
} from "@/lib/feriados.functions";
import { Switch } from "@/components/ui/switch";
import { resetDatosOperacionales } from "@/lib/reportes.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({ meta: [{ title: "Configuración · EA Service Connect" }] }),
  component: ConfiguracionPage,
});

type Option = {
  value: ThemePreference;
  label: string;
  description: string;
  icon: LucideIcon;
};

const OPTIONS: Option[] = [
  {
    value: "light",
    label: "Modo claro",
    description: "Interfaz luminosa, ideal para entornos bien iluminados.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Modo oscuro",
    description: "Superficies oscuras con acentos de marca para uso prolongado.",
    icon: Moon,
  },
  {
    value: "system",
    label: "Automático",
    description: "Sigue la preferencia del sistema operativo (prefers-color-scheme).",
    icon: Laptop,
  },
];

function ConfiguracionPage() {
  const { preference, setPreference, theme } = useTheme();
  const { roles, user } = useAuth();
  const isAdmin = roles.includes("admin");
  const isOwner = user?.email?.toLowerCase() === "proyectos@easervice.app";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configuración"
        description="Preferencias de la interfaz y accesibilidad"
      />

      <div className="px-4 md:px-8 pb-8">
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Apariencia</CardTitle>
            <CardDescription>
              Elige cómo quieres ver EA Service Connect. La preferencia se guarda en
              este dispositivo. En modo automático, la app respeta el ajuste de tu
              sistema y se actualiza si lo cambias.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset>
              <legend className="sr-only">Modo de color</legend>
              <div
                role="radiogroup"
                aria-label="Modo de color"
                className="grid gap-3 sm:grid-cols-3"
              >
                {OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = preference === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPreference(opt.value)}
                      className={
                        "group text-left p-4 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card " +
                        (selected
                          ? "border-primary bg-primary/8 shadow-sm"
                          : "border-border hover:border-ring/60 hover:bg-secondary/50")
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "size-9 grid place-items-center rounded-md " +
                            (selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground")
                          }
                          aria-hidden="true"
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="font-display font-semibold">{opt.label}</span>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <p className="mt-4 text-xs text-muted-foreground">
              Tema activo actualmente:{" "}
              <span className="font-semibold text-foreground">
                {theme === "dark" ? "Oscuro" : "Claro"}
              </span>
              {preference === "system" ? " (siguiendo al sistema)" : ""}
            </p>
          </CardContent>
        </Card>
        {isAdmin && <PasswordPolicyCard />}
        {isAdmin && <FeriadosCard />}
        {isOwner && <ReportEmailPauseCard />}
        {isOwner && <ResetDataCard />}
      </div>
    </div>
  );
}

function FeriadosCard() {
  const qc = useQueryClient();
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [fecha, setFecha] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");

  const fList = useServerFn(listFeriados);
  const fUpsert = useServerFn(upsertFeriado);
  const fDel = useServerFn(deleteFeriado);
  const fToggle = useServerFn(toggleFeriadoActivo);
  const fSeed = useServerFn(seedFeriadosAnio);

  const q = useQuery({
    queryKey: ["feriados", anio],
    queryFn: () => fList({ data: { anio } }),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["feriados", anio] });
    qc.invalidateQueries({ queryKey: ["feriados-activos", anio] });
  };
  const add = useMutation({
    mutationFn: () =>
      fUpsert({ data: { fecha, nombre, tipo: "personalizado", activo: true } }),
    onSuccess: () => {
      toast.success("Feriado agregado");
      setFecha(""); setNombre("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const seed = useMutation({
    mutationFn: () => fSeed({ data: { anio } }),
    onSuccess: (r: any) => {
      toast.success(`Feriados nacionales ${anio} precargados (${r?.insertados ?? ""}).`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => { toast.success("Feriado eliminado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; activo: boolean }) => fToggle({ data: v }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data as any[] | undefined) ?? [];

  return (
    <Card className="max-w-3xl mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          Calendario de feriados
        </CardTitle>
        <CardDescription>
          Los días marcados como feriados se bloquean para programar y reprogramar
          trabajos en toda la aplicación. Puedes precargar los feriados nacionales
          de El Salvador y agregar los días adicionales que aplique tu operación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs font-medium block mb-1">Año</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value) || new Date().getFullYear())}
              className="w-28 bg-secondary border border-border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => seed.mutate()}
            disabled={seed.isPending}
            className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium hover:bg-secondary disabled:opacity-60"
          >
            {seed.isPending ? "Precargando…" : `Precargar nacionales ${anio}`}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] items-end">
          <div>
            <label className="text-xs font-medium block mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="p. ej. Fiesta patronal"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!fecha || nombre.trim().length < 2 || add.isPending}
            onClick={() => add.mutate()}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            {add.isPending ? "Guardando…" : "Agregar"}
          </button>
        </div>

        <div className="border-t border-border pt-3">
          {q.isLoading ? (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin feriados registrados para {anio}. Usa «Precargar nacionales» para empezar.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
              {rows.map((r: any) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-24">{r.fecha}</span>
                  <span className="flex-1 truncate">{r.nombre}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-secondary text-foreground/70">
                    {r.tipo}
                  </span>
                  <Switch
                    checked={r.activo}
                    onCheckedChange={(v) => toggle.mutate({ id: r.id, activo: v })}
                    aria-label="Activo"
                  />
                  <button
                    type="button"
                    onClick={() => { if (confirm("¿Eliminar este feriado?")) del.mutate(r.id); }}
                    className="text-destructive hover:opacity-80"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordPolicyCard() {
  const qc = useQueryClient();
  const fGet = useServerFn(getPasswordPolicy);
  const fSet = useServerFn(setPasswordPolicy);
  const q = useQuery({ queryKey: ["password-policy"], queryFn: () => fGet() });
  const [pol, setPol] = useState<PasswordPolicy | null>(null);
  useEffect(() => { if (q.data && !pol) setPol(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: (data: PasswordPolicy) => fSet({ data }),
    onSuccess: () => {
      toast.success("Política de contraseñas actualizada");
      qc.invalidateQueries({ queryKey: ["password-policy"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!pol) {
    return (
      <Card className="max-w-3xl mt-6">
        <CardHeader>
          <CardTitle>Política de contraseñas temporales</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Cargando…</p>
        </CardContent>
      </Card>
    );
  }

  const toggle = (key: keyof PasswordPolicy) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPol({ ...pol, [key]: e.target.checked } as PasswordPolicy);

  return (
    <Card className="max-w-3xl mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          Política de contraseñas temporales
        </CardTitle>
        <CardDescription>
          Aplica a las claves que el sistema genera al invitar usuarios o al atender una
          solicitud de recuperación. El usuario debe cambiarla en su primer ingreso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs font-medium block mb-1">Longitud mínima</label>
          <input
            type="number"
            min={8}
            max={64}
            value={pol.longitud}
            onChange={(e) =>
              setPol({ ...pol, longitud: Math.max(8, Math.min(64, Number(e.target.value) || 8)) })
            }
            className="w-32 bg-secondary border border-border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pol.requiere_mayusculas} onChange={toggle("requiere_mayusculas")} className="accent-primary size-4" />
            Requiere mayúsculas
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pol.requiere_minusculas} onChange={toggle("requiere_minusculas")} className="accent-primary size-4" />
            Requiere minúsculas
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pol.requiere_digitos} onChange={toggle("requiere_digitos")} className="accent-primary size-4" />
            Requiere dígitos
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pol.requiere_simbolos} onChange={toggle("requiere_simbolos")} className="accent-primary size-4" />
            Requiere símbolos (!@#$%&*?+-)
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={pol.excluir_ambiguos} onChange={toggle("excluir_ambiguos")} className="accent-primary size-4" />
            Excluir caracteres ambiguos (0, O, 1, l, I)
          </label>
        </div>
        <div className="pt-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={() => save.mutate(pol)}
            disabled={save.isPending}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {save.isPending ? "Guardando…" : "Guardar política"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportEmailPauseCard() {
  const qc = useQueryClient();
  const fGet = useServerFn(getReportUploadEmailPaused);
  const fSet = useServerFn(setReportUploadEmailPaused);
  const q = useQuery({ queryKey: ["report-upload-email-paused"], queryFn: () => fGet() });
  const save = useMutation({
    mutationFn: (paused: boolean) => fSet({ data: { paused } }),
    onSuccess: (_r, paused) => {
      toast.success(paused
        ? "Correos automáticos pausados. Solo se seguirán enviando los de seguridad y administración de usuarios."
        : "Correos automáticos reactivados. La app volverá a enviar todos los correos operativos.");
      qc.invalidateQueries({ queryKey: ["report-upload-email-paused"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const paused = Boolean(q.data?.paused);
  return (
    <Card className="max-w-3xl mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailX className="size-4 text-primary" />
          Correos automáticos
        </CardTitle>
        <CardDescription>
          Cuando esta opción está activa, la app deja de enviar cualquier correo
          operativo (reportes, evidencias, aprobaciones, solicitudes de visita,
          notificaciones a técnicos, rutas, contratos por vencer, etc.). Las
          notificaciones dentro de la app siguen registrándose. Se siguen
          enviando únicamente los correos de <b>seguridad</b> y <b>administración
          de usuarios</b>: recuperación de contraseña, invitaciones y credenciales
          de acceso.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">
            {q.isLoading ? "Cargando…" : paused ? "Correos pausados" : "Correos activos"}
          </p>
          <p className="text-xs text-muted-foreground">
            {paused
              ? "Solo se envían correos de seguridad y administración de usuarios."
              : "Se envían todos los correos automáticos de la app."}
          </p>
        </div>
        <Switch
          checked={paused}
          disabled={q.isLoading || save.isPending}
          onCheckedChange={(v) => save.mutate(v)}
          aria-label="Pausar correos automáticos"
        />
      </CardContent>
    </Card>
  );
}

function ResetDataCard() {
  const qc = useQueryClient();
  const fReset = useServerFn(resetDatosOperacionales);
  const [confirm, setConfirm] = useState("");
  const reset = useMutation({
    mutationFn: () => fReset(),
    onSuccess: () => {
      toast.success("Datos operativos eliminados. La app está lista para iniciar desde cero.");
      setConfirm("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const armed = confirm.trim().toUpperCase() === "REINICIAR";
  return (
    <Card className="max-w-3xl mt-6 border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" />
          Reiniciar datos de la aplicación
        </CardTitle>
        <CardDescription>
          Borra todos los clientes, plantas, equipos, trabajos, mantenimientos, contratos,
          inventario, reportes, notificaciones, solicitudes y archivos cargados (evidencias y firmas).
          Se conservan los usuarios, sus roles y la configuración del sistema. Útil al publicar
          la app por primera vez para que el cliente comience desde cero. Esta acción no se puede deshacer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="text-xs font-medium block">
          Escribe <span className="font-mono font-bold">REINICIAR</span> para habilitar el botón
        </label>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="REINICIAR"
          className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!armed || reset.isPending}
            onClick={() => {
              if (window.confirm("¿Confirmas que deseas eliminar TODOS los datos operativos? Esta acción es irreversible.")) {
                reset.mutate();
              }
            }}
            className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
          >
            {reset.isPending ? "Reiniciando…" : "Reiniciar datos ahora"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}