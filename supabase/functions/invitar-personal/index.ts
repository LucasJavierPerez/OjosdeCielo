/**
 * Invita a alguien al equipo de la clínica con un rol asignado.
 *
 * Vive en el servidor porque crear una cuenta requiere `service_role`, que
 * nunca puede salir del navegador. La función verifica por su cuenta que quien
 * llama sea administrador: no alcanza con que el panel oculte el botón.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const URL_PANEL = Deno.env.get('URL_PANEL') ?? 'http://localhost:5174';

const ROLES_VALIDOS = ['recepcionista', 'veterinario', 'administrador'] as const;
type RolPersonal = (typeof ROLES_VALIDOS)[number];

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion.startsWith('Bearer ')) {
    return json({ error: 'Falta la sesión' }, 401);
  }

  // Se resuelve quién llama con SU token, no con service_role: así el permiso
  // se verifica contra el usuario real y no contra la clave privilegiada.
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  });

  const { data: sesion } = await comoUsuario.auth.getUser();
  if (!sesion.user) return json({ error: 'Sesión inválida' }, 401);

  const { data: quienLlama } = await comoUsuario
    .from('perfil')
    .select('rol, activo')
    .eq('id', sesion.user.id)
    .single();

  if (quienLlama?.rol !== 'administrador' || !quienLlama.activo) {
    return json({ error: 'Sólo un administrador puede invitar personal' }, 403);
  }

  let cuerpo: { email?: string; rol?: string; nombre?: string; apellido?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const email = cuerpo.email?.trim().toLowerCase();
  const rol = cuerpo.rol as RolPersonal | undefined;
  const nombre = cuerpo.nombre?.trim() ?? '';
  const apellido = cuerpo.apellido?.trim() ?? '';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Poné un email válido' }, 400);
  }
  if (!rol || !ROLES_VALIDOS.includes(rol)) {
    return json({ error: 'Rol inválido' }, 400);
  }
  if (!nombre || !apellido) {
    return json({ error: 'Poné nombre y apellido' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Si ya existe, se le cambia el rol en vez de fallar: el caso real es una
  // persona registrada como cliente que ahora entra a trabajar en la clínica.
  const { data: existentes } = await admin
    .from('perfil')
    .select('id, rol')
    .eq('email', email)
    .limit(1);

  const existente = existentes?.[0];
  if (existente) {
    // Con el token del administrador, no con service_role: así la RPC vuelve a
    // verificar el permiso por su cuenta y todas sus reglas siguen aplicando
    // (no degradar al último admin, no cambiarse el rol a uno mismo).
    const { error } = await comoUsuario.rpc('cambiar_rol', {
      p_perfil_id: existente.id,
      p_rol: rol,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ resultado: 'rol_actualizado', email });
  }

  const { data: invitado, error: errorInvitacion } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: { nombre, apellido },
      redirectTo: `${URL_PANEL}/ingresar`,
    },
  );

  if (errorInvitacion || !invitado.user) {
    return json({ error: errorInvitacion?.message ?? 'No se pudo invitar' }, 400);
  }

  // El trigger de auth.users ya creó el perfil con rol 'cliente'; recién ahora
  // se le asigna el que corresponde.
  const { error: errorRol } = await comoUsuario.rpc('cambiar_rol', {
    p_perfil_id: invitado.user.id,
    p_rol: rol,
  });

  if (errorRol) return json({ error: errorRol.message }, 400);

  return json({ resultado: 'invitado', email });
});
