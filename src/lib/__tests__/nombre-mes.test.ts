import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { nombreMes, nombreMesAnio, nombreMesAnioDe } from "../nombre-mes";

const SCRIPT = `
import { nombreMes, nombreMesAnioDe } from "./src/lib/nombre-mes.ts";
const out = [];
for (let m = 0; m < 12; m++) out.push(nombreMes(new Date(2026, m, 1).getMonth()) + "|" + nombreMesAnioDe(new Date(2026, m, 1)));
console.log(JSON.stringify(out));
`;

function enZona(tz: string): string[] {
  const r = execFileSync("bun", ["-e", SCRIPT], { env: { ...process.env, TZ: tz }, cwd: process.cwd() });
  return JSON.parse(r.toString().trim());
}

describe("nombreMes (vistas Año)", () => {
  it("devuelve el mes correcto", () => {
    expect(nombreMes(0)).toBe("enero");
    expect(nombreMes(11)).toBe("diciembre");
    expect(nombreMesAnio(2027, 0)).toBe("enero de 2027");
    expect(nombreMesAnioDe(new Date(2026, 9, 1))).toBe("octubre de 2026");
  });

  it("no se corre en UTC ni en zonas positivas o negativas", () => {
    const esperado = enZona("America/El_Salvador");
    expect(esperado[0]).toBe("enero|enero de 2026");
    for (const tz of ["UTC", "Europe/Madrid", "Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      expect(enZona(tz)).toEqual(esperado);
    }
  });
});
