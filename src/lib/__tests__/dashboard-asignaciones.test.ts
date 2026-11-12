import { describe, expect, it } from "vitest";
import { asignacionesDeHoy } from "@/lib/dashboard-asignaciones";

const base = { id: "ot", tecnico_id: "tecnico-a", fecha_programada: "2026-11-12T08:00:00-06:00", estado: "programado" };

describe("Asignaciones del técnico en el inicio", () => {
  it("muestra solo trabajos del técnico actual, incluyendo asignaciones adicionales como terreno", () => {
    const extra = { ...base, id: "extra", tecnico_id: "otro", tecnicos_ids: ["otro", "tecnico-a"] };
    const ajeno = { ...base, id: "ajeno", tecnico_id: "otro" };
    expect(asignacionesDeHoy([base, extra, ajeno], "tecnico-a", "2026-11-12").map((t) => t.id)).toEqual(["ot", "extra"]);
    expect(asignacionesDeHoy([base], undefined, "2026-11-12")).toEqual([]);
  });

  it("incluye solo las asignaciones activas de hoy, no pausadas, completadas o canceladas", () => {
    const filas = [base, { ...base, id: "ayer", fecha_programada: "2026-11-11T08:00:00-06:00" },
      { ...base, id: "pausa", pausada_at: "2026-11-12T12:00:00Z" },
      { ...base, id: "cerrada", estado: "completado" }, { ...base, id: "cancelada", estado: "cancelado" },
      { ...base, id: "curso", estado: "en_progreso" }];
    expect(asignacionesDeHoy(filas, "tecnico-a", "2026-11-12").map((t) => t.id)).toEqual(["ot", "curso"]);
  });

  it("respeta duración laborable, zona horaria y reprogramaciones del calendario existente", () => {
    const larga = { ...base, fecha_programada: "2026-11-11T23:30:00-06:00", duracion_dias: 2 };
    expect(asignacionesDeHoy([larga], "tecnico-a", "2026-11-12")).toEqual([larga]);
    const movida = { ...base, excepciones_dia: [{ fecha_original: "2026-11-12", fecha_movida: "2026-11-13" }] };
    expect(asignacionesDeHoy([movida], "tecnico-a", "2026-11-12")).toEqual([]);
    expect(asignacionesDeHoy([movida], "tecnico-a", "2026-11-13")).toEqual([movida]);
  });
});