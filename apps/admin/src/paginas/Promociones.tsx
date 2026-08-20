import { formatearFechaCivil, hoyCivil } from '@ojosdecielo/core';
import {
  Boton,
  Campo,
  Cargando,
  cn,
  Entrada,
  MensajeError,
  Seleccion,
  Vacio,
} from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import { useCrearCampana, useLanzarCampana, useVistaPrevia } from '../features/comunicacion/api.js';
import { useStock } from '../features/inventario/api.js';
import {
  type DatosPromocion,
  type Promocion,
  useCrearPromocion,
  usePausarPromocion,
  usePromociones,
} from '../features/promociones/api.js';

type Estado = 'vigente' | 'futura' | 'vencida' | 'pausada';

const ETIQUETA_ESTADO: Record<Estado, { texto: string; clase: string }> = {
  vigente: { texto: 'Vigente', clase: 'bg-emerald-100 text-emerald-800' },
  futura: { texto: 'Todavía no empezó', clase: 'bg-marca-100 text-marca-700' },
  vencida: { texto: 'Vencida', clase: 'bg-slate-100 text-slate-500' },
  pausada: { texto: 'Pausada', clase: 'bg-amber-100 text-amber-800' },
};

function estadoDe(p: Promocion): Estado {
  if (!p.activa) return 'pausada';
  const hoy = hoyCivil();
  if (hoy < p.desde) return 'futura';
  if (hoy > p.hasta) return 'vencida';
  return 'vigente';
}

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export function Promociones() {
  const { supabase } = useAuth();
  const { data: promociones, isLoading, isError, refetch } = usePromociones(supabase);
  const [creando, setCreando] = useState(false);

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Promociones</h1>
        {!creando && <Boton onClick={() => setCreando(true)}>Nueva promoción</Boton>}
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Un descuento con fecha. Mientras esté vigente, la tienda muestra el precio rebajado sola —
        no depende de que alguien lo aplique en el mostrador.
      </p>

      {creando && <FormularioPromocion onCerrar={() => setCreando(false)} />}

      {isLoading && <Cargando etiqueta="Cargando promociones" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar las promociones"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {promociones && promociones.length === 0 && !creando && (
        <div className="mt-6">
          <Vacio
            titulo="Todavía no hay promociones"
            descripcion="Por ejemplo: 20% off en vacunas durante una semana."
          />
        </div>
      )}

      {promociones && promociones.length > 0 && (
        <ul className="mt-4 space-y-3">
          {promociones.map((p) => (
            <FilaPromocion key={p.id} promocion={p} />
          ))}
        </ul>
      )}
    </Layout>
  );
}

function textoDescuento(promocion: Promocion): string {
  return promocion.tipo_descuento === 'porcentaje'
    ? `${Number(promocion.valor)}% de descuento`
    : `${pesos(Number(promocion.valor))} de descuento`;
}

function FilaPromocion({ promocion }: { promocion: Promocion }) {
  const { supabase } = useAuth();
  const pausar = usePausarPromocion(supabase);
  const [error, setError] = useState<string | null>(null);
  const [avisando, setAvisando] = useState(false);

  const estado = estadoDe(promocion);
  const badge = ETIQUETA_ESTADO[estado];
  const puedeAvisar = estado === 'vigente' || estado === 'futura';

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className={cn('rounded px-2 py-0.5 text-xs font-medium', badge.clase)}>
            {badge.texto}
          </span>
          <span className="ml-2 font-medium">{promocion.titulo}</span>
        </div>
        <span className="text-sm text-slate-500">
          {formatearFechaCivil(promocion.desde)} – {formatearFechaCivil(promocion.hasta)}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-700">
        {textoDescuento(promocion)}
        {promocion.producto_id
          ? ' · un producto puntual'
          : promocion.categoria
            ? ` · categoría "${promocion.categoria}"`
            : ' · todo el catálogo'}
      </p>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      {!avisando && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Boton
            variante="texto"
            className="text-sm text-slate-500"
            cargando={pausar.isPending}
            onClick={() => {
              setError(null);
              pausar.mutate(
                { id: promocion.id, activa: !promocion.activa },
                { onError: (e) => setError(e.message) },
              );
            }}
          >
            {promocion.activa ? 'Pausar' : 'Reactivar'}
          </Boton>

          {puedeAvisar && (
            <Boton variante="texto" className="text-sm" onClick={() => setAvisando(true)}>
              Avisar a los tutores
            </Boton>
          )}
        </div>
      )}

      {avisando && <AvisoPromocion promocion={promocion} onCerrar={() => setAvisando(false)} />}
    </li>
  );
}

