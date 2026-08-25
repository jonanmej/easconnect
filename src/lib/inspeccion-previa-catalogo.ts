/**
 * Catálogo compartido del reporte de estado previo a trabajos
 * (techos / áreas fotovoltaicas y sectores circundantes).
 * Se usa tanto en el formulario de campo como en el PDF.
 */

export type NivelEstado = "bueno" | "regular" | "malo" | "critico";

export const NIVELES: { value: NivelEstado; label: string; color: string }[] = [
  { value: "bueno", label: "Bueno", color: "#16a34a" },
  { value: "regular", label: "Regular", color: "#ca8a04" },
  { value: "malo", label: "Malo", color: "#ea580c" },
  { value: "critico", label: "Crítico", color: "#dc2626" },
];

export const NIVEL_LABEL: Record<string, string> = {
  bueno: "Bueno",
  regular: "Regular",
  malo: "Malo",
  critico: "Crítico",
};

export const TIPOS_CUBIERTA = [
  "Lámina metálica (zinc/aluzinc)",
  "Lámina tipo sándwich / aislada",
  "Losa de concreto",
  "Teja",
  "Fibrocemento",
  "Membrana / impermeabilizante",
  "Estructura en suelo (ground mount)",
  "Carport / estacionamiento",
  "Otro",
];

export type AreaHallazgo = "techo" | "estructura" | "accesos" | "circundante" | "electrico" | "otro";

export const AREAS: { value: AreaHallazgo; label: string }[] = [
  { value: "techo", label: "Techo / cubierta" },
  { value: "estructura", label: "Estructura de montaje" },
  { value: "accesos", label: "Accesos y seguridad" },
  { value: "circundante", label: "Sector circundante" },
  { value: "electrico", label: "Eléctrico" },
  { value: "otro", label: "Otro" },
];

export const AREA_LABEL: Record<string, string> = Object.fromEntries(
  AREAS.map((a) => [a.value, a.label]),
);

export type Severidad = "leve" | "moderado" | "critico";

export const SEVERIDADES: { value: Severidad; label: string; color: string }[] = [
  { value: "leve", label: "Leve", color: "#0ea5e9" },
  { value: "moderado", label: "Moderado", color: "#ea580c" },
  { value: "critico", label: "Crítico", color: "#dc2626" },
];

export const SEVERIDAD_LABEL: Record<string, string> = Object.fromEntries(
  SEVERIDADES.map((s) => [s.value, s.label]),
);

/** Checklist de riesgos y condiciones detectadas antes de iniciar labores. */
export const RIESGOS: { grupo: string; items: { value: string; label: string }[] }[] = [
  {
    grupo: "Techo / cubierta",
    items: [
      { value: "filtraciones", label: "Filtraciones o humedad" },
      { value: "laminas_danadas", label: "Láminas dobladas o perforadas" },
      { value: "oxido", label: "Óxido o corrosión" },
      { value: "deformaciones", label: "Deformaciones / hundimientos" },
      { value: "torniolleria_suelta", label: "Tornillería suelta o faltante" },
      { value: "sellos_vencidos", label: "Sellos o impermeabilizante vencido" },
      { value: "transito_restringido", label: "Zonas donde no se puede caminar" },
    ],
  },
  {
    grupo: "Accesos y seguridad",
    items: [
      { value: "sin_anclajes", label: "Sin puntos de anclaje para arnés" },
      { value: "escalera_insegura", label: "Escalera o acceso inseguro" },
      { value: "bordes_sin_proteccion", label: "Bordes sin baranda ni protección" },
      { value: "lineas_electricas", label: "Líneas eléctricas cercanas" },
      { value: "superficie_resbalosa", label: "Superficie resbalosa" },
      { value: "obstaculos", label: "Obstáculos en la ruta de trabajo" },
      { value: "sin_iluminacion", label: "Iluminación insuficiente" },
    ],
  },
  {
    grupo: "Sector circundante",
    items: [
      { value: "vegetacion", label: "Vegetación o ramas invasivas" },
      { value: "sombras", label: "Sombras de estructuras vecinas" },
      { value: "canaletas_obstruidas", label: "Canaletas o bajadas obstruidas" },
      { value: "drenaje_deficiente", label: "Drenaje deficiente / encharcamiento" },
      { value: "polvo_industrial", label: "Polvo o emisiones industriales" },
      { value: "obra_vecina", label: "Obra o trabajos de terceros" },
      { value: "acumulacion_material", label: "Acumulación de material o escombros" },
    ],
  },
  {
    grupo: "Eléctrico",
    items: [
      { value: "cableado_expuesto", label: "Cableado expuesto o dañado" },
      { value: "conectores_sueltos", label: "Conectores sueltos" },
      { value: "puntos_calientes", label: "Puntos calientes visibles" },
      { value: "tableros_sin_señalizacion", label: "Tableros sin señalización" },
    ],
  },
];

export const RIESGO_LABEL: Record<string, string> = Object.fromEntries(
  RIESGOS.flatMap((g) => g.items.map((i) => [i.value, i.label])),
);
