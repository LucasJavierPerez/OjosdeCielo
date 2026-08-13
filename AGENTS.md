# Ojos de Cielo — Guía del repositorio

PWA de gestión veterinaria: app para tutores de mascotas + panel interno de la clínica.

Documentación de referencia — **leerla antes de decisiones de arquitectura, no re-derivarla**:
- `docs/stack.md` — stack y decisiones tomadas, con alternativas descartadas
- `docs/modelo-datos.md` — esquema de base de datos y convenciones
- `docs/roadmap.md` — fases y alcance
- `plan.md` — plan original del producto (documento del dueño, no editar)

---

## Estructura

```
apps/cliente/     PWA instalable — tutores
apps/admin/       Panel interno — recepción, veterinarios, administración
packages/db/      Migraciones, políticas RLS, tipos generados
packages/core/    Dominio compartido: esquemas Zod, reglas de negocio
packages/ui/      Componentes compartidos
supabase/         Migraciones y Edge Functions
docs/             Arquitectura
```

## Puesta en marcha

Requiere Node 22+, pnpm y Docker Desktop corriendo.

```bash
pnpm install
pnpm db:start                 # levanta Postgres local e imprime las claves
cp .env.example .env          # pegar ahí la anon key que imprimió db:start
pnpm dev
```

**Son dos apps distintas, en dos direcciones distintas:**

| | Dirección | Para quién |
|---|---|---|
| App de tutores | `localhost:5173` | Clientes de la clínica |
| Panel | `localhost:5174` | Veterinarios, recepción, administración |

`pnpm dev` levanta las dos. Para una sola: `pnpm dev:tutores` o `pnpm dev:panel`.
Supabase Studio queda en `localhost:54323`.

Un usuario del personal que entra a `5173` ve una pantalla que lo manda al panel:
no es un error, son públicos distintos.

## Comandos

```bash
pnpm dev                              # ambas apps
pnpm dev:tutores / pnpm dev:panel   # una sola
pnpm typecheck                        # obligatorio antes de dar algo por terminado
pnpm lint                             # Biome (lint + formato)
pnpm lint:fix                         # aplica lo que se puede arreglar solo
pnpm test                             # Vitest
pnpm build

pnpm db:start                 # Postgres local vía Docker
pnpm db:stop
pnpm db:reset                 # reaplica todas las migraciones desde cero
pnpm db:new <nombre>          # crea una migración vacía
pnpm db:types                 # regenera packages/db/src/database.types.ts
pnpm test:rls                 # verifica el aislamiento entre roles y clientes
```

**`pnpm test:rls` se corre después de cualquier cambio en políticas RLS**, y se
amplía con un caso nuevo por cada política nueva. Vive en `supabase/tests/rls.mjs`
y usa la anon key, igual que el navegador: prueba el sistema como lo ve un
atacante. Consultar la base como `postgres` no sirve para esto — postgres
bypassa RLS y todo parece correcto.

Usuarios del seed local (contraseña `password123` en todos):
`admin@`, `vet@`, `recepcion@` `ojosdecielo.test` · `ana@`, `bruno@`, `clara@` `ejemplo.test`

`database.types.ts` es **generado**: no se edita a mano. Después de cualquier
migración, correr `pnpm db:types`.

**Edge Functions**

```bash
pnpm exec supabase functions serve --env-file supabase/functions/.env
pnpm exec supabase secrets set --env-file supabase/functions/.env   # producción
```

La clave privada VAPID vive **sólo** como secreto de la función. Al navegador
viaja únicamente la pública (`VITE_VAPID_PUBLIC_KEY`).

Una función que actúa en nombre del usuario debe verificar el permiso **con el
token de ese usuario**, no con `service_role`. `invitar-personal` usa
service_role sólo para crear la cuenta; el cambio de rol lo hace con el token
del administrador, para que las reglas de `cambiar_rol` sigan aplicando.

`service_role` bypassa RLS pero **igual necesita `GRANT` de tabla**: son dos
capas distintas. Una función nueva que lea una tabla nueva falla con
"permission denied" hasta que se le otorgue.

