-- Categoría nueva de evidencias
ALTER TABLE public.trabajo_evidencias DROP CONSTRAINT IF EXISTS trabajo_evidencias_categoria_check;
ALTER TABLE public.trabajo_evidencias ADD CONSTRAINT trabajo_evidencias_categoria_check
  CHECK (categoria = ANY (ARRAY['antes','durante','despues','anomalia','mediciones','inspeccion_previa']));

CREATE TABLE public.trabajo_inspecciones_previas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trabajo_id uuid NOT NULL UNIQUE REFERENCES public.trabajos(id) ON DELETE CASCADE,
  tecnico_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT current_date,
  cubierta_tipo text,
  cubierta_estado text CHECK (cubierta_estado IN ('bueno','regular','malo','critico')),
  estructura_estado text CHECK (estructura_estado IN ('bueno','regular','malo','critico')),
  accesos_estado text CHECK (accesos_estado IN ('bueno','regular','malo','critico')),
  circundante_estado text CHECK (circundante_estado IN ('bueno','regular','malo','critico')),
  riesgos jsonb NOT NULL DEFAULT '[]'::jsonb,
  techo_detalle text,
  accesos_detalle text,
  circundante_detalle text,
  observaciones text,
  apto boolean NOT NULL DEFAULT true,
  restricciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inspeccion_previa_hallazgos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspeccion_id uuid NOT NULL REFERENCES public.trabajo_inspecciones_previas(id) ON DELETE CASCADE,
  zona_id uuid REFERENCES public.planta_zonas(id) ON DELETE SET NULL,
  area text NOT NULL DEFAULT 'techo'
    CHECK (area IN ('techo','estructura','accesos','circundante','electrico','otro')),
  severidad text NOT NULL DEFAULT 'leve' CHECK (severidad IN ('leve','moderado','critico')),
  descripcion text NOT NULL,
  evidencia_id uuid REFERENCES public.trabajo_evidencias(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iph_inspeccion ON public.inspeccion_previa_hallazgos(inspeccion_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_inspecciones_previas TO authenticated;
GRANT ALL ON public.trabajo_inspecciones_previas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspeccion_previa_hallazgos TO authenticated;
GRANT ALL ON public.inspeccion_previa_hallazgos TO service_role;

ALTER TABLE public.trabajo_inspecciones_previas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspeccion_previa_hallazgos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tip_select ON public.trabajo_inspecciones_previas FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico')
  OR EXISTS (SELECT 1 FROM public.trabajos t JOIN public.plantas p ON p.id = t.planta_id
             WHERE t.id = trabajo_inspecciones_previas.trabajo_id AND p.cliente_id = current_cliente_id())
);

CREATE POLICY tip_write ON public.trabajo_inspecciones_previas FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor')
  OR EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = trabajo_inspecciones_previas.trabajo_id AND t.tecnico_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt WHERE tt.trabajo_id = trabajo_inspecciones_previas.trabajo_id AND tt.tecnico_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor')
  OR EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = trabajo_inspecciones_previas.trabajo_id AND t.tecnico_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt WHERE tt.trabajo_id = trabajo_inspecciones_previas.trabajo_id AND tt.tecnico_id = auth.uid())
);

CREATE POLICY iph_select ON public.inspeccion_previa_hallazgos FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.trabajo_inspecciones_previas i
          WHERE i.id = inspeccion_previa_hallazgos.inspeccion_id)
);

CREATE POLICY iph_write ON public.inspeccion_previa_hallazgos FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor')
  OR EXISTS (SELECT 1 FROM public.trabajo_inspecciones_previas i JOIN public.trabajos t ON t.id = i.trabajo_id
             WHERE i.id = inspeccion_previa_hallazgos.inspeccion_id
               AND (t.tecnico_id = auth.uid()
                    OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt WHERE tt.trabajo_id = t.id AND tt.tecnico_id = auth.uid())))
)
WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor')
  OR EXISTS (SELECT 1 FROM public.trabajo_inspecciones_previas i JOIN public.trabajos t ON t.id = i.trabajo_id
             WHERE i.id = inspeccion_previa_hallazgos.inspeccion_id
               AND (t.tecnico_id = auth.uid()
                    OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt WHERE tt.trabajo_id = t.id AND tt.tecnico_id = auth.uid())))
);

CREATE TRIGGER set_tip_updated_at BEFORE UPDATE ON public.trabajo_inspecciones_previas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_iph_updated_at BEFORE UPDATE ON public.inspeccion_previa_hallazgos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();