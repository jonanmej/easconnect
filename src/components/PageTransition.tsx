import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Entrada suave de cada pantalla sin esperar a que la anterior termine de salir:
 * el cambio de ruta es inmediato (antes se esperaban ~0.45 s de animación).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="contents">
      {children}
    </div>
  );
}
