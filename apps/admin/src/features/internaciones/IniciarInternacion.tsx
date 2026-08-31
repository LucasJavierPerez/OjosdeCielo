import { Boton, Campo, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type EpisodioTipo, useCrearInternacion } from './api.js';

const COPIA: Record<
  EpisodioTipo,
  { titulo: string; motivo: string; motivoPlaceholder: string; boton: string; base: string }
> = {
  internacion: {
    titulo: 'Internar paciente',
    motivo: 'Motivo de internación',
    motivoPlaceholder: 'Post-quirúrgico, deshidratación, observación…',
    boton: 'Internar',
    base: '/internaciones',
  },
  domicilio: {
    titulo: 'Registrar atención a domicilio',
    motivo: 'Motivo de la visita',
    motivoPlaceholder: 'Control post-operatorio, aplicación de medicación…',
    boton: 'Abrir visita',
    base: '/domicilios',
  },
};

/**
 * Alta de un episodio (internación o atención a domicilio) desde la ficha del
 * paciente. Al crearlo, lleva a su ficha, que es donde se carga todo lo demás.
 */
export function IniciarInternacion({
  mascotaId,
  tipo = 'internacion',
  direccionSugerida = '',
  onCancelar,
}: {
  mascotaId: string;
  tipo?: EpisodioTipo;
  direccionSugerida?: string;
  onCancelar: () => void;
}) {
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const crear = useCrearInternacion(supabase);
  const copia = COPIA[tipo];
  const esDomicilio = tipo === 'domicilio';
  const [motivo, setMotivo] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [direccion, setDireccion] = useState(direccionSugerida);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!motivo.trim()) {
          setError('Poné el motivo');
          return;
        }
        setError(null);
        crear.mutate(
          {
            mascotaId,
            tipo,
            motivo,
            ...(diagnostico.trim() && { diagnostico }),
            ...(!esDomicilio && ubicacion.trim() && { ubicacion }),
            ...(esDomicilio && direccion.trim() && { direccion }),
          },
          {
            onSuccess: ({ id }) => navigate(`${copia.base}/${id}`),
            onError: (e2) => setError(e2.message),
          },
        );
      }}
    >
      <h3 className="font-medium">{copia.titulo}</h3>
      <Campo id="in-motivo" etiqueta={copia.motivo}>
        <Entrada
          id="in-motivo"
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={copia.motivoPlaceholder}
        />
      </Campo>
      <Campo
        id="in-diag"
        etiqueta="Diagnóstico"
        ayuda="Presuntivo. Se ajusta durante el seguimiento."
      >
        <Entrada
          id="in-diag"
          value={diagnostico}
          onChange={(e) => setDiagnostico(e.target.value)}
        />
      </Campo>
      {esDomicilio ? (
        <Campo id="in-dir" etiqueta="Dirección" ayuda="Se propone la del tutor. Editable.">
          <Entrada id="in-dir" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </Campo>
      ) : (
        <Campo id="in-ubic" etiqueta="Ubicación" ayuda="Box, jaula, sala. Opcional.">
          <Entrada id="in-ubic" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
        </Campo>
      )}
      {error && <MensajeError detalle={error} />}
      <div className="flex gap-2">
        <Boton type="submit" cargando={crear.isPending}>
          {copia.boton}
        </Boton>
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
