import { describe, it, expect } from "vitest";
import { fraccionSalarioMensual } from "@/lib/nomina";
import { calcularDescuentos, calcularDescuentosCorte } from "@/lib/nomina-descuentos";

describe("salario mensual por corte", () => {
  it("mes completo paga el salario entero, cada quincena la mitad", () => {
    expect(fraccionSalarioMensual("2026-11-01", "2026-11-30")).toBe(1);
    expect(fraccionSalarioMensual("2026-11-01", "2026-11-15")).toBe(0.5);
    expect(fraccionSalarioMensual("2026-11-16", "2026-11-30")).toBe(0.5);
    expect(fraccionSalarioMensual("2026-02-16", "2026-02-28")).toBe(0.5);
  });
  it("un salario de $600 da $600 de base aunque marque 22 días", () => {
    expect(600 * fraccionSalarioMensual("2026-11-01", "2026-11-30")).toBe(600);
  });
});

describe("descuentos de ley por quincena", () => {
  const sumar = (a: any, b: any) => ({ isss: a.isss + b.isss, afp: a.afp + b.afp, renta: a.renta + b.renta });
  it("dos quincenas de $1,200 al mes no superan el tope de ISSS y retienen la misma renta que el mes", () => {
    const q1 = calcularDescuentosCorte(600 * 2, { bruto: 0, isss: 0, afp: 0, renta: 0 }, { proyectarQuincena: true });
    const q2 = calcularDescuentosCorte(1200, { bruto: 1200, isss: q1.isss, afp: q1.afp, renta: q1.renta }, { proyectarQuincena: true });
    const total = sumar(q1, q2);
    const mes = calcularDescuentos(2400);
    expect(total.isss).toBeLessThanOrEqual(30);
    expect(total.isss).toBeCloseTo(mes.isss, 2);
    expect(total.renta).toBeCloseTo(mes.renta, 2);
    expect(total.afp).toBeCloseTo(mes.afp, 2);
  });
  it("salario $1,200: quincenas suman ISSS $30 y renta igual al mes", () => {
    const q1 = calcularDescuentosCorte(600, { bruto: 0, isss: 0, afp: 0, renta: 0 }, { proyectarQuincena: true });
    const q2 = calcularDescuentosCorte(600, { bruto: 600, isss: q1.isss, afp: q1.afp, renta: q1.renta }, { proyectarQuincena: true });
    const mes = calcularDescuentos(1200);
    expect(q1.isss + q2.isss).toBeCloseTo(30, 2);
    expect(q1.renta + q2.renta).toBeCloseTo(mes.renta, 2);
  });
});
