export type ConflictoTecnico = {
  id: string;
  folio: string;
  fecha_programada: string;
  duracion_dias: number;
};

const PREFIX = "CONFLICTO_TECNICO::";

export function parseConflictoError(msg?: string | null): ConflictoTecnico[] | null {
  if (!msg || !msg.startsWith(PREFIX)) return null;
  try {
    return JSON.parse(msg.slice(PREFIX.length)) as ConflictoTecnico[];
  } catch {
    return null;
  }
}

function fmt(d: Date) {
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatConflictoRango(c: ConflictoTecnico): string {
  const ini = new Date(c.fecha_programada);
  const dur = Math.max(1, Number(c.duracion_dias ?? 1));
  if (dur === 1) return fmt(ini);
  const fin = new Date(ini);
  fin.setDate(fin.getDate() + dur - 1);
  return `${fmt(ini)} → ${fmt(fin)} (${dur} días)`;
}

/** Devuelve un mensaje legible. Si no es conflicto, retorna el mensaje original. */
export function formatConflictoMensaje(msg?: string | null): string {
  const conflictos = parseConflictoError(msg);
  if (!conflictos) return msg ?? "";
  const lineas = conflictos.map((c) => `• ${c.folio} — ${formatConflictoRango(c)}`).join("\n");
  const plural = conflictos.length === 1 ? "el trabajo" : "los trabajos";
  return `El técnico ya tiene ${plural} asignado(s) en ese rango:\n${lineas}\n\nElige otra fecha o cambia el técnico.`;
}