import { RutaProtegida } from '@ojosdecielo/ui/auth';
import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { AvisoActualizacion } from './componentes/AvisoActualizacion.js';
import { FichaMascota } from './paginas/FichaMascota.js';
import { Ingresar } from './paginas/Ingresar.js';
import { Inicio } from './paginas/Inicio.js';
import { Instalar } from './paginas/Instalar.js';
import { NoEncontrado } from './paginas/NoEncontrado.js';
import { NuevaMascota } from './paginas/NuevaMascota.js';
import { Registrarse } from './paginas/Registrarse.js';

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

        <Route path="*" element={<NoEncontrado />} />
      </Routes>
    </>
  );
}
