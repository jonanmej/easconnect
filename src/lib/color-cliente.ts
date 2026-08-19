/**
 * Color estable por cliente para diferenciar visualmente pines de mapa,
 * grupos de listas y encabezados. Si el cliente tiene un color de acento
 * configurado, se respeta; si no, se deriva un tono determinista del id
 * (mismo cliente = mismo color siempre).
 */
export function colorCliente(seed: string, custom?: string | null): string {
  if (custom && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(custom.trim())) return custom.trim();
  let h = 0;
  const s = String(seed ?? "");
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 100000;
  // Ángulo dorado: reparte los tonos de forma perceptualmente separada.
  const hue = Math.round((h * 137.508) % 360);
  const sat = 68 + (h % 3) * 6;
  const light = 44 + (h % 4) * 4;
  return `hsl(${hue} ${sat}% ${light}%)`;
}