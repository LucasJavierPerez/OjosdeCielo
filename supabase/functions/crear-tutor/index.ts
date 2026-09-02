/**
 * Crea la cuenta de un tutor (email + contraseña) desde el panel de la clínica.
 *
 * Vive en el servidor porque el alta del usuario de auth necesita
 * `service_role`, que nunca sale del navegador. La función verifica por su
 * cuenta que quien llama sea personal de la clínica con el token del usuario,
 * no con la clave privilegiada.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const ROLES_PERSONAL = ['recepcionista', 'veterinario', 'administrador'];

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion.startsWith('Bearer ')) return json({ error: 'Falta la sesión' }, 401);

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

  if (!quienLlama?.activo || !quienLlama.roles?.some((r: string) => ROLES_PERSONAL.includes(r))) {
    return json({ error: 'Sólo el personal de la clínica puede crear cuentas de tutores' }, 403);
  }

  let cuerpo: {
    email?: string;
    password?: string;
    nombre?: string;
    apellido?: string;
    telefono?: string;
    dni?: string;
    mascota_id?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const email = cuerpo.email?.trim().toLowerCase() ?? '';
  const password = cuerpo.password ?? '';
  const nombre = cuerpo.nombre?.trim() ?? '';
  const apellido = cuerpo.apellido?.trim() ?? '';
  const telefono = cuerpo.telefono?.trim() || null;
  const dni = cuerpo.dni?.trim() || null;
  const mascotaId = cuerpo.mascota_id?.trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: 'Poné un email válido' }, 400);
  if (password.length < 8)
    return json({ error: 'La contraseña necesita al menos 8 caracteres' }, 400);
  if (!nombre || !apellido) return json({ error: 'Poné nombre y apellido' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: existentes } = await admin.from('perfil').select('id').eq('email', email).limit(1);
  const existente = existentes?.[0];

  if (existente) {
    if (!mascotaId) return json({ error: 'Ya existe una cuenta con ese email' }, 409);
    // La cuenta ya existe: sólo se la vincula al paciente, con el token del
    // personal para que la RPC vuelva a verificar el permiso.
    const { error } = await comoUsuario.rpc('vincular_tutor_a_mascota', {
      p_perfil_id: existente.id,
      p_mascota_id: mascotaId,
      p_telefono: telefono,
      p_dni: dni,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ resultado: 'vinculado', email });
  }

  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, apellido },
  });
  if (errorAlta || !creado.user) {
    return json({ error: errorAlta?.message ?? 'No se pudo crear la cuenta' }, 400);
  }

  // El trigger de auth.users ya creó el perfil (rol 'cliente') y vinculó los
  // contactos sin cuenta que compartían este email. Si además se indicó un
  // paciente, se asegura el vínculo y se completan teléfono/DNI.
  if (mascotaId) {
    const { error } = await comoUsuario.rpc('vincular_tutor_a_mascota', {
      p_perfil_id: creado.user.id,
      p_mascota_id: mascotaId,
      p_telefono: telefono,
      p_dni: dni,
    });
    if (error) return json({ resultado: 'creado', email, aviso: error.message });
  }

  return json({ resultado: 'creado', email });
});
