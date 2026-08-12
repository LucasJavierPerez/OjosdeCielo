import { ROLES_CLINICA } from '@ojosdecielo/core';
import { RutaProtegida } from '@ojosdecielo/ui/auth';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Equipo } from './paginas/Equipo.js';
import { FichaPaciente } from './paginas/FichaPaciente.js';
import { Ingresar } from './paginas/Ingresar.js';
import { NuevoPaciente } from './paginas/NuevoPaciente.js';
import { Pacientes } from './paginas/Pacientes.js';
import { SinAcceso } from './paginas/SinAcceso.js';

function Interna({ children }: { children: ReactNode }) {
  return <RutaProtegida rolesPermitidos={ROLES_CLINICA}>{children}</RutaProtegida>;
}

export function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/sin-acceso" element={<SinAcceso />} />

      {/* Pacientes es lo primero que necesita el personal al abrir el panel.
          La agenda pasa a ser el inicio cuando exista (fase 5). */}
      <Route path="/" element={<Navigate to="/pacientes" replace />} />
      <Route
        path="/pacientes"
        element={
          <Interna>
            <Pacientes />
          </Interna>
        }
      />
      <Route
        path="/pacientes/nuevo"
        element={
          <Interna>
            <NuevoPaciente />
          </Interna>
        }
      />
      <Route
        path="/pacientes/:id"
        element={
          <Interna>
            <FichaPaciente />
          </Interna>
        }
      />

      <Route
        path="/equipo"
        element={
          <Interna>
            <Equipo />
          </Interna>
        }
      />

      <Route path="*" element={<Navigate to="/pacientes" replace />} />
    </Routes>
  );
}
