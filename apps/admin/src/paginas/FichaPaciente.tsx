import {
  calcularEdad,
  ETIQUETA_ANTECEDENTE,
  ETIQUETA_APLICACION,
  ETIQUETA_ESPECIE,
  ETIQUETA_SEXO,
  esPersonalClinica,
  estadoVencimiento,
  formatearFecha,
  formatearFechaCivil,
  puedeCargarHistoriaClinica,
  type TipoAntecedente,
  type TipoAplicacion,
} from '@ojosdecielo/core';
import { Boton, Cargando, cn, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import { Historial } from '../features/clinica/Historial.js';
import {
  type EpisodioTipo,
  type InternacionResumen,
  useInternacionesDePaciente,
} from '../features/internaciones/api.js';
import { IniciarInternacion } from '../features/internaciones/IniciarInternacion.js';
import {
  usePaciente,
  useSaludPaciente,
  useTutoresPaciente,
  useVerificarRegistro,
} from '../features/pacientes/api.js';
import { CrearCuentaTutor } from '../features/pacientes/CrearCuentaTutor.js';
import {
  AccionesRegistro,
  FormularioAplicacion,
  FormularioMedicacion,
  FormularioPeso,
  type TablaSalud,
} from '../features/pacientes/EdicionSalud.js';
import { EditarContacto } from '../features/pacientes/EditarContacto.js';
import { EditarPaciente } from '../features/pacientes/EditarPaciente.js';
import { FormularioAntecedente } from '../features/pacientes/FormularioAntecedente.js';
import { Recetario } from '../features/recetario/Recetario.js';

type TablaVerificable = 'peso_registro' | 'aplicacion' | 'antecedente' | 'medicacion_en_curso';

interface RegistroSalud {
  id: string;
  origen: string;
  verificado_por: string | null;
  descartado_en?: string | null;
  motivo_descarte?: string | null;
}

export function FichaPaciente() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase, perfil } = useAuth();
  const { data: mascota, isLoading, isError, refetch } = usePaciente(supabase, id);
  const { data: salud } = useSaludPaciente(supabase, id);
  const { data: tutores } = useTutoresPaciente(supabase, id);
  const { data: internaciones } = useInternacionesDePaciente(supabase, id);
  const episodioActivo = (tipo: EpisodioTipo) =>
    internaciones?.find((x) => x.estado === 'activa' && x.tipo === tipo) ?? null;
  const internacionActiva = episodioActivo('internacion');
  const domicilioActivo = episodioActivo('domicilio');
  const direccionTitular = tutores?.find((t) => t.rol_tutor === 'titular')?.direccion?.trim() ?? '';

  const puedoVerificar = perfil ? puedeCargarHistoriaClinica(perfil.roles) : false;
  const puedoEditarFicha = perfil ? esPersonalClinica(perfil.roles) : false;
  const [editando, setEditando] = useState<string | null>(null);
  const [creandoCuenta, setCreandoCuenta] = useState<string | null>(null);
  const [editandoPaciente, setEditandoPaciente] = useState(false);
  const [nuevoEpisodio, setNuevoEpisodio] = useState<EpisodioTipo | null>(null);

  if (isLoading) {
    return (
      <Layout>
        <Cargando />
      </Layout>
    );
  }

  if (isError || !mascota) {
    return (
      <Layout>
        <MensajeError titulo="No encontramos este paciente" onReintentar={() => void refetch()} />
      </Layout>
    );
  }

  return (
    <Layout>
      <Link to="/pacientes" className="text-sm text-slate-500 hover:text-slate-900">
        ‹ Pacientes
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{mascota.nombre}</h1>
        <p className="text-slate-600">
          {ETIQUETA_ESPECIE[mascota.especie]}
          {mascota.raza && ` · ${mascota.raza}`} · {ETIQUETA_SEXO[mascota.sexo]}
          {mascota.fecha_nacimiento && ` · ${calcularEdad(mascota.fecha_nacimiento)}`}
          {mascota.castrado !== null && ` · Castrado: ${mascota.castrado ? 'Sí' : 'No'}`}
        </p>
        {mascota.fallecido_en && (
          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">Fallecido</span>
        )}
        {puedoEditarFicha && !editandoPaciente && (
          <Boton variante="texto" className="text-sm" onClick={() => setEditandoPaciente(true)}>
            Editar
          </Boton>
        )}
        {internacionActiva && (
          <Link
            to={`/internaciones/${internacionActiva.id}`}
            className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
          >
            Internado — ver internación
          </Link>
        )}
        {domicilioActivo && (
          <Link
            to={`/domicilios/${domicilioActivo.id}`}
            className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 hover:bg-sky-200"
          >
            Visita a domicilio en curso
          </Link>
        )}
        {puedoVerificar && !nuevoEpisodio && !mascota.fallecido_en && (
          <>
            {!internacionActiva && (
              <Boton
                variante="texto"
                className="text-sm"
                onClick={() => setNuevoEpisodio('internacion')}
              >
                Internar
              </Boton>
            )}
            {!domicilioActivo && (
              <Boton
                variante="texto"
                className="text-sm"
                onClick={() => setNuevoEpisodio('domicilio')}
              >
                Atención a domicilio
              </Boton>
            )}
          </>
        )}
      </div>

      {nuevoEpisodio && (
        <IniciarInternacion
          mascotaId={id}
          tipo={nuevoEpisodio}
          direccionSugerida={direccionTitular}
          onCancelar={() => setNuevoEpisodio(null)}
        />
      )}

      {editandoPaciente && (
        <EditarPaciente
          mascotaId={id}
          datos={{
            nombre: mascota.nombre,
            especie: mascota.especie,
            raza: mascota.raza ?? '',
            sexo: mascota.sexo,
            fecha_nacimiento: mascota.fecha_nacimiento ?? '',
            castrado: mascota.castrado,
            color: mascota.color ?? '',
            microchip: mascota.microchip ?? '',
          }}
          onCerrar={() => setEditandoPaciente(false)}
        />
      )}

      {!puedoVerificar && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Estás viendo la ficha en modo lectura. Verificar datos es exclusivo del veterinario.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <h2 className="text-sm font-medium text-slate-500">Tutores</h2>
          <ul className="mt-2 space-y-2">
            {tutores?.map((t) => (
              <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                {editando === t.id ? (
                  <EditarContacto
                    mascotaId={id}
                    onCerrar={() => setEditando(null)}
                    contacto={
                      t.registrado && t.perfil_id
                        ? {
                            tipo: 'registrado',
                            perfilId: t.perfil_id,
                            datos: datosDe(t),
                          }
                        : { tipo: 'sin_cuenta', contactoId: t.id, datos: datosDe(t) }
                    }
                  />
                ) : creandoCuenta === t.id ? (
                  <CrearCuentaTutor
                    mascotaId={id}
                    onCerrar={() => setCreandoCuenta(null)}
                    prefill={{
                      nombre: t.nombre,
                      apellido: t.apellido ?? '',
                      email: t.email ?? '',
                      telefono: t.telefono ?? '',
                      dni: t.dni ?? '',
                    }}
                  />
                ) : (
                  <>
                    <p className="font-medium">
                      {t.nombre} {t.apellido}
                    </p>
                    {t.email && <p className="text-slate-500">{t.email}</p>}
                    {t.telefono && <p className="text-slate-500">{t.telefono}</p>}
                    {!t.registrado && (
                      <p className="mt-1 text-xs text-amber-700">
                        Todavía no tiene cuenta en la app.
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">
                        {t.rol_tutor === 'titular' ? 'Titular' : 'Tutor'}
                      </span>
                      <span className="flex gap-3">
                        {puedoEditarFicha && !t.registrado && (
                          <Boton
                            variante="texto"
                            className="text-xs text-marca-600"
                            onClick={() => setCreandoCuenta(t.id)}
                          >
                            Crear cuenta
                          </Boton>
                        )}
                        <Boton
                          variante="texto"
                          className="text-xs text-slate-500"
                          onClick={() => setEditando(t.id)}
                        >
                          Corregir datos
                        </Boton>
                      </span>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {mascota.microchip && (
            <>
              <h2 className="mt-6 text-sm font-medium text-slate-500">Microchip</h2>
              <p className="mt-1 font-mono text-sm">{mascota.microchip}</p>
            </>
          )}
        </section>

        <div className="space-y-6 lg:col-span-2">
          <Historial mascotaId={id} />

          <BloqueInternaciones internaciones={internaciones ?? []} />

          <Recetario mascotaId={id} />

          <BloquePeso mascotaId={id} pesos={salud?.pesos ?? []} puedoEditar={puedoVerificar} />

          <BloqueAplicaciones
            mascotaId={id}
            aplicaciones={salud?.aplicaciones ?? []}
            puedoVerificar={puedoVerificar}
          />

          <BloqueAntecedentes
            mascotaId={id}
            antecedentes={salud?.antecedentes ?? []}
            puedoVerificar={puedoVerificar}
          />

          <BloqueMedicacion
            mascotaId={id}
            medicacion={salud?.medicacion ?? []}
            puedoVerificar={puedoVerificar}
          />
        </div>
      </div>
    </Layout>
  );
}

function Bloque({
  titulo,
  vacio,
  accion,
  encabezado,
  children,
}: {
  titulo: string;
  vacio?: boolean;
  accion?: ReactNode;
  encabezado?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{titulo}</h2>
        {accion}
      </div>
      {encabezado}
      {vacio ? (
        <p className="mt-2 text-sm text-slate-400">Sin registros</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">{children}</ul>
      )}
    </section>
  );
}

/**
 * Internaciones y visitas a domicilio del paciente — parte de su historia
 * clínica: qué le pasó y por qué. La más reciente arriba, con enlace a la ficha.
 */
function BloqueInternaciones({ internaciones }: { internaciones: InternacionResumen[] }) {
  return (
    <Bloque titulo="Internaciones y visitas a domicilio" vacio={internaciones.length === 0}>
      {internaciones.map((i) => {
        const dom = i.tipo === 'domicilio';
        return (
          <li key={i.id} className="py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0">
                <span
                  className={cn(
                    'mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium',
                    dom ? 'bg-sky-100 text-sky-800' : 'bg-marca-100 text-marca-700',
                  )}
                >
                  {dom ? 'Domicilio' : 'Internación'}
                </span>
                <Link
                  to={`${dom ? '/domicilios' : '/internaciones'}/${i.id}`}
                  className="font-medium text-slate-900 hover:text-marca-700"
                >
                  {i.motivo}
                </Link>
              </span>
              <span className="text-xs text-slate-400">
                {formatearFecha(i.ingreso_en)}
                {i.egreso_en && ` – ${formatearFecha(i.egreso_en)}`}
              </span>
            </div>
            {i.diagnostico && <p className="text-slate-600">Diagnóstico: {i.diagnostico}</p>}
            {dom && i.direccion && <p className="text-xs text-slate-500">{i.direccion}</p>}
            <p className="mt-0.5 text-xs">
              {i.estado === 'activa' ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
                  {dom ? 'Visita en curso' : 'Internado ahora'}
                </span>
              ) : (
                <span className="text-slate-500">Egreso: {i.motivo_egreso ?? 'no registrado'}</span>
              )}
            </p>
          </li>
        );
      })}
    </Bloque>
  );
}

function FilaSalud({
  registro,
  mascotaId,
  tabla,
  puedoVerificar,
  principal,
  secundario,
  extra,
}: {
  registro: RegistroSalud;
  mascotaId: string;
  tabla: TablaVerificable;
  puedoVerificar: boolean;
  principal: string;
  secundario: string;
  extra?: ReactNode;
}) {
  const { supabase } = useAuth();
  const verificar = useVerificarRegistro(supabase, mascotaId);

  const esDelTutor = registro.origen === 'tutor';
  const yaVerificado = registro.verificado_por !== null;

  const descartado = Boolean(registro.descartado_en);

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p className={descartado ? 'font-medium text-slate-400 line-through' : 'font-medium'}>
          {principal}
        </p>
        <p className="text-slate-500">{secundario}</p>
        {descartado && registro.motivo_descarte && (
          <p className="mt-0.5 text-xs text-amber-700">Descartado: {registro.motivo_descarte}</p>
        )}
        {extra}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Un peso reportado por el dueño no tiene el mismo valor clínico que
            uno medido en la balanza del consultorio: la diferencia se ve acá. */}
        {esDelTutor ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] font-medium',
              yaVerificado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800',
            )}
          >
            {yaVerificado ? 'Verificado' : 'Reportado por el tutor'}
          </span>
        ) : (
          <span className="rounded bg-marca-100 px-1.5 py-0.5 text-[11px] font-medium text-marca-700">
            Clínica
          </span>
        )}

        {esDelTutor && !yaVerificado && puedoVerificar && !descartado && (
          <Boton
            variante="texto"
            className="text-xs"
            cargando={verificar.isPending}
            onClick={() => verificar.mutate({ tabla, id: registro.id })}
          >
            Verificar
          </Boton>
        )}

        <AccionesRegistro
          tabla={tabla as TablaSalud}
          registro={registro}
          mascotaId={mascotaId}
          puedoEditar={puedoVerificar}
        />
      </div>
    </li>
  );
}

