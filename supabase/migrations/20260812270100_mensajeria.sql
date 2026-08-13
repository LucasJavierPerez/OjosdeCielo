-- Mensajería clínica ↔ tutor (fase 8).
--
-- Para lo que hoy se resuelve por WhatsApp desde el celular personal de la
-- recepcionista: "¿le puedo dar la pastilla con comida?", "¿a qué hora abren?".
-- Traerlo acá tiene dos ventajas concretas: queda asociado al paciente y no se
-- va con el empleado que se va.
--
-- Lo que NO es: un canal de consulta clínica. Un diagnóstico por mensaje sin
-- ver al animal es mala medicina y expone al profesional. La interfaz lo dice
-- explícitamente y el modelo no tiene nada que lo aliente: no hay adjuntos ni
-- indicación de tratamiento, para eso está la consulta.

create table public.conversacion (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.perfil(id) on delete cascade,
  mascota_id        uuid references public.mascota(id) on delete set null,
  asunto            text not null check (length(trim(asunto)) between 1 and 120),
  ultimo_mensaje_en timestamptz not null default now(),
  cerrada_en        timestamptz,
  creada_en         timestamptz not null default now()
);

create index conversacion_cliente_idx
  on public.conversacion (cliente_id, ultimo_mensaje_en desc);
create index conversacion_abiertas_idx
  on public.conversacion (ultimo_mensaje_en desc) where cerrada_en is null;

comment on column public.conversacion.mascota_id is
  'Opcional y ON DELETE SET NULL: la conversación sobrevive a la mascota. '
  'Borrarla junto con el paciente perdería el contexto de por qué se habló.';

create table public.mensaje (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversacion(id) on delete cascade,
  autor_id        uuid not null default auth.uid() references public.perfil(id),
  de_la_clinica   boolean not null,
  cuerpo          text not null check (length(trim(cuerpo)) between 1 and 2000),
  leido_en        timestamptz,
  creado_en       timestamptz not null default now()
);

create index mensaje_conversacion_idx on public.mensaje (conversacion_id, creado_en);

comment on column public.mensaje.de_la_clinica is
  'Lo escribe un trigger a partir del rol del autor, no el cliente: de esto '
  'depende de qué lado de la pantalla se dibuja el globo y quién lo firma.';

comment on column public.mensaje.leido_en is
  'Leído por el otro lado. Un mensaje no se marca leído por quien lo escribió.';

-- ---------------------------------------------------------------------------
-- Un mensaje enviado no se edita ni se borra
--
-- Misma razón que la historia clínica: si la clínica dijo algo, dijo algo.
-- Lo único que cambia es la marca de leído.
-- ---------------------------------------------------------------------------

create or replace function public.mensaje_solo_cambia_lectura()
returns trigger
language plpgsql
as $$
begin
  if row(new.conversacion_id, new.autor_id, new.de_la_clinica, new.cuerpo, new.creado_en)
     is distinct from
     row(old.conversacion_id, old.autor_id, old.de_la_clinica, old.cuerpo, old.creado_en) then
    raise exception 'Un mensaje enviado no se edita.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.mensaje_no_se_borra()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Un mensaje enviado no se borra.' using errcode = '42501';
end;
$$;

-- Sella el origen del mensaje y adelanta el reloj de la conversación, para no
-- depender de que el cliente actualice dos cosas en el orden correcto.
create or replace function public.mensaje_sellar_origen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.autor_id := auth.uid();
  new.de_la_clinica := public.es_personal_clinica();
  new.leido_en := null;

  update public.conversacion
     set ultimo_mensaje_en = now()
   where id = new.conversacion_id;

  return new;
end;
$$;

create trigger mensaje_origen
  before insert on public.mensaje
  for each row execute function public.mensaje_sellar_origen();

create trigger mensaje_sin_editar
  before update on public.mensaje
  for each row execute function public.mensaje_solo_cambia_lectura();

create trigger mensaje_sin_borrar
  before delete on public.mensaje
  for each row execute function public.mensaje_no_se_borra();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.conversacion enable row level security;
alter table public.mensaje enable row level security;

grant select, insert on public.conversacion to authenticated;
grant update on public.conversacion to authenticated;
grant select, insert, update on public.mensaje to authenticated;

create policy "cada uno ve sus conversaciones"
  on public.conversacion for select
  to authenticated
  using (cliente_id = auth.uid() or public.es_personal_clinica());

-- El cliente abre la conversación a su nombre; el personal la abre a nombre de
-- un cliente (por ejemplo para avisarle algo de su mascota).
create policy "el cliente abre su conversación"
  on public.conversacion for insert
  to authenticated
  with check (cliente_id = auth.uid() or public.es_personal_clinica());

-- Cerrar y reabrir: los dos lados. Cerrar no borra nada, sólo la saca de la
-- bandeja de pendientes.
create policy "los dos lados cierran la conversación"
  on public.conversacion for update
  to authenticated
  using (cliente_id = auth.uid() or public.es_personal_clinica())
  with check (cliente_id = auth.uid() or public.es_personal_clinica());

