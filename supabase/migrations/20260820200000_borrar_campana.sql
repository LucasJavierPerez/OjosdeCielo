-- Borrar una campaña.
--
-- cancelar_campana() ya cubre "todavía no salió, no la mando" (marca
-- 'cancelada', sólo sobre 'borrador'). Esto es otra cosa: sacarla de la
-- lista, en cualquier estado — típicamente una de prueba o una vieja que ya
-- no aporta nada. campana_envio se va con ella por el ON DELETE CASCADE que
-- ya tenía la tabla.

create or replace function public.borrar_campana(p_campana_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_administrador() then
    raise exception 'Sólo el administrador borra campañas.' using errcode = '42501';
  end if;

  delete from public.campana where id = p_campana_id;
end;
$$;

revoke execute on function public.borrar_campana from public, anon;
grant execute on function public.borrar_campana to authenticated;
