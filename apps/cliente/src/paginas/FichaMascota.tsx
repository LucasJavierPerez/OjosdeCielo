import {
  calcularEdad,
  ETIQUETA_ESPECIE,
  ETIQUETA_SEXO,
  formatearFechaCivil,
} from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { useActualizarMascota, useMascota } from '../features/mascotas/api.js';
import { FormularioMascota } from '../features/mascotas/FormularioMascota.js';
import { SubirFotoMascota } from '../features/mascotas/FotoMascota.js';

export function FichaMascota() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const { data: mascota, isLoading, isError, refetch } = useMascota(supabase, id);
  const actualizar = useActualizarMascota(supabase, id ?? '');
  const [editando, setEditando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  if (isLoading) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="" volverA="/" />
        <Cargando />
      </main>
    );
  }

  // Una mascota ajena no da 403 sino lista vacía: RLS la filtra y el usuario
  // nunca se entera de que existe. Eso es deliberado.
  if (isError || !mascota) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Mascota" volverA="/" />
        <div className="mt-4">
          <MensajeError
            titulo="No encontramos esta mascota"
            detalle="Puede que se haya archivado o que ya no tengas acceso."
            onReintentar={() => void refetch()}
          />
        </div>
      </main>
    );
  }

  if (editando) {
    return (
      <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo={`Editar ${mascota.nombre}`} volverA={`/mascotas/${mascota.id}`} />
        <div className="mt-6">
          <FormularioMascota
            textoBoton="Guardar cambios"
            enviando={actualizar.isPending}
            errorEnvio={errorGuardar}
            onCancelar={() => setEditando(false)}
            valoresIniciales={{
              nombre: mascota.nombre,
              especie: mascota.especie,
              sexo: mascota.sexo,
              raza: mascota.raza ?? '',
              color: mascota.color ?? '',
              microchip: mascota.microchip ?? '',
              fecha_nacimiento: mascota.fecha_nacimiento ?? '',
              castrado: mascota.castrado ?? false,
            }}
            onEnviar={(datos) => {
              setErrorGuardar(null);
              actualizar.mutate(datos, {
                onSuccess: () => setEditando(false),
                onError: () => setErrorGuardar('No pudimos guardar los cambios. Probá de nuevo.'),
              });
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado
        titulo={mascota.nombre}
        volverA="/"
        accion={
          <Boton variante="texto" onClick={() => setEditando(true)}>
            Editar
          </Boton>
        }
      />

      <div className="mt-6">
        <SubirFotoMascota
          mascotaId={mascota.id}
          fotoUrl={mascota.foto_url}
          nombre={mascota.nombre}
        />
      </div>

      <dl className="mt-8 divide-y divide-slate-100">
        <Dato etiqueta="Especie" valor={ETIQUETA_ESPECIE[mascota.especie]} />
        {mascota.raza && <Dato etiqueta="Raza" valor={mascota.raza} />}
        <Dato etiqueta="Sexo" valor={ETIQUETA_SEXO[mascota.sexo]} />
        {mascota.fecha_nacimiento && (
          <Dato
            etiqueta="Nacimiento"
            valor={`${formatearFechaCivil(mascota.fecha_nacimiento)} · ${calcularEdad(mascota.fecha_nacimiento)}`}
          />
        )}
        {mascota.color && <Dato etiqueta="Color" valor={mascota.color} />}
        {mascota.castrado !== null && (
          <Dato etiqueta="Castrado" valor={mascota.castrado ? 'Sí' : 'No'} />
        )}
        {mascota.microchip && <Dato etiqueta="Microchip" valor={mascota.microchip} />}
      </dl>

      <nav className="mt-8 space-y-2">
        <EnlaceFicha
          a={`/mascotas/${mascota.id}/salud`}
          titulo="Salud"
          detalle="Peso, vacunas, alergias y medicación"
        />
        <EnlaceFicha
          a={`/mascotas/${mascota.id}/tutores`}
          titulo="Quién accede"
          detalle="Compartir el cuidado con otra persona"
        />
        <EnlaceFicha
          a={`/mascotas/${mascota.id}/ajustes`}
          titulo="Ajustes"
          detalle="Archivar, registrar fallecimiento o eliminar"
        />
      </nav>
    </main>
  );
}

function EnlaceFicha({ a, titulo, detalle }: { a: string; titulo: string; detalle: string }) {
  return (
    <Link
      to={a}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block font-medium">{titulo}</span>
        <span className="block text-sm text-slate-500">{detalle}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-slate-400">
        ›
      </span>
    </Link>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
      <dd className="text-sm font-medium text-slate-900">{valor}</dd>
    </div>
  );
}
