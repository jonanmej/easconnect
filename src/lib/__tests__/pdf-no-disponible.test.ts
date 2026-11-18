import { describe, it, expect } from "vitest";
import { diasOcupadosAjenos, buildCalendarGrids } from "@/lib/pdf/programacion-grids";

const ajeno = { planta_nombre: "Ocupado/Reservado", folio: "", servicio: "", propio: false, estado: null };
const propio = { planta_nombre: "Mi planta", folio: "T-1", servicio: "Limpieza", propio: true, estado: "programado" };

describe("disponibilidad → celdas 'No disponible' del PDF", () => {
  it("marca un día ocupado por otro cliente", () => {
    const s = diasOcupadosAjenos([{ fecha: "2026-08-12", asignaciones: [ajeno] }, { fecha: "2026-08-13", asignaciones: [] }]);
    expect([...s]).toEqual(["2026-08-12"]);
  });
  it("un trabajo ajeno de varios días marca cada día del rango", () => {
    const dias = ["2026-08-10", "2026-08-11", "2026-08-12"].map((fecha) => ({ fecha, asignaciones: [ajeno] }));
    const g = buildCalendarGrids("semana", new Date(2026, 7, 10), [], diasOcupadosAjenos(dias));
    expect(g.semana_dias!.map((d) => d.no_disponible)).toEqual([true, true, true, false, false, false, false]);
  });
  it("día con trabajo propio y ajeno conserva ambos", () => {
    const s = diasOcupadosAjenos([{ fecha: "2026-08-11", asignaciones: [propio, ajeno] }]);
    const t = { id: "x", folio: "T-1", servicio: "Limpieza", estado: "programado", fecha_programada: "2026-08-11T14:00:00Z", duracion_dias: 1, cliente_id: "c1", cliente_nombre: "Yo" };
    const g = buildCalendarGrids("semana", new Date(2026, 7, 10), [t], s);
    const mar = g.semana_dias![1];
    expect(mar.no_disponible).toBe(true);
    expect(mar.items.map((i) => i.folio)).toEqual(["T-1"]);
  });
  it("solo trabajos propios o sin ocupación no marca nada", () => {
    expect(diasOcupadosAjenos([{ fecha: "2026-08-11", asignaciones: [propio] }, { fecha: "2026-08-12", asignaciones: [] }]).size).toBe(0);
    const g = buildCalendarGrids("mes", new Date(2026, 7, 15), []);
    expect(g.mes_semanas!.flatMap((w) => w.dias).some((d) => d.no_disponible)).toBe(false);
  });
});
