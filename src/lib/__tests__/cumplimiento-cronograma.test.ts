import { describe, it, expect } from "vitest";
import { calcularCumplimientoCronograma as calc } from "@/lib/cumplimiento-cronograma";

const AHORA = new Date("2026-11-13T12:00:00Z").getTime();

describe("cumplimiento del cronograma", () => {
  it("sin vencidas da 100% con 0/0", () => {
    expect(calc([{ fecha_programada: "2026-11-13T10:00:00Z", estado: "programado", duracion_dias: 1 }], AHORA)).toEqual({ pct: 100, num: 0, den: 0 });
  });
  it("todas a tiempo da 100%", () => {
    expect(calc([
      { fecha_programada: "2026-11-01T08:00:00Z", estado: "completado", duracion_dias: 2, fecha_completado: "2026-11-03T08:00:00Z" },
      { fecha_programada: "2026-11-05T08:00:00Z", estado: "completado", duracion_dias: 1, fecha_completado: "2026-11-05T15:00:00Z" },
    ], AHORA)).toEqual({ pct: 100, num: 2, den: 2 });
  });
  it("completado tarde no cuenta a tiempo", () => {
    expect(calc([
      { fecha_programada: "2026-11-01T08:00:00Z", estado: "completado", duracion_dias: 1, fecha_completado: "2026-11-02T08:00:01Z" },
    ], AHORA)).toEqual({ pct: 0, num: 0, den: 1 });
  });
  it("programado vencido cuenta en el denominador", () => {
    expect(calc([
      { fecha_programada: "2026-11-01T08:00:00Z", estado: "completado", duracion_dias: 1, fecha_completado: "2026-11-01T12:00:00Z" },
      { fecha_programada: "2026-11-02T08:00:00Z", estado: "programado", duracion_dias: 3 },
      { fecha_programada: "2026-11-02T08:00:00Z", estado: "cancelado", duracion_dias: 1 },
    ], AHORA)).toEqual({ pct: 50, num: 1, den: 2 });
  });
  it("duracion_dias nula se toma como 1 día", () => {
    expect(calc([{ fecha_programada: "2026-11-12T11:00:00Z", estado: "en_progreso", duracion_dias: null }], AHORA)).toEqual({ pct: 0, num: 0, den: 1 });
    expect(calc([{ fecha_programada: "2026-11-12T13:00:00Z", estado: "en_progreso", duracion_dias: null }], AHORA)).toEqual({ pct: 100, num: 0, den: 0 });
  });
});
