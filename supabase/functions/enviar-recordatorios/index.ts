/**
 * Envía los recordatorios que vencen hoy.
 *
 * La dispara pg_cron una vez por día. Los recordatorios ya están materializados
 * en la tabla `recordatorio` por generar_recordatorios(): esta función sólo se
 * ocupa del despacho.
 *
 * Un recordatorio de una mascota compartida va a TODOS sus tutores activos,
 * respetando la preferencia de cada uno por separado.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contacto@ojosdecielo.test';
const SECRETO_CRON = Deno.env.get('SECRETO_CRON') ?? '';

/** Tras este número de fallos seguidos, el endpoint se considera muerto. */
const MAX_FALLOS = 5;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// service_role: la función necesita leer suscripciones de todos los usuarios,
// algo que RLS impide a propósito. Por eso corre en el servidor y nunca en el
// navegador.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  // Sin esto cualquiera podría disparar el envío masivo desde afuera.
  if (SECRETO_CRON && req.headers.get('x-secreto-cron') !== SECRETO_CRON) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const hoy = new Date().toISOString().slice(0, 10);

  const { data: pendientes, error } = await supabase
    .from('recordatorio')
    .select('id, tipo, titulo, cuerpo, mascota_id')
    .eq('estado', 'pendiente')
    .lte('programado_para', hoy)
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let enviados = 0;
  let fallidos = 0;

  for (const recordatorio of pendientes ?? []) {
    const { data: destinos } = await supabase.rpc('destinatarios_recordatorio', {
      p_recordatorio_id: recordatorio.id,
    });

    if (!destinos || destinos.length === 0) {
      // Nadie con push habilitado: se marca enviado igual para no reintentar
      // todos los días un aviso que no tiene a dónde ir.
      await supabase
        .from('recordatorio')
        .update({ estado: 'enviado', enviado_en: new Date().toISOString() })
        .eq('id', recordatorio.id);
      continue;
    }

    let algunoOk = false;

    for (const destino of destinos) {
      const payload = JSON.stringify({
        titulo: recordatorio.titulo,
        cuerpo: recordatorio.cuerpo,
        url: `/mascotas/${recordatorio.mascota_id}/salud`,
        tipo: recordatorio.tipo,
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: destino.endpoint,
            keys: { p256dh: destino.p256dh, auth: destino.auth },
          },
          payload,
        );

        algunoOk = true;
        enviados++;

        await supabase
          .from('push_subscription')
          .update({ ultima_vez_ok: new Date().toISOString(), fallos_consecutivos: 0 })
          .eq('id', destino.sub_id);

        await supabase.from('notificacion_log').insert({
          perfil_id: destino.perfil_id,
          tipo: recordatorio.tipo,
          titulo: recordatorio.titulo,
          resultado: 'ok',
        });
      } catch (e) {
        fallidos++;
        const estado = (e as { statusCode?: number }).statusCode;
        const mensaje = e instanceof Error ? e.message : String(e);

        // 404 y 410 significan que el endpoint ya no existe: se borra en vez
        // de acumular fallos.
        if (estado === 404 || estado === 410) {
          await supabase.from('push_subscription').delete().eq('id', destino.sub_id);
        } else {
          const { data: sub } = await supabase
            .from('push_subscription')
            .select('fallos_consecutivos')
            .eq('id', destino.sub_id)
            .single();

          const fallos = (sub?.fallos_consecutivos ?? 0) + 1;
          if (fallos >= MAX_FALLOS) {
            await supabase.from('push_subscription').delete().eq('id', destino.sub_id);
          } else {
            await supabase
              .from('push_subscription')
              .update({ fallos_consecutivos: fallos })
              .eq('id', destino.sub_id);
          }
        }

        await supabase.from('notificacion_log').insert({
          perfil_id: destino.perfil_id,
          tipo: recordatorio.tipo,
          titulo: recordatorio.titulo,
          resultado: 'error',
          error: mensaje.slice(0, 500),
        });
      }
    }

    await supabase
      .from('recordatorio')
      .update({
        estado: algunoOk ? 'enviado' : 'fallido',
        enviado_en: new Date().toISOString(),
      })
      .eq('id', recordatorio.id);
  }

  return new Response(
    JSON.stringify({ recordatorios: pendientes?.length ?? 0, enviados, fallidos }),
    { headers: { 'content-type': 'application/json' } },
  );
});
