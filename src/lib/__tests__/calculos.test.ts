import { describe, it, expect } from "vitest";
import { formatPotencia, formatCapacidadKwp } from "@/lib/potencia";
import { isoWeek, isoWeekFromISODate } from "@/lib/semana-iso";
import { verificarCifras, cifrasPermitidas, construirIndicadores } from "@/lib/reporte-ia";
import { calcularIsss, calcularAfp, calcularRenta, calcularDescuentos } from "@/lib/nomina-descuentos";
import { desglosarJornada, valorHoraOrdinaria, pagoDesglose } from "@/lib/nomina";

const loc = (n: number) => n.toLocaleString("es-SV", { maximumFractionDigits: 3 });

describe("formatPotencia", () => {
  it("unidades medidas e instaladas", () => {
    expect(formatPotencia(750)).toBe("750 W");
    expect(formatPotencia(2000)).toBe("2 kW");
    expect(formatCapacidadKwp(500)).toBe("500 kWp");
    expect(formatCapacidadKwp(2500)).toBe(`${loc(2.5)} MWp`);
    expect(formatPotencia(null)).toBe("—");
    expect(formatPotencia("abc")).toBe("—");
  });
});

describe("isoWeek", () => {
  it("casos límite ISO 8601", () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1); // jueves
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53); // viernes → S53 de 2026
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1); // lunes → S1 de 2025
    expect(isoWeekFromISODate("2026-10-09")).toBe(41);
  });
});

describe("verificarCifras", () => {
  const permitidas = cifrasPermitidas({ avance: 85.5, paneles: 1200 });
  it("acepta cifras de los datos y omite conteos 0–10", () => {
    const r = verificarCifras({ titulo: "Informe", resumen: "Avance 85.5 % con 1,200 paneles en 3 zonas", hallazgos: [], recomendaciones: [] } as any, permitidas);
    expect(r).toEqual([]);
  });
  it("marca cifras inventadas", () => {
    const r = verificarCifras({ titulo: "Informe", resumen: "Se recuperaron 999 kW", hallazgos: [], recomendaciones: [] } as any, permitidas);
    expect(r.join(" ")).toContain("999");
  });
});

describe("construirIndicadores", () => {
  const dias = [
    { fecha: "2026-03-02", paneles_limpiados: 100, horas_trabajadas: 8, agua_galones: 50 },
    { fecha: "2026-03-03", paneles_limpiados: 200, horas_trabajadas: 8, agua_galones: 50 },
  ];
  it("suma desde los datos y oculta lo interno al cliente", () => {
    const cli = construirIndicadores(dias, [], "cliente");
    expect(cli.find((i) => i.label === "Paneles intervenidos")?.value).toBe("300");
    expect(cli.find((i) => i.label === "Días de servicio reportados")?.value).toBe("2");
    expect(cli.some((i) => i.label === "Horas trabajadas" || i.label === "Agua utilizada")).toBe(false);
    const int = construirIndicadores(dias, [], "interno");
    expect(int.find((i) => i.label === "Horas trabajadas")?.value).toBe("16");
  });
});

describe("Nómina El Salvador", () => {
  it("ISSS con tope US$30", () => {
    expect(calcularIsss(800)).toBe(24);
    expect(calcularIsss(2000)).toBe(30);
  });
  it("AFP 7.25 % con tope", () => {
    expect(calcularAfp(800)).toBe(58);
    expect(calcularAfp(10000)).toBe(536.37);
  });
  it("Renta por tramos", () => {
    expect(calcularRenta(400)).toBe(0);
    expect(calcularRenta(800)).toBe(50.47);
    expect(calcularRenta(1000)).toBe(80.95);
    expect(calcularRenta(3000)).toBe(577.14);
  });
  it("Neto de US$800", () => {
    const d = calcularDescuentos(800);
    expect(d.renta_gravable).toBe(718);
    expect(d.renta).toBe(42.27);
    expect(d.total_neto).toBe(675.73);
  });
  it("Horas extras: almuerzo no cuenta", () => {
    const d = desglosarJornada({
      hora_inicio: "2026-03-02T07:00:00-06:00", hora_fin: "2026-03-02T17:00:00-06:00",
      almuerzo_inicio: "2026-03-02T12:00:00-06:00", almuerzo_fin: "2026-03-02T13:00:00-06:00",
    });
    expect(d).toEqual({ ord_diurna: 8, ord_nocturna: 0, extra_diurna: 1, extra_nocturna: 0 });
  });
  it("Horas nocturnas desde las 19:00", () => {
    const d = desglosarJornada({ hora_inicio: "2026-03-02T14:00:00-06:00", hora_fin: "2026-03-02T23:00:00-06:00" });
    expect(d).toEqual({ ord_diurna: 5, ord_nocturna: 3, extra_diurna: 0, extra_nocturna: 1 });
  });
  it("Pago: hábil y feriado (doble)", () => {
    const vh = valorHoraOrdinaria(720);
    expect(vh).toBe(3);
    const des = { ord_diurna: 8, ord_nocturna: 0, extra_diurna: 1, extra_nocturna: 0 };
    expect(pagoDesglose(des, "habil", vh).total).toBe(30);
    expect(pagoDesglose(des, "feriado", vh).total).toBe(60);
    expect(pagoDesglose({ ...des, extra_diurna: 0 }, "descanso", vh).total).toBe(36);
  });
});
