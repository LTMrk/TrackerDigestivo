-- Todos los registros tienen ya dueño, así que la columna pasa a obligatoria
-- y se rellena sola con quien esté autenticado.
ALTER TABLE public.tracker_digestivo
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.tracker_digestivo ENABLE ROW LEVEL SECURITY;

-- Cada cual ve y toca únicamente lo suyo. Sin sesión, auth.uid() es NULL y
-- ninguna fila cumple la condición: la anon key deja de servir para nada.
CREATE POLICY "propios_select" ON public.tracker_digestivo
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY "propios_insert" ON public.tracker_digestivo
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "propios_update" ON public.tracker_digestivo
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "propios_delete" ON public.tracker_digestivo
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
