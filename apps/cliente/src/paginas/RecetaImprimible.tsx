import { calcularEdad, formatearFechaCivil } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { useRecetaParaImprimir } from '../features/recetas/api.js';

/**
 * La receta lista para mostrar en la farmacia o guardar como PDF.
 *
 * No se genera un PDF con una librería: se imprime la página. El diálogo de
 * impresión de cualquier navegador —también el de iOS y Android— ofrece
 * "Guardar como PDF", y de paso el archivo sale con el tamaño de papel que el
 * usuario necesita. Meter un generador de PDF sumaría medio megabyte al bundle
 * para hacer peor lo que el sistema operativo ya hace bien.
 */
export function RecetaImprimible() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const { data: receta, isLoading, isError, refetch } = useRecetaParaImprimir(supabase, id);
  const [qr, setQr] = useState<string | null>(null);

  const urlVerificacion = receta ? `${globalThis.location.origin}/r/${receta.codigo}` : null;

  useEffect(() => {
    if (!urlVerificacion) return;
    void QRCode.toDataURL(urlVerificacion, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(setQr);
  }, [urlVerificacion]);

  if (isLoading) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Cargando />
      </main>
    );
  }

  if (isError || !receta) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <MensajeError titulo="No encontramos esta receta" onReintentar={() => void refetch()} />
      </main>
    );
  }

  const anulada = receta.estado === 'anulada';

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-2xl px-6 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <Encabezado titulo="Receta" volverA="/" />
      </div>

      {(anulada || receta.vencida) && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">
          {anulada
            ? 'Esta receta fue anulada por el veterinario. No sirve para retirar medicación.'
            : 'Esta receta está vencida. Pedile al veterinario que emita una nueva.'}
        </p>
      )}

      <article className="mt-6 rounded-xl border border-slate-300 bg-white p-6 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-4">
          <div>
            <p className="text-lg font-semibold">{receta.clinica.nombre}</p>
            {receta.clinica.direccion && (
              <p className="text-sm text-slate-600">
                {receta.clinica.direccion}
                {receta.clinica.localidad && `, ${receta.clinica.localidad}`}
              </p>
            )}
            {receta.clinica.telefono && (
              <p className="text-sm text-slate-600">{receta.clinica.telefono}</p>
            )}
          </div>
          {qr && (
            <div className="text-center">
              <img src={qr} alt="Código de verificación" className="size-24" />
              <p className="mt-1 font-mono text-[11px] tracking-wider">{receta.codigo}</p>
            </div>
          )}
        </header>

        <section className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <p>
            <span className="text-slate-500">Paciente: </span>
            <span className="font-medium">{receta.mascota}</span>
          </p>
          <p>
            <span className="text-slate-500">Especie: </span>
            {receta.especie}
            {receta.raza && ` · ${receta.raza}`}
          </p>
          {receta.fecha_nacimiento && (
            <p>
              <span className="text-slate-500">Edad: </span>
              {calcularEdad(receta.fecha_nacimiento)}
            </p>
          )}
          <p>
            <span className="text-slate-500">Emitida: </span>
            {formatearFechaCivil(receta.emitida_en.slice(0, 10))}
          </p>
          <p>
            <span className="text-slate-500">Válida hasta: </span>
            {formatearFechaCivil(receta.vence_el)}
          </p>
        </section>

        {receta.diagnostico && (
          <p className="mt-4 text-sm">
            <span className="text-slate-500">Diagnóstico: </span>
            {receta.diagnostico}
          </p>
        )}

        <h2 className="mt-6 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Rp/
        </h2>
        <ol className="mt-3 space-y-3">
          {receta.items.map((i) => (
            <li key={`${i.descripcion}-${i.dosis}`}>
              <p className="font-medium">
                {i.descripcion} — {i.cantidad}
              </p>
              <p className="text-sm text-slate-700">
                {i.dosis}
                {i.duracion && ` · ${i.duracion}`}
              </p>
            </li>
          ))}
        </ol>

        {receta.indicaciones && (
          <p className="mt-6 text-sm">
            <span className="text-slate-500">Indicaciones: </span>
            {receta.indicaciones}
          </p>
        )}

        <footer className="mt-10 border-t border-slate-300 pt-4 text-sm">
          <p className="font-medium">{receta.profesional}</p>
          {receta.matricula && <p className="text-slate-600">M.V. {receta.matricula}</p>}
          <p className="mt-4 text-xs text-slate-500">
            Verificá esta receta en {globalThis.location.host}/r/{receta.codigo} — la página indica
            quién la emitió, qué contiene y si sigue vigente.
          </p>
        </footer>
      </article>

      <div className="mt-6 print:hidden">
        <Boton className="w-full" onClick={() => globalThis.print()}>
          Imprimir o guardar como PDF
        </Boton>
        <p className="mt-2 text-center text-xs text-slate-500">
          En el diálogo de impresión elegí “Guardar como PDF”.
        </p>
      </div>
    </main>
  );
}
