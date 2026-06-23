import { createFileRoute } from "@tanstack/react-router";
import { Sun, Moon, Laptop, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme, type ThemePreference } from "@/lib/theme-context";

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
      </div>
    </div>
  );
}