-- El logo de la clínica llega a las pantallas que lo muestran.
--
-- `configuracion_clinica.logo_url` existía desde la fase 0 y no lo leía nadie:
-- las apps mostraban el archivo del paquete y punto. Con eso, cambiar el logo
-- exigía recompilar, que es justo lo que la regla 6 quiere evitar.
--
-- Ahora las tres pantallas donde la marca importa —la página pública del QR,
-- la verificación de recetas y la receta impresa— reciben la URL. Si está
-- vacía, la app usa el archivo que viene en el paquete: una instalación recién
-- puesta se ve bien sin configurar nada.

-- Cambia la forma de salida: no alcanza con `create or replace`.
drop function if exists public.mascota_por_qr(text);

create function public.mascota_por_qr(p_token text)
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
  clinica_telefono text,
  clinica_logo     text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existe  boolean;
  v_cortar  boolean;
begin
  select exists (
    select 1 from public.mascota_token_qr q
      join public.mascota m on m.id = q.mascota_id
     where q.token = p_token and q.activo and m.archivado_en is null
  ) into v_existe;

  v_cortar := public.registrar_intento_publico('qr', v_existe);

  -- Se corta después de registrar, para que el intento quede contado igual.
  if v_cortar then
    raise exception 'Demasiados intentos. Probá de nuevo en un rato.'
      using errcode = '53400';
  end if;

  if not v_existe then
    return;
  end if;

  return query
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
         c.telefono,
         c.logo_url
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
end;
$$;

grant execute on function public.mascota_por_qr to anon, authenticated;

create or replace function public.verificar_receta(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  select jsonb_build_object(
    'codigo',         r.codigo,
    'estado',         r.estado,
    'vencida',        r.vence_el < current_date,
    'emitida_en',     r.emitida_en,
    'vence_el',       r.vence_el,
    'diagnostico',    r.diagnostico,
    'indicaciones',   r.indicaciones,
    'motivo_anulacion', r.motivo_anulacion,
    'mascota',        m.nombre,
    'especie',        m.especie,
    'profesional',    p.nombre || ' ' || p.apellido,
    'matricula',      pr.matricula,
    'clinica',        c.nombre,
    'clinica_telefono', c.telefono,
    'clinica_logo',   c.logo_url,
    'items', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'descripcion', i.descripcion,
                  'cantidad',    i.cantidad,
                  'dosis',       i.dosis,
                  'duracion',    i.duracion
                ) order by i.orden)
         from public.receta_item i where i.receta_id = r.id),
      '[]'::jsonb)
  )
    into v_resultado
    from public.receta r
    join public.mascota m on m.id = r.mascota_id
    join public.perfil p on p.id = r.profesional_id
    left join public.profesional pr on pr.perfil_id = p.id
    cross join public.configuracion_clinica c
   where upper(trim(r.codigo)) = upper(trim(p_codigo));

  if public.registrar_intento_publico('receta', v_resultado is not null) then
    raise exception 'Demasiados intentos. Probá de nuevo en un rato.'
      using errcode = '53400';
  end if;

  return v_resultado;
end;
$$;

grant execute on function public.verificar_receta to anon, authenticated;

create or replace function public.receta_para_imprimir(p_receta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota uuid;
begin
  select mascota_id into v_mascota from public.receta where id = p_receta_id;

  if v_mascota is null then
    raise exception 'No encontramos esa receta.' using errcode = 'P0002';
  end if;

  if not public.es_tutor_de(v_mascota) and not public.es_personal_clinica() then
    raise exception 'No tenés acceso a esta receta.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'id',             r.id,
      'codigo',         r.codigo,
      'estado',         r.estado,
      'vencida',        r.vence_el < current_date,
      'emitida_en',     r.emitida_en,
      'vence_el',       r.vence_el,
      'diagnostico',    r.diagnostico,
      'indicaciones',   r.indicaciones,
      'mascota',        m.nombre,
      'especie',        m.especie,
      'raza',           m.raza,
      'sexo',           m.sexo,
      'fecha_nacimiento', m.fecha_nacimiento,
      'profesional',    p.nombre || ' ' || p.apellido,
      'matricula',      pr.matricula,
      'clinica',        jsonb_build_object(
        'nombre',    c.nombre,
        'direccion', c.direccion,
        'localidad', c.localidad,
        'telefono',  c.telefono,
        'email',     c.email,
        'logo_url',  c.logo_url
      ),
      'items', coalesce(
        (select jsonb_agg(
                  jsonb_build_object(
                    'descripcion', i.descripcion,
                    'cantidad',    i.cantidad,
                    'dosis',       i.dosis,
                    'duracion',    i.duracion,
                    'cronico',     i.cronico
                  ) order by i.orden)
           from public.receta_item i where i.receta_id = r.id),
        '[]'::jsonb)
    )
      from public.receta r
      join public.mascota m on m.id = r.mascota_id
      join public.perfil p on p.id = r.profesional_id
      left join public.profesional pr on pr.perfil_id = p.id
      cross join public.configuracion_clinica c
     where r.id = p_receta_id
  );
end;
$$;

revoke execute on function public.receta_para_imprimir from public, anon;
grant execute on function public.receta_para_imprimir to authenticated;