function BloqueAplicaciones({
  mascotaId,
  aplicaciones,
  puedoVerificar,
}: {
  mascotaId: string;
  aplicaciones: (RegistroSalud & {
    tipo: string;
    producto: string | null;
    fecha: string;
    proxima_fecha: string | null;
  })[];
  puedoVerificar: boolean;
}) {
  const [cargando, setCargando] = useState(false);

  return (
    <Bloque
      titulo="Vacunas y desparasitaciones"
      vacio={aplicaciones.length === 0}
      accion={
        // Aplicar es un acto clínico: lo carga el veterinario, no recepción.
        puedoVerificar && !cargando ? (
          <Boton variante="texto" className="text-sm" onClick={() => setCargando(true)}>
            Agregar
          </Boton>
        ) : null
      }
      encabezado={
        cargando ? (
          <FormularioAplicacion mascotaId={mascotaId} onListo={() => setCargando(false)} />
        ) : null
      }
    >
      {aplicaciones.map((a) => {
        const estado = estadoVencimiento(a.proxima_fecha);
        return (
          <FilaSalud
            key={a.id}
            registro={a}
            mascotaId={mascotaId}
            tabla="aplicacion"
            puedoVerificar={puedoVerificar}
            principal={`${ETIQUETA_APLICACION[a.tipo as TipoAplicacion]}${a.producto ? ` · ${a.producto}` : ''}`}
            secundario={formatearFechaCivil(a.fecha)}
            extra={
              a.proxima_fecha ? (
                <span
                  className={cn(
                    'text-xs',
                    estado === 'vencida' && 'font-medium text-red-700',
                    estado === 'proxima' && 'font-medium text-amber-700',
                    estado === 'al_dia' && 'text-slate-500',
                  )}
                >
                  Próxima: {formatearFechaCivil(a.proxima_fecha)}
                </span>
              ) : null
            }
          />
        );
      })}
    </Bloque>
  );
}

