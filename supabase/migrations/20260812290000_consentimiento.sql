-- Consentimiento informado en el registro (Ley 25.326, art. 6).
--
-- La obligación no es tener un texto: es poder demostrar que la persona lo
-- aceptó, cuándo, y qué versión aceptó. Si mañana la política cambia, saber
-- que alguien aceptó "la política" no sirve de nada.
--
-- Por eso se guarda la versión. Las versiones viejas no se borran ni se
-- editan: son la prueba de qué decía el texto el día que lo aceptaron.

create table public.politica_privacidad (
  version    text primary key,
  contenido  text not null,
  vigente    boolean not null default false,
  publicada_en timestamptz not null default now()
);

-- Una sola vigente por vez. Publicar una nueva apaga la anterior.
create unique index politica_una_vigente on public.politica_privacidad (vigente)
  where vigente;

comment on table public.politica_privacidad is
  'Append-only en la práctica: una versión publicada no se edita, se publica '
  'otra. El texto viejo es la prueba de qué aceptó cada persona.';

alter table public.politica_privacidad enable row level security;
grant select on public.politica_privacidad to anon, authenticated;

-- Pública a propósito: hay que poder leerla antes de tener cuenta.
create policy "la política es pública"
  on public.politica_privacidad for select
  to anon, authenticated
  using (true);

create table public.consentimiento (
  id        bigserial primary key,
  perfil_id uuid not null references public.perfil(id) on delete cascade,
  version   text not null references public.politica_privacidad(version),
  aceptado_en timestamptz not null default now(),
  -- No se guarda la IP: para probar el consentimiento alcanza con quién, qué
  -- versión y cuándo. Guardar de más es lo contrario de lo que pide la ley.
  constraint consentimiento_unico unique (perfil_id, version)
);

create index consentimiento_perfil_idx on public.consentimiento (perfil_id, aceptado_en desc);

alter table public.consentimiento enable row level security;
grant select on public.consentimiento to authenticated;

create policy "cada uno ve lo que aceptó"
  on public.consentimiento for select
  to authenticated
  using (perfil_id = auth.uid() or public.es_personal_clinica());

-- Un consentimiento no se retira borrando la fila: eso destruiría la prueba
-- de que en su momento se dio. Si la persona revoca, se ejerce el derecho de
-- supresión sobre la cuenta entera, que es otra cosa.
create or replace function public.consentimiento_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Un consentimiento registrado no se modifica ni se borra.'
    using errcode = '42501';
end;
$$;

create trigger consentimiento_sin_update
  before update on public.consentimiento
  for each row execute function public.consentimiento_inmutable();

create trigger consentimiento_sin_delete
  before delete on public.consentimiento
  for each row execute function public.consentimiento_inmutable();

/*
 * Registra la aceptación de la versión vigente.
 *
 * La versión la decide el servidor y no el navegador: si la mandara el
 * cliente, se podría dejar constancia de haber aceptado una versión que
 * nunca se le mostró.
 */
create or replace function public.aceptar_politica()
returns public.consentimiento
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version text;
  v_fila    public.consentimiento;
begin
  select version into v_version from public.politica_privacidad where vigente;

  if v_version is null then
    raise exception 'No hay una política de privacidad publicada.' using errcode = 'P0002';
  end if;

  insert into public.consentimiento (perfil_id, version)
  values (auth.uid(), v_version)
  on conflict (perfil_id, version) do nothing
  returning * into v_fila;

  -- Ya la había aceptado: se devuelve la original, no una nueva.
  if v_fila.id is null then
    select * into v_fila from public.consentimiento
     where perfil_id = auth.uid() and version = v_version;
  end if;

  return v_fila;
end;
$$;

revoke execute on function public.aceptar_politica from public, anon;
grant execute on function public.aceptar_politica to authenticated;

/*
 * ¿Le falta aceptar algo?
 *
 * Devuelve la versión vigente si el usuario no la aceptó, o null si está al
 * día. La app la usa para mostrar el cartel cuando se publica una versión
 * nueva, sin obligar a cerrar sesión.
 */
create or replace function public.politica_pendiente()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p.version is null then null
    when exists (
      select 1 from public.consentimiento c
       where c.perfil_id = auth.uid() and c.version = p.version
    ) then null
    else jsonb_build_object('version', p.version, 'contenido', p.contenido,
                            'publicada_en', p.publicada_en)
  end
    from public.politica_privacidad p
   where p.vigente;
$$;

revoke execute on function public.politica_pendiente from public, anon;
grant execute on function public.politica_pendiente to authenticated;

/*
 * Publicar una versión nueva. Sólo el administrador.
 *
 * No se edita la vigente: se publica otra y la anterior queda como estaba.
 */
create or replace function public.publicar_politica(p_version text, p_contenido text)
returns public.politica_privacidad
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila public.politica_privacidad;
begin
  if not public.es_administrador() then
    raise exception 'Sólo el administrador publica la política.' using errcode = '42501';
  end if;

  if exists (select 1 from public.politica_privacidad where version = p_version) then
    raise exception 'Esa versión ya existe. Publicá una con otro número.'
      using errcode = '23505';
  end if;

  update public.politica_privacidad set vigente = false where vigente;

  insert into public.politica_privacidad (version, contenido, vigente)
  values (trim(p_version), p_contenido, true)
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke execute on function public.publicar_politica from public, anon;
grant execute on function public.publicar_politica to authenticated;
