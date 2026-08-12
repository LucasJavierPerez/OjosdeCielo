-- Sacar una mascota de la lista sin perder su historia.
--
-- Cuatro situaciones distintas que la app tenía mezcladas en ninguna:
--
--   archivar      la mascota ya no está con el tutor (la dio en adopción, se
--                 mudó de veterinaria). Se oculta y se puede recuperar.
--   fallecida     caso aparte: la ficha se conserva y se muestra con respeto,
--                 no se esconde como un error.
--   salir         un tutor invitado se va, la mascota sigue con los demás.
--   eliminar      borrado real. Sólo si nadie más la cuida y la clínica nunca
--                 registró nada.

create or replace function public.archivar_mascota(p_mascota_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_titular_de(p_mascota_id) and not public.es_personal_clinica() then
    raise exception 'Sólo el titular puede archivar la mascota' using errcode = '42501';
  end if;

  update public.mascota set archivado_en = now()
   where id = p_mascota_id and archivado_en is null;

  -- Los avisos pendientes dejan de tener sentido.
  update public.recordatorio set estado = 'cancelado'
   where mascota_id = p_mascota_id and estado = 'pendiente';
end;
$$;

create or replace function public.desarchivar_mascota(p_mascota_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_titular_de(p_mascota_id) and not public.es_personal_clinica() then
    raise exception 'Sólo el titular puede recuperar la mascota' using errcode = '42501';
  end if;

  update public.mascota set archivado_en = null where id = p_mascota_id;
end;
$$;

create or replace function public.marcar_fallecida(p_mascota_id uuid, p_fecha date default current_date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_tutor_de(p_mascota_id) and not public.es_personal_clinica() then
    raise exception 'Sin acceso a esta mascota' using errcode = '42501';
  end if;

  if p_fecha > current_date then
    raise exception 'La fecha no puede ser futura' using errcode = '22023';
  end if;

  -- La ficha NO se archiva: sigue accesible. Perder de golpe el historial de
  -- un animal que murió sería cruel, y además la clínica lo necesita.
  update public.mascota set fallecido_en = p_fecha where id = p_mascota_id;

  update public.recordatorio set estado = 'cancelado'
   where mascota_id = p_mascota_id and estado = 'pendiente';
end;
$$;

/*
 * Un tutor se baja del cuidado de una mascota que no es suya.
 *
 * Distinto de revocar_tutor(): acá la persona se va sola, no la echan. El
 * titular no puede usarla — dejaría la mascota sin nadie que la gestione.
 */
create or replace function public.dejar_mascota(p_mascota_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.es_titular_de(p_mascota_id) then
    raise exception 'Sos el titular. Transferí la titularidad antes de salir.'
      using errcode = '22023';
  end if;

  if not public.es_tutor_de(p_mascota_id) then
    raise exception 'No sos tutor de esta mascota' using errcode = '42501';
  end if;

  update public.mascota_tutor set revocado_en = now()
   where mascota_id = p_mascota_id and perfil_id = auth.uid() and revocado_en is null;
end;
$$;

/*
 * Borrado real.
 *
 * Se niega si la clínica registró algo: la historia clínica es un documento
 * profesional y no se borra a pedido del tutor. Se niega también si hay otros
 * tutores, porque el dato no es sólo suyo. En esos casos queda archivar.
 */
create or replace function public.eliminar_mascota(p_mascota_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_otros_tutores integer;
  v_datos_clinica integer;
begin
  if not public.es_titular_de(p_mascota_id) then
    raise exception 'Sólo el titular puede eliminar la mascota' using errcode = '42501';
  end if;

  select count(*) into v_otros_tutores
    from public.mascota_tutor
   where mascota_id = p_mascota_id and revocado_en is null and perfil_id <> auth.uid();

  if v_otros_tutores > 0 then
    raise exception 'Hay otras personas que cuidan a esta mascota. Podés archivarla.'
      using errcode = '22023';
  end if;

  select (select count(*) from public.peso_registro where mascota_id = p_mascota_id and origen = 'clinica')
       + (select count(*) from public.aplicacion   where mascota_id = p_mascota_id and origen = 'clinica')
       + (select count(*) from public.antecedente  where mascota_id = p_mascota_id and origen = 'clinica')
    into v_datos_clinica;

  if v_datos_clinica > 0 then
    raise exception 'La clínica registró atención médica de esta mascota, así que su ficha no se puede borrar. Podés archivarla.'
      using errcode = '22023';
  end if;

  -- El resto de las tablas cae por ON DELETE CASCADE.
  delete from public.mascota where id = p_mascota_id;
end;
$$;

revoke execute on function public.archivar_mascota      from public, anon;
revoke execute on function public.desarchivar_mascota   from public, anon;
revoke execute on function public.marcar_fallecida      from public, anon;
revoke execute on function public.dejar_mascota         from public, anon;
revoke execute on function public.eliminar_mascota      from public, anon;

grant execute on function public.archivar_mascota    to authenticated;
grant execute on function public.desarchivar_mascota to authenticated;
grant execute on function public.marcar_fallecida    to authenticated;
grant execute on function public.dejar_mascota       to authenticated;
grant execute on function public.eliminar_mascota    to authenticated;

-- Hacía falta para el DELETE de eliminar_mascota y para que el CASCADE limpie.
grant delete on public.mascota to authenticated;

create policy "titular puede borrar su mascota"
  on public.mascota for delete
  to authenticated
  using (public.es_titular_de(id));
