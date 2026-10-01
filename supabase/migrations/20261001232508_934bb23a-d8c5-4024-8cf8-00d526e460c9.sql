CREATE TABLE public.vehiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo text NOT NULL,
  placa text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehiculos TO authenticated;
GRANT ALL ON public.vehiculos TO service_role;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff ve vehiculos" ON public.vehiculos FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico'));
CREATE POLICY "Admin/supervisor gestionan vehiculos" ON public.vehiculos FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE TRIGGER vehiculos_updated BEFORE UPDATE ON public.vehiculos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.listados_personal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  proyecto text NOT NULL,
  personal jsonb NOT NULL DEFAULT '[]'::jsonb,
  vehiculo_ids uuid[] NOT NULL DEFAULT '{}',
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listados_personal TO authenticated;
GRANT ALL ON public.listados_personal TO service_role;
ALTER TABLE public.listados_personal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff ve listados" ON public.listados_personal FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico'));
CREATE POLICY "Admin/supervisor gestionan listados" ON public.listados_personal FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE TRIGGER listados_personal_updated BEFORE UPDATE ON public.listados_personal FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dui text;