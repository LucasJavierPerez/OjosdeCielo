/**
 * Invita a alguien al equipo de la clínica con uno o más roles.
 *
 * Vive en el servidor porque crear una cuenta requiere `service_role`, que
 * nunca puede salir del navegador. La función verifica por su cuenta que quien
 * llama sea administrador: no alcanza con que el panel oculte el botón.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const URL_PANEL = Deno.env.get('URL_PANEL') ?? 'http://localhost:5174';

const ROLES_VALIDOS = ['recepcionista', 'veterinario', 'administrador'] as const;
type RolPersonal = (typeof ROLES_VALIDOS)[number];

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
    .select('roles, activo')
    .eq('id', sesion.user.id)
    .single();

  if (!quienLlama?.roles?.includes('administrador') || !quienLlama.activo) {
    return json({ error: 'Sólo un administrador puede invitar personal' }, 403);
  }

  let cuerpo: { email?: string; roles?: string[]; nombre?: string; apellido?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const email = cuerpo.email?.trim().toLowerCase();
  // Se deduplica acá además de en la base: un cuerpo con el mismo rol repetido
  // no es un error del usuario, es ruido.
  const roles = [...new Set(cuerpo.roles ?? [])] as RolPersonal[];
  const nombre = cuerpo.nombre?.trim() ?? '';
  const apellido = cuerpo.apellido?.trim() ?? '';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Poné un email válido' }, 400);
  }
  if (roles.length === 0 || !roles.every((r) => ROLES_VALIDOS.includes(r))) {
    return json({ error: 'Elegí al menos un rol válido' }, 400);
  }
  if (!nombre || !apellido) {
    return json({ error: 'Poné nombre y apellido' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Si ya existe, se le suman los roles en vez de fallar: el caso real es una
  // persona registrada como cliente que ahora entra a trabajar en la clínica.
  const { data: existentes } = await admin
    .from('perfil')
    .select('id, roles')
    .eq('email', email)
    .limit(1);

  const existente = existentes?.[0];
  if (existente) {
    // Se SUMAN, no se reemplazan: quien ya era cliente de la clínica sigue
    // siéndolo, con sus propias mascotas en la app.
    const combinados = [...new Set([...(existente.roles ?? []), ...roles])];

    // Con el token del administrador, no con service_role: así la RPC vuelve a
    // verificar el permiso por su cuenta y todas sus reglas siguen aplicando
    // (no degradar al último admin, no sacarse el rol propio).
    const { error } = await comoUsuario.rpc('cambiar_roles', {
      p_perfil_id: existente.id,
      p_roles: combinados,
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
  // se le asignan los que corresponden. Se reemplaza y no se suma: quien nunca
  // usó la app no necesita el rol de cliente hasta que cargue una mascota.
  const { error: errorRol } = await comoUsuario.rpc('cambiar_roles', {
    p_perfil_id: invitado.user.id,
    p_roles: roles,
  });

  if (errorRol) return json({ error: errorRol.message }, 400);

  return json({ resultado: 'invitado', email });
});
