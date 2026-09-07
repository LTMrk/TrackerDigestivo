-- Columna de propiedad. De momento nullable y sin RLS: la app sigue funcionando
-- igual mientras no exista todavía la cuenta a la que asignar los registros.
ALTER TABLE public.tracker_digestivo
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tracker_digestivo_user_id_idx
  ON public.tracker_digestivo (user_id);
