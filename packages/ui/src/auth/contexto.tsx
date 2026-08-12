import type { ClienteSupabase, Perfil, Session } from '@ojosdecielo/db';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    let activo = true;

    async function cargarPerfil(userId: string) {
      const { data, error } = await supabase.from('perfil').select('*').eq('id', userId).single();

      if (!activo) return;
      if (error) {
        console.error('No se pudo cargar el perfil:', error.message);
        setPerfil(null);
        return;
      }
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
        cargarPerfil(nuevaSession.user.id);
      } else {
        setPerfil(null);
        // Al cerrar sesión no puede quedar nada del usuario anterior en caché:
        // el dispositivo puede ser compartido (AGENTS.md, regla 14).
        if (evento === 'SIGNED_OUT') {
          void limpiarCachesDeDatos();
        }
      }
    });

    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

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
