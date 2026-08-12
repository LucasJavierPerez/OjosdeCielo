import { RutaProtegida } from '@ojosdecielo/ui/auth';
import { Route, Routes } from 'react-router';
import { AvisoActualizacion } from './componentes/AvisoActualizacion.js';
import { Ingresar } from './paginas/Ingresar.js';
import { Inicio } from './paginas/Inicio.js';
import { Instalar } from './paginas/Instalar.js';
import { NoEncontrado } from './paginas/NoEncontrado.js';
import { Registrarse } from './paginas/Registrarse.js';

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
            <RutaProtegida rolesPermitidos={['cliente']}>
              <Inicio />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<NoEncontrado />} />
      </Routes>
    </>
  );
}
