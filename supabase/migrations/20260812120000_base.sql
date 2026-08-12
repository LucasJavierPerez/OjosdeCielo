-- Base del esquema: extensiones, utilidades y auditoría.
-- Todo lo demás se apoya acá.

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "btree_gist";    -- constraint anti-sobreturno (fase 5)

-- ---------------------------------------------------------------------------
-- actualizado_en automático
-- ---------------------------------------------------------------------------

create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

comment on function public.set_actualizado_en is
  'Trigger BEFORE UPDATE. Aplicar a toda tabla con columna actualizado_en.';

-- ---------------------------------------------------------------------------
-- Auditoría
--
-- Nadie puede modificar ni borrar estas filas, incluido el rol administrador:
-- un registro de auditoría alterable no sirve como registro de auditoría.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id            bigserial primary key,
  usuario_id    uuid references auth.users(id) on delete set null,
  tabla         text not null,
  registro_id   text,
  accion        text not null check (accion in ('INSERT', 'UPDATE', 'DELETE', 'SELECT')),
  datos_antes   jsonb,
  datos_despues jsonb,
  creado_en     timestamptz not null default now()
);

create index audit_log_tabla_registro_idx on public.audit_log (tabla, registro_id);
create index audit_log_usuario_idx on public.audit_log (usuario_id, creado_en desc);
create index audit_log_creado_en_idx on public.audit_log (creado_en desc);

-- RLS habilitada sin políticas: nadie accede. La política de lectura se agrega
-- en 20260812120100, que es donde se define es_personal_clinica() — depende del
-- tipo public.rol y no puede existir todavía. Este estado intermedio es el
-- seguro: sin política, la tabla queda cerrada.
alter table public.audit_log enable row level security;

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_registro_id text;
begin
  -- to_jsonb() y no un cast directo: en plpgsql un record no se puede castear
  -- a jsonb (SQLSTATE 42846).
  v_registro_id := case
    when tg_op = 'DELETE' then to_jsonb(old) ->> 'id'
    else to_jsonb(new) ->> 'id'
  end;

  insert into public.audit_log (usuario_id, tabla, registro_id, accion, datos_antes, datos_despues)
  values (
    auth.uid(),
    tg_table_name,
    v_registro_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.registrar_auditoria is
  'Trigger AFTER INSERT/UPDATE/DELETE. Aplicar a tablas sensibles: historia clínica, caja, stock, perfiles.';
