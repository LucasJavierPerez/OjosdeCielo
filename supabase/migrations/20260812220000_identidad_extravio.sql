-- QR de identidad y extravío (fase 4).
--
-- Un código pegado a la chapita que lleva a una página pública. Quien encuentra
-- a la mascota la escanea y puede avisar al tutor.
--
-- Toda la fase gira alrededor de una tensión: la página tiene que ser útil para
-- un desconocido y a la vez no filtrar datos del tutor.

create table public.mascota_token_qr (
  id          uuid primary key default gen_random_uuid(),
  mascota_id  uuid not null references public.mascota(id) on delete cascade,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  activo      boolean not null default true,
  revocado_en timestamptz,
  creado_en   timestamptz not null default now()
);

create index mascota_token_qr_mascota_idx on public.mascota_token_qr (mascota_id)
  where activo;

-- Un solo token activo por mascota: si se regenera, el anterior deja de servir.
create unique index mascota_token_qr_uno_activo
  on public.mascota_token_qr (mascota_id) where activo;

comment on column public.mascota_token_qr.token is
  'Aleatorio de 32 caracteres. Nunca un id secuencial: permitiría enumerar el padrón de mascotas.';

alter table public.mascota_token_qr enable row level security;
grant select on public.mascota_token_qr to authenticated;

-- El token lo ven sólo los tutores: es lo que imprimen en la chapita.
create policy "tutores ven el token de su mascota"
  on public.mascota_token_qr for select
  to authenticated
  using (public.es_tutor_de(mascota_id));

