import { ROLES_CLINICA } from '@ojosdecielo/core';
import { RutaProtegida } from '@ojosdecielo/ui/auth';
import { Route, Routes } from 'react-router';
import { Escritorio } from './paginas/Escritorio.js';
import { Ingresar } from './paginas/Ingresar.js';
import { SinAcceso } from './paginas/SinAcceso.js';

export function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/sin-acceso" element={<SinAcceso />} />
      <Route
        path="/"
        element={
          <RutaProtegida rolesPermitidos={ROLES_CLINICA}>
            <Escritorio />
          </RutaProtegida>
        }
      />
    </Routes>
  );
}