/**
 * Avisa la promoción por push, reusando el mismo mecanismo de Campañas: se
 * arma como una campaña con segmento vacío (todos los tutores activos) y se
 * lanza igual. No es un canal nuevo — es el que ya existe, con el mensaje
 * completado solo a partir de la promoción.
 */
function AvisoPromocion({ promocion, onCerrar }: { promocion: Promocion; onCerrar: () => void }) {
  const { supabase } = useAuth();
  const { data: previa, isFetching } = useVistaPrevia(supabase, {});
  const crear = useCrearCampana(supabase);
  const lanzar = useLanzarCampana(supabase);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const cuerpo =
    `${textoDescuento(promocion)} en la tienda, hasta el ${formatearFechaCivil(promocion.hasta)}.`.slice(
      0,
      300,
    );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium">Nueva promoción: {promocion.titulo}</p>
      <p className="mt-1 text-sm text-slate-600">{cuerpo}</p>

      <p className="mt-2 text-sm text-slate-500">
        {isFetching ? 'Calculando alcance…' : `Llega a ${previa?.total ?? 0} tutores.`}
      </p>

      {error && (
        <div className="mt-2">
          <MensajeError detalle={error} />
        </div>
      )}

      {resultado ? (
        <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">{resultado}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Boton
            className="text-sm"
            cargando={crear.isPending || lanzar.isPending}
            disabled={!previa || previa.total === 0}
            onClick={() => {
              setError(null);
              crear.mutate(
                {
                  titulo: `Nueva promoción: ${promocion.titulo}`.slice(0, 80),
                  cuerpo,
                  segmento: {},
                  url: '/tienda',
                },
                {
                  onSuccess: (c) =>
                    lanzar.mutate(c.id, {
                      onSuccess: (r) => {
                        setResultado(`Avisado a ${r.enviados} tutores.`);
                        setTimeout(onCerrar, 1500);
                      },
                      onError: (e) => setError(e.message),
                    }),
                  onError: (e) => setError(e.message),
                },
              );
            }}
          >
            Confirmar envío
          </Boton>
          <Boton variante="secundario" className="text-sm" onClick={onCerrar}>
            Cancelar
          </Boton>
        </div>
      )}
    </div>
  );
}

