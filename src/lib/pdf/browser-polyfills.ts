import { Buffer as BufferPolyfill } from "buffer";

// Debe ejecutarse ANTES de importar @react-pdf/renderer o cualquier documento
// que importe sus componentes. En producción, @react-pdf captura `Buffer`
// durante la evaluación del módulo; si se define después, las imágenes base64
// fallan con "Cannot read properties of undefined (reading 'isBuffer')".
if (typeof globalThis !== "undefined") {
  const g = globalThis as typeof globalThis & { Buffer?: typeof BufferPolyfill };
  if (!g.Buffer) g.Buffer = BufferPolyfill;
}