function BloqueMedicacion({
  mascotaId,
  medicacion,
  puedoVerificar,
}: {
  mascotaId: string;
  medicacion: (RegistroSalud & {
    descripcion: string;
    dosis: string | null;
    frecuencia_horas: number | null;
    desde: string;
  })[];
  puedoVerificar: boolean;
}) {
  const [cargando, setCargando] = useState(false);

  return (
    <Bloque
      titulo="Medicación"
      vacio={medicacion.length === 0}
      accion={
        // Indicar una medicación es un acto clínico: lo carga el veterinario.
        puedoVerificar && !cargando ? (
          <Boton variante="texto" className="text-sm" onClick={() => setCargando(true)}>
            Agregar
          </Boton>
        ) : null
      }
      encabezado={
        cargando ? (
          <FormularioMedicacion mascotaId={mascotaId} onListo={() => setCargando(false)} />
        ) : null
      }
    >
      {medicacion.map((m) => (
        <FilaSalud
          key={m.id}
          registro={m}
          mascotaId={mascotaId}
          tabla="medicacion_en_curso"
          puedoVerificar={puedoVerificar}
          principal={m.descripcion}
          secundario={`${m.dosis ?? ''}${m.dosis && m.frecuencia_horas ? ' · ' : ''}${m.frecuencia_horas ? `cada ${m.frecuencia_horas} h` : ''} · desde ${formatearFechaCivil(m.desde)}`}
        />
      ))}
    </Bloque>
  );
}

