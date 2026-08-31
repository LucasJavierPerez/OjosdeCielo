import { Boton, Campo, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCrearInternacion } from './api.js';

/**
 * Alta de internación desde la ficha del paciente. Al crearla, lleva a la ficha
 * de la internación, que es donde se carga todo lo demás.
 */
export function IniciarInternacion({
  mascotaId,
  onCancelar,
}: {
  mascotaId: string;
  onCancelar: () => void;
}) {
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const crear = useCrearInternacion(supabase);
  const [motivo, setMotivo] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!motivo.trim()) {
          setError('Poné el motivo de internación');
          return;
        }
        setError(null);
        crear.mutate(
          {
            mascotaId,
            motivo,
            ...(diagnostico.trim() && { diagnostico }),
            ...(ubicacion.trim() && { ubicacion }),
          },
          {
            onSuccess: ({ id }) => navigate(`/internaciones/${id}`),
            onError: (e2) => setError(e2.message),
          },
        );
      }}
    >
      <h3 className="font-medium">Internar paciente</h3>
      <Campo id="in-motivo" etiqueta="Motivo de internación">
        <Entrada
          id="in-motivo"
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Post-quirúrgico, deshidratación, observación…"
        />
      </Campo>
      <Campo
        id="in-diag"
        etiqueta="Diagnóstico"
        ayuda="Presuntivo. Se ajusta durante la internación."
      >
        <Entrada
          id="in-diag"
          value={diagnostico}
          onChange={(e) => setDiagnostico(e.target.value)}
        />
      </Campo>
      <Campo id="in-ubic" etiqueta="Ubicación" ayuda="Box, jaula, sala. Opcional.">
        <Entrada id="in-ubic" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
      </Campo>
      {error && <MensajeError detalle={error} />}
      <div className="flex gap-2">
        <Boton type="submit" cargando={crear.isPending}>
          Internar
        </Boton>
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