function FormularioPromocion({ onCerrar }: { onCerrar: () => void }) {
  const { supabase } = useAuth();
  const { data: stock } = useStock(supabase);
  const crear = useCrearPromocion(supabase);
  const [error, setError] = useState<string | null>(null);

  const [titulo, setTitulo] = useState('');
  const [tipoDescuento, setTipoDescuento] = useState<'porcentaje' | 'monto'>('porcentaje');
  const [valor, setValor] = useState('');
  const [alcance, setAlcance] = useState<'todo' | 'categoria' | 'producto'>('todo');
  const [categoria, setCategoria] = useState('');
  const [productoId, setProductoId] = useState('');
  const [desde, setDesde] = useState(hoyCivil());
  const [hasta, setHasta] = useState('');

  const categorias = [
    ...new Set((stock ?? []).map((p) => p.categoria).filter(Boolean)),
  ] as string[];

  return (
    <form
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(valor.replace(',', '.'));
        if (!titulo.trim()) {
          setError('Poné un título');
          return;
        }
        if (!n || n <= 0) {
          setError('Poné el valor del descuento');
          return;
        }
        if (tipoDescuento === 'porcentaje' && n > 100) {
          setError('Un porcentaje no puede pasar de 100');
          return;
        }
        if (alcance === 'categoria' && !categoria) {
          setError('Elegí la categoría');
          return;
        }
        if (alcance === 'producto' && !productoId) {
          setError('Elegí el producto');
          return;
        }
        if (!desde || !hasta) {
          setError('Completá las fechas');
          return;
        }
        if (hasta < desde) {
          setError('La fecha de fin no puede ser anterior al inicio');
          return;
        }
        setError(null);
        const datos: DatosPromocion = {
          titulo: titulo.trim(),
          tipoDescuento,
          valor: n,
          alcance,
          ...(alcance === 'categoria' && { categoria }),
          ...(alcance === 'producto' && { productoId }),
          desde,
          hasta,
        };
        crear.mutate(datos, { onSuccess: onCerrar, onError: (e2) => setError(e2.message) });
      }}
    >
      <h2 className="font-medium">Nueva promoción</h2>

      <div className="mt-3">
        <Campo id="pr-titulo" etiqueta="Título" ayuda="Lo que ve el tutor en la tienda">
          <Entrada
            id="pr-titulo"
            autoFocus
            maxLength={80}
            value={titulo}
            placeholder="20% off en vacunas"
            onChange={(e) => setTitulo(e.target.value)}
          />
        </Campo>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="pr-tipo" etiqueta="Tipo de descuento">
          <Seleccion
            id="pr-tipo"
            value={tipoDescuento}
            onChange={(e) => setTipoDescuento(e.target.value as 'porcentaje' | 'monto')}
          >
            <option value="porcentaje">Porcentaje</option>
            <option value="monto">Monto fijo</option>
          </Seleccion>
        </Campo>
        <Campo id="pr-valor" etiqueta={tipoDescuento === 'porcentaje' ? 'Porcentaje' : 'Monto ($)'}>
          <Entrada
            id="pr-valor"
            inputMode="decimal"
            value={valor}
            placeholder={tipoDescuento === 'porcentaje' ? '20' : '1000'}
            onChange={(e) => setValor(e.target.value)}
          />
        </Campo>
      </div>

      <div className="mt-3">
        <Campo id="pr-alcance" etiqueta="A qué aplica">
          <Seleccion
            id="pr-alcance"
            value={alcance}
            onChange={(e) => setAlcance(e.target.value as 'todo' | 'categoria' | 'producto')}
          >
            <option value="todo">Todo el catálogo</option>
            <option value="categoria">Una categoría</option>
            <option value="producto">Un producto puntual</option>
          </Seleccion>
        </Campo>
      </div>

      {alcance === 'categoria' && (
        <div className="mt-3">
          <Campo id="pr-categoria" etiqueta="Categoría">
            <Seleccion
              id="pr-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Elegir…</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Seleccion>
          </Campo>
        </div>
      )}

      {alcance === 'producto' && (
        <div className="mt-3">
          <Campo id="pr-producto" etiqueta="Producto">
            <Seleccion
              id="pr-producto"
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
            >
              <option value="">Elegir…</option>
              {(stock ?? []).map((p) => (
                <option key={p.producto_id} value={p.producto_id}>
                  {p.nombre}
                </option>
              ))}
            </Seleccion>
          </Campo>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="pr-desde" etiqueta="Desde">
          <Entrada
            id="pr-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </Campo>
        <Campo id="pr-hasta" etiqueta="Hasta">
          <Entrada
            id="pr-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </Campo>
      </div>

      {error && (
        <div className="mt-4">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton type="submit" cargando={crear.isPending}>
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
