/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Clave pública VAPID. La privada vive sólo en la Edge Function. */
  readonly VITE_VAPID_PUBLIC_KEY: string;
  /** Dirección del panel, para redirigir al personal que entra acá por error. */
  readonly VITE_URL_PANEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
