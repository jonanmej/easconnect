/**
 * Estado puro de la confirmación compartida (sin React), para poder probarlo.
 * Solo hay una confirmación abierta a la vez; si llega otra, la anterior se resuelve en false.
 */
export type OpcionesConfirmacion = {
  titulo: string;
  descripcion?: string;
  accion?: string;
  cancelar?: string;
  destructivo?: boolean;
  /** Si se indica, el botón de confirmar se habilita solo al escribir exactamente este texto. */
  textoRequerido?: string;
  /** Si se indica, el diálogo queda abierto en estado ocupado hasta que termine. */
  alConfirmar?: () => Promise<unknown>;
};

type Pendiente = { opciones: OpcionesConfirmacion; resolver: (v: boolean) => void };

let actual: Pendiente | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

export function solicitarConfirmacion(opciones: OpcionesConfirmacion): Promise<boolean> {
  if (actual) actual.resolver(false);
  return new Promise<boolean>((resolver) => {
    actual = { opciones, resolver };
    avisar();
  });
}

export function responderConfirmacion(valor: boolean) {
  const p = actual;
  if (!p) return;
  actual = null;
  p.resolver(valor);
  avisar();
}

export function confirmacionActual() {
  return actual?.opciones ?? null;
}

export function suscribirConfirmacion(fn: () => void) {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}
