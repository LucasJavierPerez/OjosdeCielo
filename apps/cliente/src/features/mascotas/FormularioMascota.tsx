import { zodResolver } from '@hookform/resolvers/zod';
import {
  type DatosMascota,
  ESPECIES,
  ETIQUETA_ESPECIE,
  ETIQUETA_SEXO,
  mascotaSchema,
  SEXOS,
} from '@ojosdecielo/core';
import { Boton, Campo, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useForm } from 'react-hook-form';

export function FormularioMascota({
  valoresIniciales,
  onEnviar,
  enviando,
  errorEnvio,
  textoBoton = 'Guardar',
  onCancelar,
}: {
  valoresIniciales?: Partial<DatosMascota>;
  onEnviar: (datos: DatosMascota) => void;
  enviando?: boolean;
  errorEnvio?: string | null;
  textoBoton?: string;
  onCancelar?: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosMascota>({
    resolver: zodResolver(mascotaSchema),
    defaultValues: {
      nombre: '',
      especie: 'perro',
      sexo: 'desconocido',
      raza: '',
      color: '',
      microchip: '',
      fecha_nacimiento: '',
      ...valoresIniciales,
    },
  });

  return (
    <form onSubmit={handleSubmit(onEnviar)} className="space-y-4" noValidate>
      <Campo id="nombre" etiqueta="Nombre" error={errors.nombre?.message}>
        <Entrada id="nombre" autoComplete="off" autoFocus {...register('nombre')} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="especie" etiqueta="Especie" error={errors.especie?.message}>
          <Seleccion id="especie" {...register('especie')}>
            {ESPECIES.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESPECIE[e]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo id="sexo" etiqueta="Sexo" error={errors.sexo?.message}>
          <Seleccion id="sexo" {...register('sexo')}>
            {SEXOS.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_SEXO[s]}
              </option>
            ))}
          </Seleccion>
        </Campo>
      </div>

      <Campo id="raza" etiqueta="Raza" ayuda="Opcional" error={errors.raza?.message}>
        <Entrada id="raza" autoComplete="off" {...register('raza')} />
      </Campo>

      <Campo
        id="fecha_nacimiento"
        etiqueta="Fecha de nacimiento"
        ayuda="Si no la sabés con precisión, poné una aproximada"
        error={errors.fecha_nacimiento?.message}
      >
        <Entrada id="fecha_nacimiento" type="date" {...register('fecha_nacimiento')} />
      </Campo>

      <Campo id="color" etiqueta="Color" ayuda="Opcional" error={errors.color?.message}>
        <Entrada id="color" autoComplete="off" {...register('color')} />
      </Campo>

      <Campo
        id="microchip"
        etiqueta="Microchip"
        ayuda="Si tiene. Entre 9 y 15 números"
        error={errors.microchip?.message}
      >
        <Entrada id="microchip" inputMode="numeric" autoComplete="off" {...register('microchip')} />
      </Campo>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          {...register('castrado')}
          className="size-5 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">Está castrado/a</span>
      </label>

      {errorEnvio && <MensajeError detalle={errorEnvio} />}

      <div className="flex gap-3 pt-2">
        <Boton type="submit" cargando={enviando} className="flex-1">
          {textoBoton}
        </Boton>
        {onCancelar && (
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        )}
      </div>
    </form>
  );
}
