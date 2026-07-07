import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { EALogo } from "@/components/logos/EALogo";
import { SignaturePad } from "@/components/SignaturePad";
import { validarTokenAprobacion, firmarAprobacion } from "@/lib/aprobaciones.functions";

export const Route = createFileRoute("/aprobar/$token")({
  head: () => ({
    meta: [
      { title: "Aprobación de trabajo · EA Service Connect" },
      { name: "description", content: "Confirme la ejecución del trabajo realizado en su planta." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AprobarPage,
  errorComponent: ({ error }) => (
    <Shell>
      <ErrorCard message={error.message} />
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <ErrorCard message="Enlace de aprobación no encontrado." />
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <EALogo className="h-10 w-auto text-brand" accentClassName="text-brand" />
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
            Plataforma de gestión EA Service & Consulting
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
      <footer className="max-w-2xl mx-auto px-4 py-6 text-[11px] text-muted-foreground text-center">
        Este enlace es personal e intransferible · El registro queda con sello de tiempo, IP y navegador.
      </footer>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <AlertTriangle className="size-6 text-destructive mb-2" />
      <h1 className="text-lg font-semibold">No fue posible abrir la aprobación</h1>
      <p className="text-sm text-muted-foreground mt-1">{message}</p>
    </div>
  );
}

function AprobarPage() {
  const { token } = useParams({ from: "/aprobar/$token" });
  const fValidar = useServerFn(validarTokenAprobacion);
  const fFirmar = useServerFn(firmarAprobacion);

  const q = useQuery({
    queryKey: ["aprobar", token],
    queryFn: () => fValidar({ data: { token } }),
    retry: false,
  });

  const [firma, setFirma] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [confirma, setConfirma] = useState(false);

  const m = useMutation({
    mutationFn: () =>
      fFirmar({
        data: {
          token,
          firmante_nombre: nombre.trim(),
          firmante_rut: rut.trim() || undefined,
          firma_png_base64: firma!,
        },
      }),
  });

  if (q.isLoading) {
    return <Shell><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Cargando aprobación…</div></Shell>;
  }
  if (q.error) {
    return <Shell><ErrorCard message={(q.error as Error).message} /></Shell>;
  }
  const t = q.data as any;

  if (!t) {
    return <Shell><ErrorCard message="El enlace de aprobación es inválido o ha expirado." /></Shell>;
  }

  if (t?.firmado_at) {
    return (
      <Shell>
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-6 text-center">
          <CheckCircle2 className="size-10 text-accent mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Trabajo {t.folio} ya fue aprobado</h1>
          <p className="text-sm text-muted-foreground mt-1">Se registró su firma el {new Date(t.firmado_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}.</p>
        </div>
      </Shell>
    );
  }

  if (m.data?.ok) {
    return (
      <Shell>
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-6 text-center">
          <CheckCircle2 className="size-10 text-accent mx-auto mb-3" />
          <h1 className="text-lg font-semibold">¡Gracias! La aprobación quedó registrada</h1>
          <p className="text-sm text-muted-foreground mt-1">Folio {m.data.folio}. El equipo de EA Service recibirá tu confirmación.</p>
        </div>
      </Shell>
    );
  }

  const canSubmit = !!firma && nombre.trim().length >= 2 && confirma && !m.isPending;

  return (
    <Shell>
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Aprobación de trabajo</div>
          <h1 className="text-xl font-semibold mt-1">{t.folio} · {t.servicio}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.planta_nombre} — {t.cliente_nombre}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Programado</div>
            <div>{new Date(t.fecha_programada).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Completado</div>
            <div>{t.fecha_completado ? new Date(t.fecha_completado).toLocaleString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-[11px] uppercase text-muted-foreground">Técnico</div>
            <div>{t.tecnico_nombre || "—"}</div>
          </div>
          {t.notas && (
            <div className="col-span-2">
              <div className="text-[11px] uppercase text-muted-foreground">Notas del técnico</div>
              <div className="whitespace-pre-wrap text-sm">{t.notas}</div>
            </div>
          )}
        </div>

        <hr className="border-border" />

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block mb-1 text-xs font-medium text-muted-foreground">Nombre completo</span>
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 text-xs font-medium text-muted-foreground">RUT / DNI (opcional)</span>
            <input
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Firma</div>
          <SignaturePad onChange={setFirma} />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirma}
            onChange={(e) => setConfirma(e.target.checked)}
            className="mt-1"
          />
          <span>Apruebo la ejecución del trabajo descrito y doy conformidad al servicio recibido.</span>
        </label>

        {m.error && (
          <div className="text-sm text-destructive">Error: {(m.error as Error).message}</div>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => m.mutate()}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {m.isPending ? "Registrando…" : "Firmar y aprobar"}
        </button>
      </div>
    </Shell>
  );
}