**`biome.json` es JSON estricto: no admite comentarios `//`.** Si se los agrega,
Biome no falla de forma visible — ignora la configuración entera y reformatea todo
el repo con sus defaults (tabs, comillas dobles). Ante un reformateo masivo
inesperado, verificar con `pnpm exec biome check biome.json`.

---

## Reglas no negociables

Estas no son preferencias de estilo. Romperlas produce bugs de seguridad, pérdida de datos o problemas legales.

**1. La autorización vive en RLS, no en la UI.**
Toda tabla nueva se crea con `ENABLE ROW LEVEL SECURITY` y sus políticas **en la misma migración**. Una tabla sin RLS es un incidente, no una tarea pendiente. Ocultar un botón no es un control de acceso.

**2. El acceso a una mascota se resuelve *siempre* por `mascota_tutor`.**
Una mascota puede tener varios tutores. No existe `mascota.cliente_id`. Toda política RLS y toda consulta sobre datos de mascota atraviesa la tabla de unión, verificando `revocado_en IS NULL`. **Es el punto único de falla del aislamiento entre clientes:** cualquier cambio que lo toque exige pasar el agente `rls-auditor`.

**3. Los datos de salud llevan origen, y el tutor sólo toca lo suyo.**
Tutor y veterinario cargan en paralelo (`docs/stack.md`, Decisión 13). Toda tabla de salud escribible por ambos lleva `origen` / `cargado_por` / `verificado_por`. El tutor edita y borra únicamente filas con `origen = 'tutor'` que él cargó — garantizado por RLS, no por la UI. `origen` nunca cambia, ni siquiera al verificarse. En el panel, lo reportado por el tutor **siempre** se muestra marcado como tal.

**4. Consultas, diagnósticos y recetas son exclusivos del profesional.**
Frontera que no se mueve: son actos profesionales. El tutor no los crea ni los edita bajo ninguna circunstancia.

**5. La historia clínica no se edita ni se borra.**
Las correcciones son registros nuevos con `corrige_a` apuntando al anterior. Requisito profesional, no decisión técnica. Lo mismo para movimientos de stock y de caja: nunca `UPDATE` sobre un movimiento, siempre uno nuevo que compense.

**6. Cero datos de la clínica escritos en el código.**
Mono-tenant, una instalación por veterinaria (`docs/stack.md`, Decisión 11). Nombre, logo, dirección, horarios y colores viven en `configuracion_clinica`; lo del entorno, en variables de entorno. Levantar la instalación de otra clínica tiene que ser configuración, nunca refactor.

**7. El estado del pago lo determina el webhook, nunca el frontend.**
El retorno del navegador es sólo experiencia de usuario. Todo handler de webhook es idempotente — MercadoPago reintenta.

**8. Los archivos médicos son privados.**
Buckets privados, URLs firmadas de vida corta. Nunca una URL pública a una radiografía o un análisis.

**9. Sin `any` y sin `@ts-ignore`.**
TypeScript en `strict`. Si el tipo no cierra, el problema es el modelo, no el compilador.

**10. Instantes y fechas civiles se tratan distinto.**
Un `timestamptz` (un turno) se convierte a `America/Argentina/Buenos_Aires` para mostrarlo: `formatearFecha`, `formatearFechaHora`. Una columna `date` (fecha de nacimiento, próxima vacunación) **no se convierte de zona**: `formatearFechaCivil`, `diasHastaFechaCivil`. Pasar una fecha civil por `new Date()` la lee como medianoche UTC y en Argentina muestra el día anterior — ya pasó una vez. Nunca `new Date()` a secas para lógica de turnos o recordatorios: usar los helpers de `packages/core/fecha`.

El error tiene una segunda forma, que apareció en 18 lugares a la vez: **`new Date().toISOString().slice(0, 10)` no es "hoy"**, es hoy en UTC. En zona −03, a partir de las 21 h devuelve el día siguiente; la agenda abría en el día equivocado y los formularios proponían mañana. Para eso están `hoyCivil()`, `aFechaCivil()` y `sumarDiasCiviles()`. Del lado de la base, agrupar por día es `(columna at time zone 'America/Argentina/Buenos_Aires')::date`, nunca la columna cruda. Y vale también para los tests: la suite de RLS falló una noche por esto mismo.

**11. Dinero en `numeric(12,2)` en la base y en enteros de centavos o `Decimal` en el código.**
Nunca `float` para plata.

