CREATE TYPE public.actividad_interna_estado AS ENUM ('pendiente','en_curso','hecha','cancelada');
CREATE TYPE public.actividad_interna_prioridad AS ENUM ('baja','media','alta');

CREATE TABLE public.actividades_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'Administrativo',
  estado public.actividad_interna_estado NOT NULL DEFAULT 'pendiente',
  prioridad public.actividad_interna_prioridad NOT NULL DEFAULT 'media',
  fecha timestamptz NOT NULL,
  duracion_dias integer NOT NULL DEFAULT 1,
  hora_fin time,
  lugar text,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  responsables uuid[] NOT NULL DEFAULT '{}',
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actividades_internas TO authenticated;
GRANT ALL ON public.actividades_internas TO service_role;
ALTER TABLE public.actividades_internas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actividades_internas_select_staff" ON public.actividades_internas
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico'));
CREATE POLICY "actividades_internas_insert_admin" ON public.actividades_internas
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "actividades_internas_update_admin" ON public.actividades_internas
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "actividades_internas_delete_admin" ON public.actividades_internas
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));

CREATE INDEX actividades_internas_fecha_idx ON public.actividades_internas (fecha);

CREATE TRIGGER set_actividades_internas_updated_at
  BEFORE UPDATE ON public.actividades_internas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.actividad_interna_adjuntos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id uuid NOT NULL REFERENCES public.actividades_internas(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  nombre_original text,
  subido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actividad_interna_adjuntos TO authenticated;
GRANT ALL ON public.actividad_interna_adjuntos TO service_role;
ALTER TABLE public.actividad_interna_adjuntos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actividad_adjuntos_select_staff" ON public.actividad_interna_adjuntos
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico'));
CREATE POLICY "actividad_adjuntos_insert_admin" ON public.actividad_interna_adjuntos
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "actividad_adjuntos_delete_admin" ON public.actividad_interna_adjuntos
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));

CREATE INDEX actividad_interna_adjuntos_actividad_idx ON public.actividad_interna_adjuntos (actividad_id);