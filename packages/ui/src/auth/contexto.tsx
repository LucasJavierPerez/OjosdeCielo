import type { ClienteSupabase, Perfil, Session } from '@ojosdecielo/db';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface EstadoAuth {
  session: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  supabase: ClienteSupabase;
  cerrarSesion: () => Promise<void>;
  refrescarPerfil: () => Promise<void>;
}

const ContextoAuth = createContext<EstadoAuth | null>(null);

export function ProveedorAuth({
  supabase,
  children,
}: {
  supabase: ClienteSupabase;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const queryClient = useQueryClient();
  // A quién pertenece el `perfil` ya cargado (o en curso de cargarse). Un
  // TOKEN_REFRESHED dispara este mismo evento cada ~1h sin cambiar de
  // usuario: sin esta guarda, cada refresh de token volvería a marcar
  // `cargando` y tapa la pantalla con el spinner de golpe.
  const perfilDeRef = useRef<string | null>(null);

  useEffect(() => {
    let activo = true;

    async function cargarPerfil(userId: string) {
      const { data, error } = await supabase.from('perfil').select('*').eq('id', userId).single();

      if (!activo) return;
      if (error) {
        console.error('No se pudo cargar el perfil:', error.message);
        perfilDeRef.current = null;
        setPerfil(null);
        return;
      }
      perfilDeRef.current = userId;
      setPerfil(data);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setSession(data.session);
      if (data.session) {
        cargarPerfil(data.session.user.id).finally(() => activo && setCargando(false));
      } else {
        setCargando(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((evento, nuevaSession) => {
      if (!activo) return;
      setSession(nuevaSession);

      if (nuevaSession) {
        // Sólo repetimos la carga cuando cambia de usuario: un login
        // interactivo dispara este evento con `perfil` todavía en null (el
        // de la sesión anterior, o ninguno). Sin marcar `cargando` en ese
        // caso, RutaProtegida ve `perfil == null` en ese instante y manda a
        // /sin-acceso antes de que la consulta llegue — y nada vuelve a
        // evaluarla después, así que la persona queda varada ahí aunque su
        // perfil cargue bien medio segundo más tarde.
        if (perfilDeRef.current !== nuevaSession.user.id) {
          setCargando(true);
          cargarPerfil(nuevaSession.user.id).finally(() => activo && setCargando(false));
        }
      } else {
        perfilDeRef.current = null;
        setPerfil(null);
        setCargando(false);
        // Al cerrar sesión no puede quedar nada del usuario anterior en caché:
        // el dispositivo puede ser compartido (AGENTS.md, regla 14).
        if (evento === 'SIGNED_OUT') {
          // La caché en memoria de react-query también, y no sólo la del
          // service worker: sin esto, quien entra después ve por un instante
          // las mascotas y los turnos del anterior mientras cada consulta se
          // vuelve a resolver. RLS impide traer datos ajenos, no impide
          // mostrar los que ya estaban en pantalla.
          queryClient.clear();
          void limpiarCachesDeDatos();
        }
      }
    });

    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, queryClient]);

  const valor = useMemo<EstadoAuth>(
    () => ({
      session,
      perfil,
      cargando,
      supabase,
      cerrarSesion: async () => {
        await supabase.auth.signOut();
      },
      refrescarPerfil: async () => {
        if (!session) return;
        const { data } = await supabase
          .from('perfil')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setPerfil(data);
      },
    }),
    [session, perfil, cargando, supabase],
  );

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(ContextoAuth);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <ProveedorAuth>');
  return ctx;
}

async function limpiarCachesDeDatos() {
  if (!('caches' in globalThis)) return;
  try {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n.startsWith('api-')).map((n) => caches.delete(n)));
  } catch (error) {
    console.error('No se pudieron limpiar las cachés:', error);
  }
}
