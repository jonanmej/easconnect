CREATE TABLE public.busquedas_ia_proveedores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  termino text NOT NULL,
  pais text NOT NULL DEFAULT 'El Salvador',
  moneda text NOT NULL DEFAULT 'USD',
  impuesto_pct numeric NOT NULL DEFAULT 0,
  desde_imagen boolean NOT NULL DEFAULT false,
  fuentes integer NOT NULL DEFAULT 0,
  resultados jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.busquedas_ia_proveedores TO authenticated;
GRANT ALL ON public.busquedas_ia_proveedores TO service_role;

ALTER TABLE public.busquedas_ia_proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "busquedas_ia_select" ON public.busquedas_ia_proveedores FOR SELECT TO authenticated
USING (creado_por = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "busquedas_ia_insert" ON public.busquedas_ia_proveedores FOR INSERT TO authenticated
WITH CHECK (creado_por = auth.uid());

CREATE POLICY "busquedas_ia_delete" ON public.busquedas_ia_proveedores FOR DELETE TO authenticated
USING (creado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_busquedas_ia_creado ON public.busquedas_ia_proveedores (creado_por, created_at DESC);

ALTER TABLE public.orden_compra_items ADD COLUMN oferta_ia jsonb;