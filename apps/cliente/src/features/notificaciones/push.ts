import type { ClienteSupabase } from '@ojosdecielo/db';

/**
 * Suscripción a notificaciones push.
 *
 * En iOS esto sólo funciona con la app agregada a la pantalla de inicio y con
 * iOS 16.4 o superior (docs/stack.md, Decisión 1). Por eso el estado distingue
 * "no soportado" de "hay que instalar primero": son problemas distintos y el
 * usuario necesita instrucciones distintas.
 */

export type EstadoPush =
  | 'no_soportado'
  | 'requiere_instalar'
  | 'sin_permiso'
  | 'denegado'
  | 'activo';

export function estaInstalada(): boolean {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export async function estadoActual(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in globalThis)) {
    // En iOS la API de push ni siquiera existe hasta que la app está instalada,
    // así que la ausencia se interpreta distinto según la plataforma.
    return esIOS() && !estaInstalada() ? 'requiere_instalar' : 'no_soportado';
  }

  if (esIOS() && !estaInstalada()) return 'requiere_instalar';

  if (Notification.permission === 'denied') return 'denegado';
  if (Notification.permission === 'default') return 'sin_permiso';

  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  return suscripcion ? 'activo' : 'sin_permiso';
}

/**
 * Convierte la clave VAPID de base64url al buffer que espera el navegador.
 *
 * Devuelve ArrayBuffer y no Uint8Array porque desde TypeScript 5.7 el tipo está
 * parametrizado por el buffer subyacente, y `Uint8Array<ArrayBufferLike>` no
 * satisface `BufferSource`.
 */
function claveAplicacion(base64: string): ArrayBuffer {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binaria = atob(normalizada);
  const buffer = new ArrayBuffer(binaria.length);
  const vista = new Uint8Array(buffer);
  for (let i = 0; i < binaria.length; i++) vista[i] = binaria.charCodeAt(i);
  return buffer;
}

/**
 * Pide permiso y registra el dispositivo.
 *
 * El permiso se pide desde un gesto del usuario: en iOS, llamarlo fuera de un
 * handler de evento falla en silencio.
 */
export async function activarPush(
  supabase: ClienteSupabase,
  clavePublica: string,
): Promise<EstadoPush> {
  const estado = await estadoActual();
  if (estado === 'no_soportado' || estado === 'requiere_instalar' || estado === 'denegado') {
    return estado;
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso === 'denied' ? 'denegado' : 'sin_permiso';

  const registro = await navigator.serviceWorker.ready;
  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveAplicacion(clavePublica),
    }));

  const json = suscripcion.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('La suscripción no trajo las claves de cifrado');
  }

  // upsert por endpoint: reinstalar la app genera un endpoint nuevo, pero
  // reactivar el permiso en el mismo dispositivo suele devolver el mismo.
  const { error } = await supabase.from('push_subscription').upsert(
    {
      endpoint: suscripcion.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
      fallos_consecutivos: 0,
    },
    { onConflict: 'endpoint' },
  );

  if (error) throw error;
  return 'activo';
}

export async function desactivarPush(supabase: ClienteSupabase): Promise<void> {
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) return;

  // Primero la base, después el navegador: si se hiciera al revés y fallara el
  // borrado en la base, quedaría un endpoint muerto recibiendo envíos.
  await supabase.from('push_subscription').delete().eq('endpoint', suscripcion.endpoint);
  await suscripcion.unsubscribe();
}
