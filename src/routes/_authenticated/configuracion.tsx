import { createFileRoute } from "@tanstack/react-router";
import { Sun, Moon, Laptop, ShieldCheck, AlertTriangle, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getPasswordPolicy, setPasswordPolicy, type PasswordPolicy } from "@/lib/system-config.functions";
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
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

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
        {isAdmin && <ResetDataCard />}
      </div>
    </div>
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