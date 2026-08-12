/**
 * Checkout con MercadoPago.
 *
 * Dos operaciones en una función:
 *   POST /pago-mercadopago         → crea la preferencia de pago
 *   POST /pago-mercadopago/webhook → recibe la confirmación de MercadoPago
 *
 * La regla que define este archivo: el estado del pago lo determina el
 * webhook, nunca el navegador. El retorno del usuario a la app es sólo
 * experiencia de usuario — puede cerrarlo, perder señal o falsearlo.
 *
 * ⚠️ SIN VERIFICAR CONTRA MERCADOPAGO REAL. La lógica de confirmación e
 * idempotencia está probada contra la base, pero el intercambio con la API
 * de MercadoPago necesita credenciales reales para comprobarse.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') ?? '';
const URL_APP = Deno.env.get('URL_APP') ?? 'http://localhost:5173';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

/**
 * Valida la firma del webhook.
 *
 * Sin esto cualquiera podría marcar órdenes como pagadas con un POST. La firma
 * viaja en `x-signature` con formato `ts=...,v1=...` y se calcula sobre un
 * manifest con el id del pago, el request-id y el timestamp.
 */
async function firmaValida(req: Request, dataId: string): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return false;

  const firma = req.headers.get('x-signature') ?? '';
  const requestId = req.headers.get('x-request-id') ?? '';

  const partes = Object.fromEntries(
    firma.split(',').map((p) => p.split('=').map((x) => x.trim()) as [string, string]),
  );
  const ts = partes.ts;
  const hash = partes.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firmado = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifest));
  const esperado = Array.from(new Uint8Array(firmado))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Comparación de tiempo constante: una comparación normal filtra información
  // por el tiempo que tarda en fallar.
  if (esperado.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const esWebhook = url.pathname.endsWith('/webhook');

  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  // -------------------------------------------------------------------------
  // Webhook de MercadoPago
  // -------------------------------------------------------------------------
  if (esWebhook) {
    let cuerpo: { type?: string; action?: string; data?: { id?: string } };
    try {
      cuerpo = await req.json();
    } catch {
      return json({ error: 'Cuerpo inválido' }, 400);
    }

    const pagoId = cuerpo.data?.id;
    if (!pagoId) return json({ recibido: true });

    // Sólo los avisos de pago; MercadoPago manda otros tipos que no interesan.
    if (cuerpo.type && cuerpo.type !== 'payment') return json({ recibido: true });

    if (!(await firmaValida(req, String(pagoId)))) {
      return json({ error: 'Firma inválida' }, 401);
    }

    // No se confía en el cuerpo del webhook: se consulta a MercadoPago cuál es
    // el estado real del pago. El cuerpo sólo dice qué mirar.
    const respuesta = await fetch(`https://api.mercadopago.com/v1/payments/${pagoId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!respuesta.ok) {
      // 500 para que MercadoPago reintente: puede ser un problema transitorio.
      return json({ error: 'No se pudo consultar el pago' }, 500);
    }

    const pago = (await respuesta.json()) as {
      status?: string;
      transaction_amount?: number;
      external_reference?: string;
    };

    if (pago.status !== 'approved') {
      return json({ recibido: true, estado: pago.status });
    }

    const ordenId = pago.external_reference;
    if (!ordenId) return json({ error: 'Pago sin referencia de orden' }, 400);

    const { error } = await admin().rpc('confirmar_pago_online', {
      p_orden_id: ordenId,
      p_mp_payment_id: String(pagoId),
      p_monto: pago.transaction_amount ?? 0,
      p_payload: pago,
    });

    if (error) return json({ error: error.message }, 500);

    return json({ recibido: true, confirmado: true });
  }

  // -------------------------------------------------------------------------
  // Crear la preferencia de pago
  // -------------------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion.startsWith('Bearer ')) return json({ error: 'Falta la sesión' }, 401);

  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  });

  const { data: sesion } = await comoUsuario.auth.getUser();
  if (!sesion.user) return json({ error: 'Sesión inválida' }, 401);

  let cuerpo: { orden_id?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  if (!cuerpo.orden_id) return json({ error: 'Falta la orden' }, 400);

  // La orden se lee con el token del usuario: RLS garantiza que sea suya.
  const { data: orden } = await comoUsuario
    .from('orden')
    .select('id, total, estado, cliente_id')
    .eq('id', cuerpo.orden_id)
    .single();

  if (!orden) return json({ error: 'La orden no existe' }, 404);
  if (orden.estado !== 'pendiente_pago') {
    return json({ error: 'Esa orden no está esperando pago' }, 400);
  }

  const { data: items } = await comoUsuario
    .from('orden_item')
    .select('descripcion, cantidad, precio_unitario')
    .eq('orden_id', orden.id);

  const preferencia = {
    items: (items ?? []).map((i) => ({
      title: i.descripcion,
      quantity: i.cantidad,
      unit_price: Number(i.precio_unitario),
      currency_id: 'ARS',
    })),
    // Lo que ata el pago a la orden cuando vuelve el webhook.
    external_reference: orden.id,
    back_urls: {
      success: `${URL_APP}/tienda/orden/${orden.id}`,
      pending: `${URL_APP}/tienda/orden/${orden.id}`,
      failure: `${URL_APP}/tienda/orden/${orden.id}`,
    },
    auto_return: 'approved',
    notification_url: `${SUPABASE_URL}/functions/v1/pago-mercadopago/webhook`,
  };

  const respuesta = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(preferencia),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    return json({ error: 'No se pudo iniciar el pago', detalle: detalle.slice(0, 300) }, 502);
  }

  const creada = (await respuesta.json()) as { id?: string; init_point?: string };

  await admin()
    .from('orden')
    .update({ notas: `mp_preference:${creada.id}` })
    .eq('id', orden.id);

  return json({ preference_id: creada.id, init_point: creada.init_point });
});
