-- Datos de desarrollo. Se aplican con `pnpm db:reset`.
--
-- SÓLO PARA LOCAL. Nunca corre en staging ni en producción: crea usuarios con
-- contraseñas conocidas. La contraseña de todos es "password123".
--
-- Existe sobre todo para poder probar RLS con un usuario de cada rol: los bugs
-- de aislamiento no aparecen si hay un solo usuario de prueba.

do $$
declare
  v_admin_id       uuid := '00000000-0000-0000-0000-000000000001';
  v_vet_id         uuid := '00000000-0000-0000-0000-000000000002';
  v_recepcion_id   uuid := '00000000-0000-0000-0000-000000000003';
  v_cliente_a_id   uuid := '00000000-0000-0000-0000-000000000004';
  v_cliente_b_id   uuid := '00000000-0000-0000-0000-000000000005';
  v_cliente_c_id   uuid := '00000000-0000-0000-0000-000000000006';
begin

  -- Los usuarios se insertan directamente en auth.users porque no hay forma de
  -- llamar al endpoint de registro desde SQL. El trigger crea el perfil.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    u.id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    u.email,
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', u.nombre, 'apellido', u.apellido),
    '', '', '', ''
  from (values
    (v_admin_id,     'admin@ojosdecielo.test',     'Lucía',    'Fernández'),
    (v_vet_id,       'vet@ojosdecielo.test',       'Martín',   'Gómez'),
    (v_recepcion_id, 'recepcion@ojosdecielo.test', 'Carla',    'Ruiz'),
    (v_cliente_a_id, 'ana@ejemplo.test',           'Ana',      'Molina'),
    (v_cliente_b_id, 'bruno@ejemplo.test',         'Bruno',    'Molina'),
    (v_cliente_c_id, 'clara@ejemplo.test',         'Clara',    'Sosa')
  ) as u(id, email, nombre, apellido)
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(), u.id, u.id::text, 'email',
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    now(), now(), now()
  from auth.users u
  where u.email like '%@ojosdecielo.test' or u.email like '%@ejemplo.test'
  on conflict do nothing;

  -- El trigger creó todos los perfiles como 'cliente' (a propósito: los roles no
  -- se toma de metadata). Acá se asignan los roles de la clínica, que es lo que
  -- en producción haría un administrador.
  update public.perfil set roles = array['administrador']::public.rol[] where id = v_admin_id;
  update public.perfil set roles = array['veterinario']::public.rol[]   where id = v_vet_id;
  update public.perfil set roles = array['recepcionista']::public.rol[] where id = v_recepcion_id;

  update public.configuracion_clinica
     set direccion = 'Av. Siempreviva 742',
         localidad = 'Buenos Aires',
         telefono  = '+54 11 5555-5555',
         email     = 'contacto@ojosdecielo.test',
         horarios  = '{"lun_vie": "09:00-19:00", "sab": "09:00-13:00"}'::jsonb
   where id = 1;

end $$;

-- ---------------------------------------------------------------------------
-- Mascotas de ejemplo
--
-- Para que el panel de la clínica no arranque vacío y se puedan ver los
-- estados que importan: dato de la clínica junto a dato del tutor, una
-- vacuna vencida, otra próxima, y una mascota compartida entre dos tutores.
--
-- Se simula la sesión de cada usuario con set_config para que auth.uid()
-- devuelva algo: sin eso los triggers de origen dejarían cargado_por en null.
-- ---------------------------------------------------------------------------

do $$
declare
  v_vet       uuid := '00000000-0000-0000-0000-000000000002';
  v_ana       uuid := '00000000-0000-0000-0000-000000000004';
  v_bruno     uuid := '00000000-0000-0000-0000-000000000005';
  v_clara     uuid := '00000000-0000-0000-0000-000000000006';
  v_pulga     uuid := '11111111-0000-0000-0000-000000000001';
  v_milo      uuid := '11111111-0000-0000-0000-000000000002';
  v_rocco     uuid := '11111111-0000-0000-0000-000000000003';
