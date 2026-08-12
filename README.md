# Ojos de Cielo

PWA de gestión veterinaria: aplicación para tutores de mascotas y panel interno de la clínica.

Se instala en el celular sin pasar por las tiendas de aplicaciones.

## Estado

En planificación. Arquitectura definida, sin código todavía.

## Documentación

| Documento | Contenido |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Guía del repositorio: estructura, comandos, reglas y convenciones |
| [`docs/stack.md`](docs/stack.md) | Stack y decisiones de arquitectura, con las alternativas descartadas |
| [`docs/modelo-datos.md`](docs/modelo-datos.md) | Esquema de base de datos |
| [`docs/roadmap.md`](docs/roadmap.md) | Fases de desarrollo y alcance |
| [`plan.md`](plan.md) | Plan original del producto |

## Stack

React + Vite + TypeScript · Tailwind + shadcn/ui · TanStack Query · Supabase (Postgres, Auth, Storage, RLS, Edge Functions) · Web Push · MercadoPago

Monorepo con pnpm + Turborepo: `apps/cliente` (PWA para tutores) y `apps/admin` (panel de la clínica).

## Dos ideas que ordenan el proyecto

**La app del cliente no depende de la clínica.** El tutor carga los datos de salud de su mascota por su cuenta, así que las primeras fases se lanzan con la veterinaria todavía usando su sistema anterior.

**Una mascota puede tener varios tutores.** Ambos ven los mismos datos y cualquiera puede gestionar los turnos.
