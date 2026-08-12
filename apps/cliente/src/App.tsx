import { RutaProtegida } from '@ojosdecielo/ui/auth';
import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { AvisoActualizacion } from './componentes/AvisoActualizacion.js';
import { AceptarInvitacion } from './paginas/AceptarInvitacion.js';
import { FichaMascota } from './paginas/FichaMascota.js';
import { Ingresar } from './paginas/Ingresar.js';
import { Inicio } from './paginas/Inicio.js';
import { Instalar } from './paginas/Instalar.js';
import { NoEncontrado } from './paginas/NoEncontrado.js';
import { NuevaMascota } from './paginas/NuevaMascota.js';
import { Registrarse } from './paginas/Registrarse.js';
import { SaludMascota } from './paginas/SaludMascota.js';
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

        <Route path="*" element={<NoEncontrado />} />
      </Routes>
    </>
  );
}
