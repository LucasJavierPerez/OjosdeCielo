/**
 * Despacha una campaña ya lanzada.
 *
 * La invoca el panel después de lanzar_campana(), que es quien decidió el
 * segmento y congeló a cuánta gente alcanza. Acá sólo se manda.
 *
 * Es idempotente por diseño: destinatarios_campana() excluye a quien ya tiene
 * fila en campana_envio, así que volver a invocarla retoma donde quedó en vez
 * de mandar todo de nuevo. Importa porque un push duplicado a cientos de
 * personas no se puede deshacer.
 *
 * Verifica que quien la llama sea administrador usando SU token, no el
 * service_role: si autenticara con la clave de servicio, cualquiera con la URL
 * dispararía un envío masivo.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contacto@ojosdecielo.test';

/** Tope por invocación: si el segmento es más grande, se vuelve a llamar. */
const POR_TANDA = 400;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion) return json({ error: 'Falta la sesión' }, 401);

  // Cliente con el token de quien llama: hereda su rol y su RLS.
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  });

  const { data: perfil } = await comoUsuario.rpc('rol_actual');
  if (perfil !== 'administrador') {
    return json({ error: 'Sólo el administrador envía campañas' }, 403);
  }

  const { campana_id } = (await req.json().catch(() => ({}))) as { campana_id?: string };
  if (!campana_id) return json({ error: 'Falta campana_id' }, 400);

  // Recién acá el service_role: leer las suscripciones push de todos los
  // usuarios es justo lo que RLS impide, y por eso esto corre en el servidor.
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: campana, error: errCampana } = await supabase
    .from('campana')
    .select('id, titulo, cuerpo, url, estado')
    .eq('id', campana_id)
    .single();

  if (errCampana || !campana) return json({ error: 'No encontramos la campaña' }, 404);
  if (campana.estado !== 'enviando') {
    return json({ error: `La campaña está ${campana.estado}` }, 409);
  }

  const { data: destinos, error: errDestinos } = await supabase.rpc('destinatarios_campana', {
    p_campana_id: campana_id,
  });

  if (errDestinos) return json({ error: errDestinos.message }, 500);

  const tanda = (destinos ?? []).slice(0, POR_TANDA);
  const payload = JSON.stringify({
    titulo: campana.titulo,
    cuerpo: campana.cuerpo,
    url: campana.url ?? '/',
    tipo: 'campana',
  });

  let enviados = 0;
  let fallidos = 0;

  for (const destino of tanda) {
    let salioBien = false;

    try {
      await webpush.sendNotification(
        {
          endpoint: destino.endpoint,
          keys: { p256dh: destino.p256dh, auth: destino.auth_key },
        },
        payload,
      );

      enviados++;
      salioBien = true;

      // Una fila por persona, no por dispositivo: la constraint única rechaza
      // el segundo teléfono de la misma persona, que es lo que se busca. El
      // push sí le llega a todos sus dispositivos.
      await supabase.from('campana_envio').insert({
        campana_id,
        perfil_id: destino.perfil_id,
        estado: 'enviado',
      });
      await supabase
        .from('push_subscription')
        .update({ ultima_vez_ok: new Date().toISOString(), fallos_consecutivos: 0 })
        .eq('id', destino.sub_id);
    } catch (e) {
      fallidos++;
      const estado = (e as { statusCode?: number }).statusCode;
      const mensaje = e instanceof Error ? e.message : String(e);

      if (estado === 404 || estado === 410) {
        await supabase.from('push_subscription').delete().eq('id', destino.sub_id);
      }

      // La fila se inserta igual: es lo que evita reintentar eternamente con
      // un endpoint roto cuando se vuelve a invocar la función.
      await supabase.from('campana_envio').insert({
        campana_id,
        perfil_id: destino.perfil_id,
        estado: 'fallido',
        error: mensaje.slice(0, 500),
      });
    }

    await supabase.from('notificacion_log').insert({
      perfil_id: destino.perfil_id,
      tipo: 'campana',
      titulo: campana.titulo,
      resultado: salioBien ? 'ok' : 'error',
    });
  }

  const quedan = (destinos?.length ?? 0) - tanda.length;
  if (quedan <= 0) {
    await supabase.rpc('cerrar_campana', { p_campana_id: campana_id });
  }

  return json({ enviados, fallidos, quedan });
});
