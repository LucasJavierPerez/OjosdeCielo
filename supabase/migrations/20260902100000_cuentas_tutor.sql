-- La clínica crea la cuenta del tutor desde el panel (email + contraseña).
--
-- El alta del usuario de auth necesita `service_role` y vive en la Edge
-- Function `crear-tutor`. Acá va sólo la parte que se puede hacer con el token
-- del personal: vincular ese perfil a un paciente como titular (o tutor si ya
-- hay titular), cerrar el contacto sin cuenta y completar teléfono/DNI.

create or replace function public.vincular_tutor_a_mascota(
  p_perfil_id  uuid,
  p_mascota_id uuid,
  p_telefono   text default null,
  p_dni        text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal vincula tutores' using errcode = '42501';
  end if;

  if not exists (select 1 from public.perfil where id = p_perfil_id) then
    raise exception 'No encontramos esa cuenta' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.mascota where id = p_mascota_id) then
    raise exception 'No encontramos ese paciente' using errcode = 'P0002';
  end if;

  -- Idempotente: si ya está vinculado, no se toca.
  if not exists (
    select 1 from public.mascota_tutor
     where mascota_id = p_mascota_id and perfil_id = p_perfil_id and revocado_en is null
  ) then
    insert into public.mascota_tutor (mascota_id, perfil_id, rol, invitado_por)
    values (
      p_mascota_id,
      p_perfil_id,
      (case
        when exists (
          select 1 from public.mascota_tutor
           where mascota_id = p_mascota_id and rol = 'titular' and revocado_en is null
        ) then 'tutor'
        else 'titular'
      end)::public.rol_tutor,
      auth.uid()
    );
  end if;

  -- Cierra el contacto sin cuenta de ese paciente que tenga el mismo email.
  select email into v_email from public.perfil where id = p_perfil_id;
  if v_email is not null then
    update public.contacto_tutor
       set vinculado_en = now(), perfil_id = p_perfil_id
     where mascota_id = p_mascota_id
       and vinculado_en is null
       and lower(email) = lower(v_email);
  end if;

  -- Completa teléfono y DNI del perfil sólo si están vacíos.
  update public.perfil
     set telefono = coalesce(nullif(trim(coalesce(telefono, '')), ''), nullif(trim(coalesce(p_telefono, '')), '')),
         dni = coalesce(nullif(trim(coalesce(dni, '')), ''), nullif(trim(coalesce(p_dni, '')), ''))
   where id = p_perfil_id;
end;
$$;

revoke execute on function public.vincular_tutor_a_mascota from public, anon;
grant execute on function public.vincular_tutor_a_mascota to authenticated;
