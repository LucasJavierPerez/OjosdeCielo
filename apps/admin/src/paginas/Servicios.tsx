import { Boton, Campo, Cargando, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import {
  type DatosServicio,
  type Servicio,
  useActualizarServicio,
  useCrearServicio,
  useServicios,
} from '../features/servicios/api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export function Servicios() {
  const { supabase } = useAuth();
  const { data: servicios, isLoading, isError, refetch } = useServicios(supabase);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);

  const filtrados = (servicios ?? []).filter((s) =>
    `${s.nombre} ${s.categoria ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()),
  );

  // Agrupados por categoría, en el orden en que ya vienen (categoría, nombre).
  const grupos = new Map<string, Servicio[]>();
  for (const s of filtrados) {
    const clave = s.categoria ?? 'Sin categoría';
    grupos.set(clave, [...(grupos.get(clave) ?? []), s]);
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Servicios y honorarios</h1>
        {!creando && <Boton onClick={() => setCreando(true)}>Nuevo servicio</Boton>}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Precios de actos (consultas, cirugías, maniobras…), separados del inventario porque no
        tienen stock. Se eligen al cargar un cargo manual en una internación o atención a domicilio.
      </p>

      {creando && <FormularioServicio onCerrar={() => setCreando(false)} />}

      <div className="mt-4">
        <label htmlFor="buscar-serv" className="sr-only">
          Buscar servicio
        </label>
        <Entrada
          id="buscar-serv"
          type="search"
          placeholder="Buscar servicio"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="mt-0"
        />
      </div>

      {isLoading && <Cargando etiqueta="Cargando servicios" />}

      {isError && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos cargar" onReintentar={() => void refetch()} />
        </div>
      )}

      {servicios && filtrados.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo={busqueda ? 'Sin resultados' : 'Todavía no hay servicios cargados'}
            descripcion={!busqueda ? 'Cargá el primero con «Nuevo servicio».' : undefined}
          />
        </div>
      )}

      {[...grupos.entries()].map(([categoria, items]) => (
        <section key={categoria} className="mt-6">
          <h2 className="text-sm font-medium text-slate-500">{categoria}</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {items.map((s) => (
              <FilaServicio key={s.id} servicio={s} />
            ))}
          </ul>
        </section>
      ))}
    </Layout>
  );
}

function FilaServicio({ servicio }: { servicio: Servicio }) {
  const { supabase } = useAuth();
  const actualizar = useActualizarServicio(supabase);
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <li className="p-3">
        <FormularioServicio
          inicial={servicio}
          onGuardar={(datos) =>
            actualizar.mutateAsync({ ...datos, id: servicio.id, activo: servicio.activo })
          }
          onCerrar={() => setEditando(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className={servicio.activo ? 'font-medium' : 'font-medium text-slate-400 line-through'}>
          {servicio.nombre}
        </p>
        {servicio.notas && <p className="text-xs text-slate-500">{servicio.notas}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="tabular-nums">{pesos(Number(servicio.precio))}</span>
        <Boton variante="texto" className="text-xs" onClick={() => setEditando(true)}>
          Editar
        </Boton>
      </div>
    </li>
  );
}

function FormularioServicio({
  inicial,
  onGuardar,
  onCerrar,
}: {
  inicial?: Servicio;
  onGuardar?: (datos: DatosServicio & { activo: boolean }) => Promise<void>;
  onCerrar: () => void;
}) {
  const { supabase } = useAuth();
  const crear = useCrearServicio(supabase);
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [categoria, setCategoria] = useState(inicial?.categoria ?? '');
  const [precio, setPrecio] = useState(inicial ? String(inicial.precio) : '');
  const [notas, setNotas] = useState(inicial?.notas ?? '');
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!nombre.trim()) {
          setError('Poné el nombre del servicio');
          return;
        }
        const monto = Number(precio);
        if (!(monto >= 0)) {
          setError('Poné un precio válido');
          return;
        }
        setError(null);
        const datos: DatosServicio = {
          nombre,
          precio: monto,
          ...(categoria.trim() && { categoria }),
          ...(notas.trim() && { notas }),
        };
        try {
          setGuardando(true);
          if (onGuardar) {
            await onGuardar({ ...datos, activo });
          } else {
            await crear.mutateAsync(datos);
          }
          onCerrar();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No pudimos guardar');
        } finally {
          setGuardando(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="sv-nombre" etiqueta="Nombre">
          <Entrada
            id="sv-nombre"
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Consulta en consultorio"
          />
        </Campo>
        <Campo id="sv-cat" etiqueta="Categoría" ayuda="Opcional">
          <Entrada
            id="sv-cat"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Consultas, Cirugía, Internación…"
          />
        </Campo>
      </div>
      <Campo id="sv-precio" etiqueta="Precio">
        <Entrada
          id="sv-precio"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />
      </Campo>
      <Campo id="sv-notas" etiqueta="Notas" ayuda="Ej: «sumar el valor de la vacuna». Opcional.">
        <Entrada id="sv-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      {inicial && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          Activo
        </label>
      )}
      {error && <MensajeError detalle={error} />}
      <div className="flex gap-2">
        <Boton type="submit" cargando={guardando}>
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
