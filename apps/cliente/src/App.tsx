import { RutaProtegida } from '@ojosdecielo/ui/auth';
import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { AvisoActualizacion } from './componentes/AvisoActualizacion.js';
import { AceptarInvitacion } from './paginas/AceptarInvitacion.js';
import { AjustesMascota } from './paginas/AjustesMascota.js';
import { FichaMascota } from './paginas/FichaMascota.js';
import { IdentidadMascota } from './paginas/IdentidadMascota.js';
import { Ingresar } from './paginas/Ingresar.js';
import { Inicio } from './paginas/Inicio.js';
import { Instalar } from './paginas/Instalar.js';
import { MascotaPublica } from './paginas/MascotaPublica.js';
import { MisTurnos } from './paginas/MisTurnos.js';
import { NoEncontrado } from './paginas/NoEncontrado.js';
import { Notificaciones } from './paginas/Notificaciones.js';
import { NuevaMascota } from './paginas/NuevaMascota.js';
import { NuevoTurno } from './paginas/NuevoTurno.js';
import { OrdenCompra } from './paginas/OrdenCompra.js';
import { Registrarse } from './paginas/Registrarse.js';
import { SaludMascota } from './paginas/SaludMascota.js';
import { SinAcceso } from './paginas/SinAcceso.js';
import { Tienda } from './paginas/Tienda.js';
import { TutoresMascota } from './paginas/TutoresMascota.js';

/** Atajo para no repetir el envoltorio en cada ruta de cliente. */
function Privada({ children }: { children: ReactNode }) {
  return <RutaProtegida rolesPermitidos={['cliente']}>{children}</RutaProtegida>;
}

export function App() {
  return (
    <>
      <AvisoActualizacion />
      <Routes>
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/registrarse" element={<Registrarse />} />
        <Route path="/instalar" element={<Instalar />} />
        <Route path="/sin-acceso" element={<SinAcceso />} />

        {/* Pública a propósito: la abre quien encontró a la mascota, que no
            tiene cuenta ni motivo para crearla. */}
        <Route path="/m/:token" element={<MascotaPublica />} />

        <Route
          path="/"
          element={
            <Privada>
              <Inicio />
            </Privada>
          }
        />
        <Route
          path="/mascotas/nueva"
          element={
            <Privada>
              <NuevaMascota />
            </Privada>
          }
        />
        <Route
          path="/mascotas/:id"
          element={
            <Privada>
              <FichaMascota />
            </Privada>
          }
        />
        <Route
          path="/mascotas/:id/salud"
          element={
            <Privada>
              <SaludMascota />
            </Privada>
          }
        />
        <Route
          path="/mascotas/:id/identidad"
          element={
            <Privada>
              <IdentidadMascota />
            </Privada>
          }
        />
        <Route
          path="/mascotas/:id/ajustes"
          element={
            <Privada>
              <AjustesMascota />
            </Privada>
          }
        />
        <Route
          path="/mascotas/:id/tutores"
          element={
            <Privada>
              <TutoresMascota />
            </Privada>
          }
        />
        <Route
          path="/invitacion/:token"
          element={
            <Privada>
              <AceptarInvitacion />
            </Privada>
          }
        />

        <Route
          path="/turnos"
          element={
            <Privada>
              <MisTurnos />
            </Privada>
          }
        />
        <Route
          path="/turnos/nuevo"
          element={
            <Privada>
              <NuevoTurno />
            </Privada>
          }
        />
        <Route
          path="/tienda"
          element={
            <Privada>
              <Tienda />
            </Privada>
          }
        />
        <Route
          path="/tienda/orden/:id"
          element={
            <Privada>
              <OrdenCompra />
            </Privada>
          }
        />
        <Route
          path="/recordatorios"
          element={
            <Privada>
              <Notificaciones />
            </Privada>
          }
        />

        <Route path="*" element={<NoEncontrado />} />
      </Routes>
    </>
  );
}