begin
  -- Ficha de las mascotas.
  insert into public.mascota (id, nombre, especie, raza, sexo, fecha_nacimiento, castrado, color, microchip)
  values
    (v_pulga, 'Pulga', 'perro', 'Mestiza',           'hembra', '2022-04-18', true,  'Marrón', null),
    (v_milo,  'Milo',  'gato',  'Siamés',            'macho',  '2024-11-03', false, 'Gris',   '981098106543210'),
    (v_rocco, 'Rocco', 'perro', 'Golden Retriever',  'macho',  '2020-01-25', true,  'Dorado', null)
  on conflict (id) do nothing;

  -- Pulga la comparten Ana (titular) y Bruno. Rocco es de Clara.
  insert into public.mascota_tutor (mascota_id, perfil_id, rol)
  values
    (v_pulga, v_ana,   'titular'),
    (v_pulga, v_bruno, 'tutor'),
    (v_milo,  v_ana,   'titular'),
    (v_rocco, v_clara, 'titular')
  on conflict do nothing;

  -- Datos cargados por Ana (origen 'tutor').
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ana::text, 'roles', json_build_array('cliente'))::text, true);

  insert into public.peso_registro (mascota_id, fecha, peso_kg) values
    (v_pulga, current_date - 120, 11.400),
    (v_pulga, current_date -  75, 12.200),
    (v_pulga, current_date -  30, 12.900);

  insert into public.aplicacion (mascota_id, tipo, producto, fecha, proxima_fecha) values
    (v_pulga, 'vacuna', 'Antirrábica', current_date - 400, current_date - 35),
    (v_pulga, 'desparasitacion_interna', 'Drontal', current_date - 80, current_date + 10),
    (v_pulga, 'vacuna', 'Quíntuple', current_date - 60, current_date + 305),
    (v_milo,  'vacuna', 'Triple felina', current_date - 200, current_date + 165);

  insert into public.antecedente (mascota_id, tipo, descripcion) values
    (v_pulga, 'alergia', 'Reacción al pollo');

  insert into public.medicacion_en_curso (mascota_id, descripcion, dosis, frecuencia_horas, desde, hasta, recordar) values
    (v_pulga, 'Meloxicam', '0.5 mg', 24, current_date - 6, current_date + 4, true);

  -- Un peso medido en la clínica, para ver los dos orígenes conviviendo.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vet::text, 'roles', json_build_array('veterinario'))::text, true);

  insert into public.peso_registro (mascota_id, fecha, peso_kg, nota) values
    (v_pulga, current_date - 2, 13.100, 'Balanza de consultorio');

  -- Datos de Clara, el control de aislamiento.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_clara::text, 'roles', json_build_array('cliente'))::text, true);

  insert into public.peso_registro (mascota_id, fecha, peso_kg) values
    (v_rocco, current_date - 10, 31.200);

  perform set_config('request.jwt.claims', '', true);
end $$;

-- Ana y Bruno comparten a Pulga (fase 1); Clara es el tercero sin relación,
-- que sirve para comprobar que NO ve nada de ellos.


-- ---------------------------------------------------------------------------
-- Agenda de ejemplo (fase 5)
-- ---------------------------------------------------------------------------

do $$
declare
  v_vet   uuid := '00000000-0000-0000-0000-000000000002';
  v_prof  uuid;
  v_gral  uuid;
  v_vacu  uuid;
begin
  insert into public.especialidad (nombre, duracion_min) values
    ('Consulta general', 30),
    ('Vacunación', 15),
    ('Cirugía', 90)
  on conflict (nombre) do nothing;

  select id into v_gral from public.especialidad where nombre = 'Consulta general';
  select id into v_vacu from public.especialidad where nombre = 'Vacunación';

  insert into public.profesional (perfil_id, matricula)
  values (v_vet, 'MP 12345')
  on conflict (perfil_id) do nothing;

  select id into v_prof from public.profesional where perfil_id = v_vet;

  -- Lunes a viernes, mañana y tarde.
  insert into public.disponibilidad (profesional_id, dia_semana, hora_inicio, hora_fin)
  select v_prof, d, h.inicio, h.fin
    from generate_series(1, 5) as d,
         (values ('09:00'::time, '13:00'::time), ('16:00'::time, '20:00'::time)) as h(inicio, fin)
  on conflict do nothing;

  -- Sábado sólo por la mañana.
  insert into public.disponibilidad (profesional_id, dia_semana, hora_inicio, hora_fin)
  values (v_prof, 6, '09:00', '13:00')
  on conflict do nothing;
end $$;
