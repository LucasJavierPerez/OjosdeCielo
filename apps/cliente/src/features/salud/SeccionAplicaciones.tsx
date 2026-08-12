import { zodResolver } from '@hookform/resolvers/zod';
import {
  aplicacionSchema,
  type DatosAplicacion,
  ETIQUETA_APLICACION,
  estadoVencimiento,
  formatearFechaCivil,
  sugerirProximaFecha,
  TIPOS_APLICACION,
  type TipoAplicacion,
  textoRelativo,
} from '@ojosdecielo/core';
import { Boton, Campo, cn, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  type Aplicacion,
  useAplicaciones,
  useBorrarAplicacion,
  useCargarAplicacion,
} from './api.js';
import { EtiquetaOrigen, puedeEditar } from './Origen.js';
import { Seccion } from './Seccion.js';

export function SeccionAplicaciones({ mascotaId }: { mascotaId: string }) {
  const { supabase, perfil } = useAuth();
  const { data: aplicaciones, isLoading } = useAplicaciones(supabase, mascotaId);
  const [agregando, setAgregando] = useState(false);

  const pendientes = (aplicaciones ?? []).filter((a) => {
    const estado = estadoVencimiento(a.proxima_fecha);
    return estado === 'vencida' || estado === 'proxima';
  });

  return (
    <Seccion
      titulo="Vacunas y desparasitaciones"
      resumen={pendientes.length > 0 ? `${pendientes.length} por dar` : undefined}
      cargando={isLoading}
      vacio={!aplicaciones?.length}
      textoVacio="Cargá el carnet para no perderte ninguna fecha."
      onAgregar={() => setAgregando(true)}
    >
      {agregando && (
        <FormularioAplicacion mascotaId={mascotaId} onCerrar={() => setAgregando(false)} />
      )}

      {aplicaciones && aplicaciones.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {aplicaciones.map((a) => (
            <FilaAplicacion
              key={a.id}
              aplicacion={a}
              mascotaId={mascotaId}
              puedoBorrar={Boolean(perfil && puedeEditar(a, perfil.id))}
            />
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function FilaAplicacion({
  aplicacion: a,
  mascotaId,
  puedoBorrar,
}: {
  aplicacion: Aplicacion;
  mascotaId: string;
  puedoBorrar: boolean;
}) {
  const { supabase } = useAuth();
  const borrar = useBorrarAplicacion(supabase, mascotaId);
  const [confirmando, setConfirmando] = useState(false);
  const estado = estadoVencimiento(a.proxima_fecha);

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium">
          {ETIQUETA_APLICACION[a.tipo as TipoAplicacion]}
          {a.producto && <span className="font-normal text-slate-600"> · {a.producto}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {formatearFechaCivil(a.fecha)}
          <EtiquetaOrigen registro={a} />
        </p>

        {a.proxima_fecha && estado && (
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              estado === 'vencida' && 'text-red-700',
              estado === 'proxima' && 'text-amber-700',
              estado === 'al_dia' && 'text-slate-500',
            )}
          >
            {estado === 'vencida' && 'Vencida'}
            {estado === 'proxima' && 'Próxima'}
            {estado === 'al_dia' && 'Próxima'}: {formatearFechaCivil(a.proxima_fecha)}{' '}
            <span className="font-normal">({textoRelativo(a.proxima_fecha)})</span>
          </p>
        )}

        {a.nota && <p className="mt-0.5 text-xs text-slate-500">{a.nota}</p>}
      </div>

      {puedoBorrar &&
        (confirmando ? (
          <div className="flex shrink-0 gap-2">
            <Boton
              variante="texto"
              className="text-xs text-red-700"
              cargando={borrar.isPending}
              onClick={() => borrar.mutate(a.id)}
            >
              Confirmar
            </Boton>
            <Boton
              variante="texto"
              className="text-xs text-slate-400"
              onClick={() => setConfirmando(false)}
            >
              No
            </Boton>
          </div>
        ) : (
          <Boton
            variante="texto"
            className="shrink-0 text-xs text-slate-400"
            onClick={() => setConfirmando(true)}
          >
            Borrar
          </Boton>
        ))}
    </li>
  );
}

function FormularioAplicacion({
  mascotaId,
  onCerrar,
}: {
  mascotaId: string;
  onCerrar: () => void;
}) {
  const { supabase } = useAuth();
  const cargar = useCargarAplicacion(supabase, mascotaId);
  const [error, setError] = useState<string | null>(null);
  const hoy = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<DatosAplicacion>({
    resolver: zodResolver(aplicacionSchema),
    defaultValues: {
      tipo: 'vacuna',
      fecha: hoy,
      proxima_fecha: sugerirProximaFecha(hoy, 'vacuna'),
      producto: '',
      nota: '',
    },
  });

  // La próxima fecha se resugiere al cambiar tipo o fecha, pero queda editable:
  // los intervalos reales dependen del producto y del criterio del veterinario.
  const tipo = useWatch({ control, name: 'tipo' });
  const fecha = useWatch({ control, name: 'fecha' });

  return (
    <form
      className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3"
      noValidate
      onSubmit={handleSubmit((datos) => {
        setError(null);
        cargar.mutate(datos, {
          onSuccess: onCerrar,
          onError: () => setError('No pudimos guardar. Probá de nuevo.'),
        });
      })}
    >
      <Campo id="tipo_apl" etiqueta="Tipo" error={errors.tipo?.message}>
        <Seleccion
          id="tipo_apl"
          {...register('tipo', {
            onChange: (e) => {
              setValue('proxima_fecha', sugerirProximaFecha(fecha, e.target.value));
            },
          })}
        >
          {TIPOS_APLICACION.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_APLICACION[t]}
            </option>
          ))}
        </Seleccion>
      </Campo>

      <Campo
        id="producto_apl"
        etiqueta="Producto"
        ayuda="Opcional. Ej: Antirrábica, Nexgard"
        error={errors.producto?.message}
      >
        <Entrada id="producto_apl" {...register('producto')} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="fecha_apl" etiqueta="Fecha" error={errors.fecha?.message}>
          <Entrada
            id="fecha_apl"
            type="date"
            {...register('fecha', {
              onChange: (e) => setValue('proxima_fecha', sugerirProximaFecha(e.target.value, tipo)),
            })}
          />
        </Campo>
        <Campo
          id="proxima_apl"
          etiqueta="Próxima"
          ayuda="Sugerida"
          error={errors.proxima_fecha?.message}
        >
          <Entrada id="proxima_apl" type="date" {...register('proxima_fecha')} />
        </Campo>
      </div>

      {error && <MensajeError detalle={error} />}

      <div className="flex gap-2">
        <Boton type="submit" cargando={cargar.isPending} className="flex-1 text-sm">
          Guardar
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
