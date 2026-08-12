import { crearCliente } from '@ojosdecielo/db';
import { ProveedorAuth } from '@ojosdecielo/ui/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.js';
import '@ojosdecielo/ui/estilos.css';

const supabase = crearCliente(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // El panel corre sobre la red de la clínica y el personal necesita datos
      // frescos: la agenda cambia todo el tiempo.
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

const contenedor = document.getElementById('root');
if (!contenedor) throw new Error('No se encontró #root');

createRoot(contenedor).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProveedorAuth supabase={supabase}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ProveedorAuth>
    </QueryClientProvider>
  </StrictMode>,
);
