import { useEffect, useState } from 'react';

/**
 * Instrucciones de instalación.
 *
 * En iOS no existe `beforeinstallprompt`: no hay banner ni botón posible, hay
 * que enseñarle al usuario a hacerlo a mano (docs/stack.md, Decisión 1). Como
 * las notificaciones push en iOS sólo funcionan con la app instalada, esta
 * pantalla es parte del producto, no un detalle técnico.
 */

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function Instalar() {
  const [eventoInstalacion, setEventoInstalacion] = useState<EventoInstalacion | null>(null);
  const [yaInstalada, setYaInstalada] = useState(false);

  useEffect(() => {
    setYaInstalada(
      globalThis.matchMedia('(display-mode: standalone)').matches ||
        // Safari en iOS expone esto en lugar de display-mode.
        (navigator as { standalone?: boolean }).standalone === true,
    );

    function alPoderInstalar(e: Event) {
      e.preventDefault();
      setEventoInstalacion(e as EventoInstalacion);
    }

    globalThis.addEventListener('beforeinstallprompt', alPoderInstalar);
    return () => globalThis.removeEventListener('beforeinstallprompt', alPoderInstalar);
  }, []);

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (yaInstalada) {
    return (
      <Contenedor>
        <h1 className="text-2xl font-semibold">Ya tenés la app instalada</h1>
        <p className="mt-2 text-slate-600">
          Podés recibir recordatorios de vacunas, desparasitaciones y turnos.
        </p>
      </Contenedor>
    );
  }

  return (
    <Contenedor>
      <h1 className="text-2xl font-semibold">Instalá la app</h1>
      <p className="mt-2 text-slate-600">
        Instalada, la app entra directo desde tu pantalla de inicio y puede avisarte cuando le toca
        una vacuna o una desparasitación a tu mascota.
      </p>

      {eventoInstalacion ? (
        <button
          type="button"
          onClick={async () => {
            await eventoInstalacion.prompt();
            const { outcome } = await eventoInstalacion.userChoice;
            if (outcome === 'accepted') setYaInstalada(true);
            setEventoInstalacion(null);
          }}
          className="mt-6 w-full rounded-lg bg-marca-600 px-4 py-3 font-medium text-white hover:bg-marca-700"
        >
          Instalar ahora
        </button>
      ) : esIOS ? (
        <ol className="mt-6 space-y-4 text-slate-700">
          <Paso numero={1}>
            Tocá el botón <strong>Compartir</strong> en la barra de Safari — el cuadrado con la
            flecha hacia arriba.
          </Paso>
          <Paso numero={2}>
            Deslizá hacia abajo y elegí <strong>Agregar a inicio</strong>.
          </Paso>
          <Paso numero={3}>
            Tocá <strong>Agregar</strong>. La app te queda junto al resto.
          </Paso>
        </ol>
      ) : (
        <p className="mt-6 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
          Buscá la opción <strong>Instalar aplicación</strong> o <strong>Agregar a inicio</strong>{' '}
          en el menú de tu navegador.
        </p>
      )}
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-12">{children}</main>
  );
}

function Paso({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marca-100 text-sm font-semibold text-marca-700">
        {numero}
      </span>
      <span>{children}</span>
    </li>
  );
}
