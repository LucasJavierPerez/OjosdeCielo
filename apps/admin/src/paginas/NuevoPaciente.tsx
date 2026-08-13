import { ESPECIES, ETIQUETA_ESPECIE, ETIQUETA_SEXO, hoyCivil, SEXOS } from '@ojosdecielo/core';
import type { Especie, SexoMascota } from '@ojosdecielo/db';
import { Boton, Campo, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import { type DatosPaciente, useCrearPaciente } from '../features/clinica/api.js';

export function NuevoPaciente() {
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const crear = useCrearPaciente(supabase);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState<DatosPaciente>({
    nombre: '',
    especie: 'perro',
    sexo: 'desconocido',
    raza: '',
    fecha_nacimiento: '',
    microchip: '',
    tutor_nombre: '',
    tutor_apellido: '',
    tutor_email: '',
    tutor_telefono: '',
    tutor_dni: '',
  });

  const set = (campo: keyof DatosPaciente) => (v: string) => setD({ ...d, [campo]: v });

  return (
    <Layout>
      <Link to="/pacientes" className="text-sm text-slate-500 hover:text-slate-900">
        ‹ Pacientes
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Nuevo paciente</h1>

      <form
        className="mt-6 max-w-2xl"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!d.nombre.trim() || !d.tutor_nombre.trim()) {
            setError('El nombre de la mascota y el del tutor son obligatorios');
            return;
          }
          setError(null);
          crear.mutate(d, {
            onSuccess: (m) => void navigate(`/pacientes/${m.id}`),
            onError: (err) => setError(err.message),
          });
        }}
      >
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Mascota</h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo id="nombre" etiqueta="Nombre">
              <Entrada
                id="nombre"
                autoFocus
                required
                value={d.nombre}
                onChange={(e) => set('nombre')(e.target.value)}
              />
            </Campo>
            <Campo id="especie" etiqueta="Especie">
              <Seleccion
                id="especie"
                value={d.especie}
                onChange={(e) => setD({ ...d, especie: e.target.value as Especie })}
              >
                {ESPECIES.map((x) => (
                  <option key={x} value={x}>
                    {ETIQUETA_ESPECIE[x]}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Campo id="raza" etiqueta="Raza" ayuda="Opcional">
              <Entrada id="raza" value={d.raza} onChange={(e) => set('raza')(e.target.value)} />
            </Campo>
            <Campo id="sexo" etiqueta="Sexo">
              <Seleccion
                id="sexo"
                value={d.sexo}
                onChange={(e) => setD({ ...d, sexo: e.target.value as SexoMascota })}
              >
                {SEXOS.map((x) => (
                  <option key={x} value={x}>
                    {ETIQUETA_SEXO[x]}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo id="nacimiento" etiqueta="Nacimiento" ayuda="Aproximada sirve">
              <Entrada
                id="nacimiento"
                type="date"
                max={hoyCivil()}
                value={d.fecha_nacimiento}
                onChange={(e) => set('fecha_nacimiento')(e.target.value)}
              />
            </Campo>
          </div>

          <div className="mt-3">
            <Campo id="microchip" etiqueta="Microchip" ayuda="Opcional">
              <Entrada
                id="microchip"
                inputMode="numeric"
                value={d.microchip}
                onChange={(e) => set('microchip')(e.target.value)}
              />
            </Campo>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Tutor</h2>
          <p className="mt-1 text-sm text-slate-600">
            No hace falta que use la app. Si más adelante se registra con este email, se vincula
            solo y ve toda la historia que hayas cargado.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo id="tutor_nombre" etiqueta="Nombre">
              <Entrada
                id="tutor_nombre"
                required
                value={d.tutor_nombre}
                onChange={(e) => set('tutor_nombre')(e.target.value)}
              />
            </Campo>
            <Campo id="tutor_apellido" etiqueta="Apellido">
              <Entrada
                id="tutor_apellido"
                value={d.tutor_apellido}
                onChange={(e) => set('tutor_apellido')(e.target.value)}
              />
            </Campo>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Campo id="tutor_telefono" etiqueta="Teléfono">
              <Entrada
                id="tutor_telefono"
                type="tel"
                value={d.tutor_telefono}
                onChange={(e) => set('tutor_telefono')(e.target.value)}
              />
            </Campo>
            <Campo id="tutor_email" etiqueta="Email" ayuda="Para que pueda vincularse después">
              <Entrada
                id="tutor_email"
                type="email"
                value={d.tutor_email}
                onChange={(e) => set('tutor_email')(e.target.value)}
              />
            </Campo>
            <Campo id="tutor_dni" etiqueta="DNI" ayuda="Opcional">
              <Entrada
                id="tutor_dni"
                inputMode="numeric"
                value={d.tutor_dni}
                onChange={(e) => set('tutor_dni')(e.target.value)}
              />
            </Campo>
          </div>
        </section>

        {error && (
          <div className="mt-4">
            <MensajeError detalle={error} />
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Boton type="submit" cargando={crear.isPending}>
            Dar de alta
          </Boton>
          <Boton variante="secundario" onClick={() => void navigate('/pacientes')}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Layout>
  );
}