create policy "los mensajes siguen a la conversación"
  on public.mensaje for select
  to authenticated
  using (
    exists (
      select 1 from public.conversacion c
       where c.id = conversacion_id
         and (c.cliente_id = auth.uid() or public.es_personal_clinica())
    )
  );

create policy "se escribe en la propia conversación, si está abierta"
  on public.mensaje for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversacion c
       where c.id = conversacion_id
         and c.cerrada_en is null
         and (c.cliente_id = auth.uid() or public.es_personal_clinica())
    )
  );

-- El UPDATE existe sólo para marcar leído, y el trigger no deja hacer otra
-- cosa. Nadie marca leído lo que escribió: la política lo impide del lado de
-- las filas y así el contador de "sin leer" no se puede falsear solo.
create policy "se marca leído lo que escribió el otro"
  on public.mensaje for update
  to authenticated
  using (
    autor_id <> auth.uid()
    and exists (
      select 1 from public.conversacion c
       where c.id = conversacion_id
         and (c.cliente_id = auth.uid() or public.es_personal_clinica())
    )
  )
  with check (autor_id <> auth.uid());

-- ---------------------------------------------------------------------------
-- Abrir una conversación
--
-- Es un RPC y no un insert directo porque hay que crear la conversación y el
-- primer mensaje juntos: una conversación vacía en la bandeja de la clínica no
-- le sirve a nadie.
-- ---------------------------------------------------------------------------

create or replace function public.abrir_conversacion(
  p_asunto     text,
  p_mensaje    text,
  p_mascota_id uuid default null,
  p_cliente_id uuid default null
)
returns public.conversacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente uuid;
  v_conv    public.conversacion;
begin
  v_cliente := coalesce(p_cliente_id, auth.uid());

  if v_cliente <> auth.uid() and not public.es_personal_clinica() then
    raise exception 'No podés abrir una conversación a nombre de otra persona.'
      using errcode = '42501';
  end if;

  if p_mascota_id is not null
     and not public.es_tutor_de(p_mascota_id)
     and not public.es_personal_clinica() then
    raise exception 'Esa mascota no es tuya.' using errcode = '42501';
  end if;

  insert into public.conversacion (cliente_id, mascota_id, asunto)
  values (v_cliente, p_mascota_id, trim(p_asunto))
  returning * into v_conv;

  insert into public.mensaje (conversacion_id, de_la_clinica, cuerpo)
  values (v_conv.id, public.es_personal_clinica(), trim(p_mensaje));

  return v_conv;
end;
$$;

revoke execute on function public.abrir_conversacion from public, anon;
grant execute on function public.abrir_conversacion to authenticated;

-- Bandeja del panel: lo que recepción necesita para priorizar sin abrir cada
-- conversación. RLS filtra filas, no columnas: el nombre del cliente y de la
-- mascota salen de acá.
create or replace function public.bandeja_conversaciones(p_cerradas boolean default false)
returns table (
  id                uuid,
  asunto            text,
  cliente_id        uuid,
  cliente           text,
  telefono          text,
  mascota_id        uuid,
  mascota           text,
  ultimo_mensaje_en timestamptz,
  ultimo_mensaje    text,
  espera_respuesta  boolean,
  sin_leer          bigint,
  cerrada_en        timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id,
         c.asunto,
         c.cliente_id,
         p.nombre || ' ' || p.apellido,
         p.telefono,
         c.mascota_id,
         m.nombre,
         c.ultimo_mensaje_en,
         u.cuerpo,
         -- Lo que ordena el trabajo del día: el último que habló fue el tutor.
         not coalesce(u.de_la_clinica, true),
         (select count(*) from public.mensaje x
           where x.conversacion_id = c.id
             and not x.de_la_clinica
             and x.leido_en is null),
         c.cerrada_en
    from public.conversacion c
    join public.perfil p on p.id = c.cliente_id
    left join public.mascota m on m.id = c.mascota_id
    left join lateral (
      select cuerpo, de_la_clinica from public.mensaje x
       where x.conversacion_id = c.id
       order by x.creado_en desc limit 1
    ) u on true
   where public.es_personal_clinica()
     and (c.cerrada_en is null) = (not p_cerradas)
   order by c.ultimo_mensaje_en desc;
$$;

revoke execute on function public.bandeja_conversaciones from public, anon;
grant execute on function public.bandeja_conversaciones to authenticated;

-- Marca leídos los mensajes del otro lado. Va por RPC porque un UPDATE masivo
-- desde el navegador tendría que enumerar los ids uno por uno.
create or replace function public.marcar_conversacion_leida(p_conversacion_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_es_personal boolean := public.es_personal_clinica();
  v_n integer;
begin
  if not exists (
    select 1 from public.conversacion c
     where c.id = p_conversacion_id
       and (c.cliente_id = auth.uid() or v_es_personal)
  ) then
    raise exception 'No tenés acceso a esta conversación.' using errcode = '42501';
  end if;

  update public.mensaje
     set leido_en = now()
   where conversacion_id = p_conversacion_id
     and leido_en is null
     and de_la_clinica <> v_es_personal;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.marcar_conversacion_leida from public, anon;
grant execute on function public.marcar_conversacion_leida to authenticated;
