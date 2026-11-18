import { describe, it, expect } from "vitest";
import { solicitarConfirmacion, responderConfirmacion, confirmacionActual } from "../confirm-store";

describe("confirmación compartida", () => {
  it("confirmar resuelve true", async () => {
    const p = solicitarConfirmacion({ titulo: "¿Eliminar?" });
    expect(confirmacionActual()?.titulo).toBe("¿Eliminar?");
    responderConfirmacion(true);
    expect(await p).toBe(true);
    expect(confirmacionActual()).toBeNull();
  });
  it("cancelar o Escape (cierre) resuelve false", async () => {
    const p = solicitarConfirmacion({ titulo: "x" });
    responderConfirmacion(false);
    expect(await p).toBe(false);
  });
  it("una nueva confirmación resuelve la anterior en false", async () => {
    const a = solicitarConfirmacion({ titulo: "a" });
    const b = solicitarConfirmacion({ titulo: "b" });
    expect(await a).toBe(false);
    responderConfirmacion(true);
    expect(await b).toBe(true);
  });
});