create policy "personal ve los tokens"
  on public.mascota_token_qr for select
  to authenticated
  using (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Estado de extravío
-- ---------------------------------------------------------------------------

alter table public.mascota
  add column perdida_desde timestamptz,
  add column nota_extravio text;

comment on column public.mascota.perdida_desde is
  'Cuando está marcada, la página pública del QR muestra el contacto del tutor. Si no, no lo expone.';

-- ---------------------------------------------------------------------------
-- Generar o regenerar el código
-- ---------------------------------------------------------------------------

create or replace function public.generar_qr(p_mascota_id uuid)
returns public.mascota_token_qr
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.mascota_token_qr;
begin
  if not public.es_tutor_de(p_mascota_id) then
    raise exception 'Sin acceso a esta mascota' using errcode = '42501';
  end if;

  -- Regenerar invalida el anterior: si la chapita se perdió con la mascota,
  -- el tutor necesita poder cortar el acceso al código viejo.
  update public.mascota_token_qr
     set activo = false, revocado_en = now()
   where mascota_id = p_mascota_id and activo;

  insert into public.mascota_token_qr (mascota_id)
  values (p_mascota_id)
  returning * into v_token;

  return v_token;
end;
$$;

revoke execute on function public.generar_qr from public, anon;
grant execute on function public.generar_qr to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar como perdida o encontrada
-- ---------------------------------------------------------------------------

create or replace function public.marcar_perdida(p_mascota_id uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_tutor_de(p_mascota_id) then
    raise exception 'Sin acceso a esta mascota' using errcode = '42501';
  end if;

  update public.mascota
     set perdida_desde = coalesce(perdida_desde, now()),
         nota_extravio = p_nota
   where id = p_mascota_id;

  -- Si no tenía QR, se genera uno: es justo el momento en que hace falta.
  if not exists (
    select 1 from public.mascota_token_qr where mascota_id = p_mascota_id and activo
  ) then
    insert into public.mascota_token_qr (mascota_id) values (p_mascota_id);
  end if;
end;
$$;

create or replace function public.marcar_encontrada(p_mascota_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_tutor_de(p_mascota_id) then
    raise exception 'Sin acceso a esta mascota' using errcode = '42501';
  end if;

  update public.mascota
     set perdida_desde = null, nota_extravio = null
   where id = p_mascota_id;
end;
$$;

revoke execute on function public.marcar_perdida    from public, anon;
revoke execute on function public.marcar_encontrada from public, anon;
grant execute on function public.marcar_perdida    to authenticated;
grant execute on function public.marcar_encontrada to authenticated;

-- ---------------------------------------------------------------------------
-- Página pública del QR
--
-- Accesible SIN sesión: quien encuentra la mascota es un desconocido.
--
-- Devuelve deliberadamente poco: nombre, foto, especie y raza. Nada de
-- historia clínica, dirección ni apellido del tutor.
--
-- El contacto sólo aparece si la mascota está marcada como perdida. Un QR se
-- puede escanear por curiosidad, y no hay motivo para regalar un teléfono
-- cuando el animal está en su casa.
-- ---------------------------------------------------------------------------

create or replace function public.mascota_por_qr(p_token text)
returns table (
  nombre           text,
  especie          public.especie,
  raza             text,
  foto_url         text,
  perdida          boolean,
  perdida_desde    timestamptz,
  nota_extravio    text,
  contacto_nombre  text,
  contacto_telefono text,
  clinica_nombre   text,
  clinica_telefono text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.nombre,
         m.especie,
         m.raza,
         m.foto_url,
         m.perdida_desde is not null,
         m.perdida_desde,
         case when m.perdida_desde is not null then m.nota_extravio end,
         -- Sólo el nombre de pila, y sólo si está perdida.
         case when m.perdida_desde is not null then t.nombre end,
         case when m.perdida_desde is not null then t.telefono end,
         -- La clínica siempre: es un contacto institucional, no personal, y
         -- da a dónde llevar al animal aunque el tutor no atienda.
         c.nombre,
         c.telefono
    from public.mascota_token_qr q
    join public.mascota m on m.id = q.mascota_id
    cross join public.configuracion_clinica c
    left join lateral (
      select p.nombre, p.telefono
        from public.mascota_tutor mt
        join public.perfil p on p.id = mt.perfil_id
       where mt.mascota_id = m.id and mt.revocado_en is null
       order by case when mt.rol = 'titular' then 0 else 1 end
       limit 1
    ) t on true
   where q.token = p_token
     and q.activo
     and m.archivado_en is null;
$$;

-- anon incluido a propósito: es el único punto del sistema pensado para
-- alguien sin cuenta.
grant execute on function public.mascota_por_qr to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aviso de que alguien la encontró
--
-- Quien la encuentra deja un mensaje sin registrarse. Se guarda y se avisa a
-- todos los tutores.
-- ---------------------------------------------------------------------------

create table public.aviso_hallazgo (
  id          uuid primary key default gen_random_uuid(),
  mascota_id  uuid not null references public.mascota(id) on delete cascade,
  mensaje     text not null check (length(trim(mensaje)) between 1 and 500),
  contacto    text check (contacto is null or length(contacto) <= 120),
  creado_en   timestamptz not null default now()
);

create index aviso_hallazgo_mascota_idx on public.aviso_hallazgo (mascota_id, creado_en desc);

alter table public.aviso_hallazgo enable row level security;
grant select on public.aviso_hallazgo to authenticated;

create policy "tutores ven los avisos de su mascota"
  on public.aviso_hallazgo for select
  to authenticated
  using (public.es_tutor_de(mascota_id) or public.es_personal_clinica());

/*
 * Registra el aviso y programa la notificación a los tutores.
 *
 * Va por RPC y no por INSERT directo para que el anónimo nunca escriba en una
 * tabla: sólo puede llamar a esta función, que valida y acota lo que entra.
 */
create or replace function public.avisar_hallazgo(
  p_token    text,
  p_mensaje  text,
  p_contacto text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota_id uuid;
  v_nombre     text;
begin
  select m.id, m.nombre into v_mascota_id, v_nombre
    from public.mascota_token_qr q
    join public.mascota m on m.id = q.mascota_id
   where q.token = p_token and q.activo and m.archivado_en is null;

  if v_mascota_id is null then
    raise exception 'El código no es válido' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_mensaje, ''))) = 0 then
    raise exception 'Escribí un mensaje' using errcode = '22023';
  end if;

  insert into public.aviso_hallazgo (mascota_id, mensaje, contacto)
  values (v_mascota_id, left(trim(p_mensaje), 500), left(nullif(trim(coalesce(p_contacto, '')), ''), 120));

  -- Se programa para hoy y el job de recordatorios lo despacha. Reusa toda la
  -- infraestructura de push de la fase 3.
  insert into public.recordatorio (
    mascota_id, tipo, programado_para, origen_tabla, origen_id, titulo, cuerpo
  )
  values (
    v_mascota_id,
    'hallazgo',
    current_date,
    'aviso_hallazgo',
    gen_random_uuid(),
    '¡Vieron a ' || v_nombre || '!',
    left(trim(p_mensaje), 120)
  );
end;
$$;

grant execute on function public.avisar_hallazgo to anon, authenticated;
