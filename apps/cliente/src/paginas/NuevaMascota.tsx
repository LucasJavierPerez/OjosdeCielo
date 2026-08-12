import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { useCrearMascota } from '../features/mascotas/api.js';
import { FormularioMascota } from '../features/mascotas/FormularioMascota.js';

export function NuevaMascota() {
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const crear = useCrearMascota(supabase);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Agregar mascota" volverA="/" />

      <p className="mt-2 text-sm text-slate-600">
        Sólo el nombre y la especie son obligatorios. El resto lo podés completar después.
      </p>

      <div className="mt-6">
        <FormularioMascota
          textoBoton="Agregar mascota"
          enviando={crear.isPending}
          errorEnvio={error}
          onCancelar={() => void navigate('/')}
          onEnviar={(datos) => {
            setError(null);
            crear.mutate(datos, {
              onSuccess: (mascota) => void navigate(`/mascotas/${mascota.id}`, { replace: true }),
              onError: () => setError('No pudimos guardar la mascota. Probá de nuevo.'),
            });
          }}
        />
      </div>
    </main>
  );
}
