import { Cargando } from '@ojosdecielo/ui';
import type { ReactNode } from 'react';

/**
 * Contenedor de una sección de la ficha de salud.
 *
 * Unifica los tres estados que toda vista con datos tiene que resolver —
 * cargando, vacío y con contenido — para que ninguna sección se olvide de
 * alguno. Es solo lectura: la carga de datos de salud la hace la clínica.
 */
export function Seccion({
  titulo,
  resumen,
  cargando,
  vacio,
  textoVacio,
  children,
}: {
  titulo: string;
  resumen?: string;
  cargando?: boolean;
  vacio?: boolean;
  textoVacio: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-t border-slate-200 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">
          {titulo}
          {resumen && <span className="ml-2 text-sm font-normal text-slate-500">{resumen}</span>}
        </h2>
      </div>

      {cargando && <Cargando etiqueta={`Cargando ${titulo.toLowerCase()}`} />}

      {!cargando && vacio && <p className="mt-2 text-sm text-slate-500">{textoVacio}</p>}

      {children}
    </section>
  );
}