function BloqueAntecedentes({
  mascotaId,
  antecedentes,
  puedoVerificar,
}: {
  mascotaId: string;
  antecedentes: (RegistroSalud & { tipo: string; descripcion: string })[];
  puedoVerificar: boolean;
}) {
  const [cargando, setCargando] = useState(false);

  return (
    <Bloque
      titulo="Alergias y antecedentes"
      vacio={antecedentes.length === 0}
      accion={
        // Diagnosticar es del veterinario. Recepción ve, no escribe.
        puedoVerificar && !cargando ? (
          <Boton variante="texto" className="text-sm" onClick={() => setCargando(true)}>
            Agregar
          </Boton>
        ) : null
      }
      encabezado={
        cargando ? (
          <FormularioAntecedente mascotaId={mascotaId} onListo={() => setCargando(false)} />
        ) : null
      }
    >
      {antecedentes.map((a) => (
        <FilaSalud
          key={a.id}
          registro={a}
          mascotaId={mascotaId}
          tabla="antecedente"
          puedoVerificar={puedoVerificar}
          principal={ETIQUETA_ANTECEDENTE[a.tipo as TipoAntecedente]}
          secundario={a.descripcion}
        />
      ))}
    </Bloque>
  );
}

function BloquePeso({
  mascotaId,
  pesos,
  puedoEditar,
}: {
  mascotaId: string;
  pesos: (RegistroSalud & { peso_kg: number; fecha: string })[];
  puedoEditar: boolean;
}) {
  const [cargando, setCargando] = useState(false);

  return (
    <Bloque
      titulo="Peso"
      vacio={pesos.length === 0}
      accion={
        // Pesar es un acto clínico: lo registra el veterinario, no recepción.
        puedoEditar && !cargando ? (
          <Boton variante="texto" className="text-sm" onClick={() => setCargando(true)}>
            Registrar peso
          </Boton>
        ) : null
      }
      encabezado={
        cargando ? (
          <FormularioPeso mascotaId={mascotaId} onListo={() => setCargando(false)} />
        ) : null
      }
    >
      {pesos.map((p) => (
        <FilaSalud
          key={p.id}
          registro={p}
          mascotaId={mascotaId}
          tabla="peso_registro"
          puedoVerificar={puedoEditar}
          principal={`${Number(p.peso_kg)} kg`}
          secundario={formatearFechaCivil(p.fecha)}
        />
      ))}
    </Bloque>
  );
}

/** Los campos del contacto tal como los espera el formulario de edición. */
function datosDe(c: {
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  email: string | null;
  dni: string | null;
  direccion: string | null;
}) {
  return {
    nombre: c.nombre,
    apellido: c.apellido ?? '',
    telefono: c.telefono ?? '',
    email: c.email ?? '',
    dni: c.dni ?? '',
    direccion: c.direccion ?? '',
  };
}
