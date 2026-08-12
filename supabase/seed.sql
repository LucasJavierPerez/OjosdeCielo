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

  -- El trigger creó todos los perfiles como 'cliente' (a propósito: el rol no
  -- se toma de metadata). Acá se asignan los roles de la clínica, que es lo que
  -- en producción haría un administrador.
  update public.perfil set rol = 'administrador'  where id = v_admin_id;
  update public.perfil set rol = 'veterinario'    where id = v_vet_id;
  update public.perfil set rol = 'recepcionista'  where id = v_recepcion_id;

  update public.configuracion_clinica
     set direccion = 'Av. Siempreviva 742',
         localidad = 'Buenos Aires',
         telefono  = '+54 11 5555-5555',
         email     = 'contacto@ojosdecielo.test',
         horarios  = '{"lun_vie": "09:00-19:00", "sab": "09:00-13:00"}'::jsonb
   where id = 1;

end $$;

-- Ana y Bruno son la pareja que comparte mascota (fase 1); Clara es el tercero
-- sin relación, que sirve para comprobar que NO ve nada de ellos.
