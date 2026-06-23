
-- 1) Trabajos: duración + origen
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS duracion_dias int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'staff';

-- 2) Solicitudes de visita
CREATE TABLE IF NOT EXISTS public.solicitudes_visita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  planta_id uuid NOT NULL REFERENCES public.plantas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descripcion text,
  fecha_preferida date NOT NULL,
  duracion_dias_estimada int NOT NULL DEFAULT 1,
  estado text NOT NULL DEFAULT 'pendiente',
  trabajo_id uuid REFERENCES public.trabajos(id) ON DELETE SET NULL,
  respuesta_supervisor text,
  solicitado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitudes_visita TO authenticated;
GRANT ALL ON public.solicitudes_visita TO service_role;
ALTER TABLE public.solicitudes_visita ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff lee todas las solicitudes" ON public.solicitudes_visita
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'tecnico')
  );

CREATE POLICY "cliente lee sus solicitudes" ON public.solicitudes_visita
  FOR SELECT TO authenticated
  USING (cliente_id = public.current_cliente_id());

CREATE POLICY "cliente crea solicitudes propias" ON public.solicitudes_visita
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id = public.current_cliente_id()
    AND solicitado_por = auth.uid()
    AND estado = 'pendiente'
  );

CREATE POLICY "cliente edita pendientes propias" ON public.solicitudes_visita
  FOR UPDATE TO authenticated
  USING (cliente_id = public.current_cliente_id() AND estado = 'pendiente')
  WITH CHECK (cliente_id = public.current_cliente_id());

CREATE POLICY "staff gestiona solicitudes" ON public.solicitudes_visita
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE TRIGGER trg_solicitudes_visita_updated_at
  BEFORE UPDATE ON public.solicitudes_visita
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Log de notificaciones
CREATE TABLE IF NOT EXISTS public.notificaciones_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid REFERENCES public.trabajos(id) ON DELETE SET NULL,
  reporte_id uuid REFERENCES public.reportes(id) ON DELETE SET NULL,
  planta_id uuid REFERENCES public.plantas(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  destinatario text NOT NULL,
  asunto text NOT NULL,
  tipo text NOT NULL,
  estado text NOT NULL,
  error_mensaje text,
  gmail_message_id text,
  enviado_por uuid,
  enviado_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notificaciones_log TO authenticated;
GRANT ALL ON public.notificaciones_log TO service_role;
ALTER TABLE public.notificaciones_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff lee notificaciones" ON public.notificaciones_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'tecnico')
  );

CREATE POLICY "cliente lee sus notificaciones" ON public.notificaciones_log
  FOR SELECT TO authenticated
  USING (cliente_id = public.current_cliente_id());

CREATE POLICY "staff registra notificaciones" ON public.notificaciones_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'tecnico')
  );

CREATE INDEX idx_notif_log_cliente ON public.notificaciones_log(cliente_id, enviado_at DESC);
CREATE INDEX idx_notif_log_planta ON public.notificaciones_log(planta_id, enviado_at DESC);
CREATE INDEX idx_solicitudes_estado ON public.solicitudes_visita(estado, fecha_preferida);
