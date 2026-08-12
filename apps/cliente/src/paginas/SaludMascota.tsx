import { Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { useMascota } from '../features/mascotas/api.js';
import { useRealtimeMascota } from '../features/mascotas/tutores.js';
import { HistorialClinico } from '../features/salud/HistorialClinico.js';
import { SeccionAntecedentes } from '../features/salud/SeccionAntecedentes.js';
import { SeccionAplicaciones } from '../features/salud/SeccionAplicaciones.js';
import { SeccionMedicacion } from '../features/salud/SeccionMedicacion.js';
import { SeccionPeso } from '../features/salud/SeccionPeso.js';

export function SaludMascota() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const { data: mascota, isLoading, isError, refetch } = useMascota(supabase, id);

  // Si el otro tutor carga algo, aparece acá sin recargar.
  useRealtimeMascota(supabase, id);

  if (isLoading) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Salud" volverA={`/mascotas/${id}`} />
        <Cargando />
      </main>
    );
  }

  if (isError || !mascota) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Salud" volverA="/" />
        <div className="mt-4">
          <MensajeError titulo="No encontramos esta mascota" onReintentar={() => void refetch()} />
        </div>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo={`Salud de ${mascota.nombre}`} volverA={`/mascotas/${mascota.id}`} />

      <p className="mt-2 text-sm text-slate-600">
        Lo que cargues acá es tuyo y lo podés corregir. Lo que registre la clínica aparece marcado y
        en modo lectura.
      </p>

      <div className="mt-4">
        <HistorialClinico mascotaId={mascota.id} />
        <SeccionPeso mascotaId={mascota.id} />
        <SeccionAplicaciones mascotaId={mascota.id} />
        <SeccionAntecedentes mascotaId={mascota.id} />
        <SeccionMedicacion mascotaId={mascota.id} />
      </div>
    </main>
  );
}
