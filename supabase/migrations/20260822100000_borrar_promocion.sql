-- El grant original (fase de promociones) sólo cubrió select/insert/update.
-- La política RLS "el personal gestiona promociones" ya es FOR ALL, pero sin
-- el grant de DELETE, PostgREST rechaza el borrado antes de evaluar RLS.

grant delete on public.promocion to authenticated;
