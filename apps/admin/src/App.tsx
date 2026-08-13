import { ROLES_CLINICA } from '@ojosdecielo/core';
import { RutaProtegida } from '@ojosdecielo/ui/auth';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Agenda } from './paginas/Agenda.js';
import { Caja } from './paginas/Caja.js';
import { Equipo } from './paginas/Equipo.js';
import { FichaPaciente } from './paginas/FichaPaciente.js';
import { Ingresar } from './paginas/Ingresar.js';
import { Inventario } from './paginas/Inventario.js';
import { NuevoPaciente } from './paginas/NuevoPaciente.js';
import { Pacientes } from './paginas/Pacientes.js';
import { Reposiciones } from './paginas/Reposiciones.js';
import { SinAcceso } from './paginas/SinAcceso.js';

function Interna({ children }: { children: ReactNode }) {
  return <RutaProtegida rolesPermitidos={ROLES_CLINICA}>{children}</RutaProtegida>;
}

export function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/sin-acceso" element={<SinAcceso />} />

      {/* La agenda del día es lo primero que mira el personal al llegar. */}
      <Route path="/" element={<Navigate to="/agenda" replace />} />
      <Route
        path="/agenda"
        element={
          <Interna>
            <Agenda />
          </Interna>
        }
      />
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
        path="/reposiciones"
        element={
          <Interna>
            <Reposiciones />
          </Interna>
        }
      />
      <Route
        path="/caja"
        element={
          <Interna>
            <Caja />
          </Interna>
        }
      />
      <Route
        path="/inventario"
        element={
          <Interna>
            <Inventario />
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

      <Route path="*" element={<Navigate to="/agenda" replace />} />
    </Routes>
  );
}
