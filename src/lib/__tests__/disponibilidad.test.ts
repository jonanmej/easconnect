import { afterEach, describe, expect, it } from "vitest";
import { clearFeriadosCache, setFeriadosCache } from "@/lib/dias-habiles";
import { construirDisponibilidad, type TrabajoDisponibilidad } from "@/lib/disponibilidad";

function ot(fecha_inicio: string, duracion_dias: number, excepciones_dia: TrabajoDisponibilidad["excepciones_dia"] = []): TrabajoDisponibilidad {
  return {
    fecha_inicio,
    duracion_dias,
    propio: false,
    folio: null,
    servicio: null,
    nombre_trabajo: null,
    planta_nombre: null,
    estado: null,
    excepciones_dia,
  };
}

function ocupadas(trabajos: TrabajoDisponibilidad[], desde: string, hasta: string) {
  return construirDisponibilidad(trabajos, desde, hasta)
    .filter((d) => d.ocupada)
    .map((d) => d.fecha);
}

afterEach(() => clearFeriadosCache());

describe("expansión de disponibilidad", () => {
  it("cuenta días hábiles y cruza el fin de semana", () => {
    expect(ocupadas([ot("2026-08-13T08:00:00-06:00", 5)], "2026-08-13", "2026-08-20"))
      .toEqual(["2026-08-13", "2026-08-14", "2026-08-17", "2026-08-18", "2026-08-19"]);
  });

  it("salta feriados oficiales y los configurados en la app", () => {
    setFeriadosCache(2026, new Set(["2026-08-07"]));
    expect(ocupadas([ot("2026-08-05T08:00:00-06:00", 4)], "2026-08-05", "2026-08-13"))
      .toEqual(["2026-08-05", "2026-08-10", "2026-08-11", "2026-08-12"]);
  });

  it("respeta un día movido sin ocupar la fecha original", () => {
    const trabajo = ot("2026-11-09T08:00:00-06:00", 3, [
      { fecha_original: "2026-11-10", fecha_movida: "2026-11-14" },
    ]);
    expect(ocupadas([trabajo], "2026-11-09", "2026-11-15"))
      .toEqual(["2026-11-09", "2026-11-11", "2026-11-14"]);
  });

  it("cuenta el sábado de inicio de una emergencia y sigue el lunes", () => {
    expect(ocupadas([ot("2026-11-14T08:00:00-06:00", 2)], "2026-11-14", "2026-11-17"))
      .toEqual(["2026-11-14", "2026-11-16"]);
  });

  it("incluye una OT iniciada antes del rango que ocupa días dentro", () => {
    expect(ocupadas([ot("2026-08-13T08:00:00-06:00", 5)], "2026-08-18", "2026-08-20"))
      .toEqual(["2026-08-18", "2026-08-19"]);
  });

  it("conserva el enmascarado de las OT ajenas en la respuesta por día", () => {
    const [dia] = construirDisponibilidad([ot("2026-08-13T08:00:00-06:00", 1)], "2026-08-13", "2026-08-13");
    expect(dia.asignaciones).toEqual([{
      planta_nombre: "Ocupado/Reservado",
      folio: "",
      servicio: "",
      propio: false,
      estado: null,
    }]);
  });
});