**12. Los precios se copian al momento de la venta.**
Una orden histórica jamás lee el precio actual del producto.

**13. Los tokens públicos son opacos.**
QR de extravío e invitaciones de tutor: aleatorios, revocables y con vencimiento. Nunca IDs secuenciales en URLs públicas — permitirían enumerar el padrón de mascotas.

**14. Nada crítico vive sólo en el dispositivo.**
iOS puede desalojar el almacenamiento de la PWA. El offline es lectura cacheada, no fuente de verdad.

---

## Convenciones de código

**Base de datos:** español, `snake_case`, entidades en singular (`mascota`, `consulta`). Toda tabla lleva `id uuid`, `creado_en`, `actualizado_en`. Borrado lógico vía `archivado_en`.

**TypeScript:** los tipos de base se **generan** con `pnpm db:types` — no se escriben a mano. Las validaciones se definen una sola vez como esquemas Zod en `packages/core` y se comparten entre formularios y Edge Functions.

**React:**
- Estado de servidor con TanStack Query. No replicar datos de servidor en Zustand.
- Zustand sólo para estado genuinamente local (carrito, preferencias de UI).
- Formularios con React Hook Form + resolver de Zod.
- Componentes de UI compartidos van a `packages/ui`; los específicos de un dominio se quedan en su app.
- Organización por feature (`features/turnos/…`), no por tipo de archivo.

**Nomenclatura:** el código y la UI están en español (dominio veterinario argentino). Los términos técnicos consolidados quedan en inglés (`hook`, `query`, `build`). No traducir a medias.

---

## Contexto de producto que conviene tener presente

- **La app cliente no depende de la clínica.** El tutor carga los datos de salud de su mascota por su cuenta; las fases 1 a 4 del roadmap se lanzan con la veterinaria todavía usando su software anterior y sin ningún dato migrado. Al implementar una feature del cliente, preguntate siempre si funciona con la clínica ausente.
- **Una mascota es compartida.** Al diseñar cualquier flujo del cliente, pensá qué ve y qué puede hacer el *otro* tutor: quién recibe la notificación, quién ve el cambio, qué queda registrado sobre quién hizo qué.
- **iOS condiciona todo lo relativo a instalación y push.** Requiere agregar a pantalla de inicio manualmente desde Safari. Cualquier feature que dependa de push necesita un plan alternativo.
- **El usuario cliente es no técnico** y muchas veces está preocupado por la salud de su mascota. La app tiene que ser obvia, no ingeniosa.
- **El personal de la clínica trabaja apurado y con el paciente adelante.** Toda pantalla del panel se juzga por cuántos clics y cuánta espera impone. La fricción en la carga de la historia clínica es la principal causa de abandono de estos sistemas.
- **Hay datos personales, aunque no sean datos de salud humana.** La historia clínica de un animal no es un dato sensible de una persona, así que **no** aplica el régimen agravado de la Ley 25.326. Pero el nombre, DNI, teléfono, email y dirección de los tutores **sí** son datos personales alcanzados por la ley: informar la finalidad al registrarse, permitir acceso y rectificación, minimizar lo que se expone, y aplicar medidas de seguridad razonables. Ante la duda, tratar la información del tutor con el mismo cuidado que la de la mascota — no al revés.

---

## Antes de dar algo por terminado

1. `pnpm typecheck` y `pnpm lint` en verde
2. Tests de la lógica de negocio nueva
3. Si tocó la base: migración aplicada, políticas RLS escritas, `pnpm db:types` corrido
4. Si tocó la app cliente: probado en un dispositivo real, no sólo en el emulador del navegador
5. Si tocó permisos: verificado con un usuario de cada rol afectado

---

## Agentes disponibles

En `.claude/agents/`:

| Agente | Cuándo usarlo |
|---|---|
| `supabase-schema` | Crear o modificar tablas, migraciones y políticas RLS |
| `rls-auditor` | Auditar aislamiento de datos entre roles y clientes (solo lectura) |
| `pwa-doctor` | Service worker, manifest, offline, push, instalabilidad, rarezas de iOS |
| `feature-react` | Implementar features de UI siguiendo las convenciones del repo |
