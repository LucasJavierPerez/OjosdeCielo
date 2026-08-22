# Arquitectura

Estado: reflejo del sistema tal como está desplegado — 2026-08-21.
A diferencia de `stack.md` (decisiones y alternativas descartadas) y
`modelo-datos.md` (esquema y convenciones), este documento describe **qué hay
hoy**: las dos aplicaciones, la base, las funciones de servidor y cómo se
despliega todo. Si algo de acá contradice a `stack.md`, gana este documento —
`stack.md` registra lo que se decidió al principio, y algunas cosas cambiaron
en el camino (el hosting es Railway, no Vercel/Cloudflare; no hay Mercado Pago
en uso; no hay Zustand ni TanStack Table).

---

## 1. Panorama general

PWA de gestión veterinaria, mono-tenant: una instalación completa por
clínica, con su propia base de datos y su propio dominio. No hay backend de
aplicación propio — las dos apps hablan directo con Supabase (Postgres +
Auth + Storage + Realtime), y lo único que corre en un servidor son cuatro
Edge Functions para lo que nunca debe resolverse en el navegador.

```
┌──────────────────────┐         ┌──────────────────────┐
│   PWA de tutores     │         │   Panel de la clínica│
│   (apps/cliente)     │         │   (apps/admin)       │
│   React + Vite       │         │   React + Vite       │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           │    HTTPS (fetch / supabase-js)
           └───────────────┬────────────────┘
                            ▼
                 ┌─────────────────────┐
                 │    Supabase Cloud    │
                 │  Postgres 17 + RLS   │
                 │  Auth (GoTrue)       │
                 │  Storage             │
                 │  Realtime            │
                 │  pg_cron             │
                 │  Edge Functions      │
                 └──────────┬───────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        Web Push      SMTP (email    (Mercado Pago:
        (VAPID)       transaccional)  código listo,
                                       sin usar)
```

Cada app se sirve como un contenedor Docker independiente en Railway: un
build de Vite (archivos estáticos) servido por Caddy. No hay servidor Node en
producción para ninguna de las dos.

---

## 2. Monorepo

```
appcelular/
├── apps/
│   ├── cliente/     PWA instalable — tutores de mascotas
│   └── admin/       Panel interno — recepción, veterinarios, administración
├── packages/
│   ├── core/        Dominio compartido: esquemas Zod, reglas de negocio, fechas
│   ├── db/          Cliente Supabase tipado, tipos generados del esquema real
│   └── ui/          Design system propio (sin librería externa de componentes)
├── supabase/
│   ├── migrations/  41 migraciones SQL, versionadas y aplicadas en orden
│   ├── functions/   4 Edge Functions (Deno)
│   ├── seed.sql     Datos de prueba — sólo para desarrollo local
│   └── tests/       Suite de verificación de RLS (375 checks, 109 secciones)
├── infra/
│   └── Caddyfile    Servido de ambas SPA en Railway
└── docs/            Este archivo, stack.md, modelo-datos.md, roadmap.md, deploy-demo.md
```

Herramientas: **pnpm workspaces** + **Turborepo** (cachea `build`/`typecheck`/
`test`/`lint` entre paquetes). **Biome** hace de lint + formateador en una
sola herramienta.

---

## 3. Frontend

Las dos apps comparten stack y paquetes, pero son builds y despliegues
completamente separados — el panel nunca viaja al celular del tutor.

| Área | Elección | Notas |
|---|---|---|
| Lenguaje | TypeScript `strict: true` | |
| Framework | React 19 | |
| Build | Vite 8 | Sin SSR: las dos apps son sistemas autenticados detrás de login |
| Estilos | Tailwind CSS 4 | Vía `@tailwindcss/vite`; `packages/ui` necesita `@source` explícito porque Vite no escanea paquetes symlinked por default |
| Componentes | `packages/ui`, propio | Sin shadcn ni ninguna librería — todo hecho a mano sobre Tailwind |
| Estado de servidor | TanStack Query 5 | La gran mayoría del estado de la app es esto |
| Estado local | `useState` | No hay Zustand ni Redux; no hizo falta |
| Formularios | Mezcla: React Hook Form + Zod en formularios largos, `useState` llano en los cortos | Los esquemas Zod que sí se usan viven en `packages/core` y se comparten con el dominio |
| Ruteo | React Router 8 | |
| Gráficos | Recharts | Curva de peso, turnos por día, caja mensual |
| Fechas | date-fns + `@date-fns/tz` | Todo en `America/Argentina/Buenos_Aires`, nunca en la hora del navegador |

### 3.1 App de tutores (`apps/cliente`)

PWA instalable (`vite-plugin-pwa` + Workbox): manifest, service worker,
caché offline de lectura (ficha de mascota, historial, turnos, carnet de
vacunación). Nada de eso admite escritura offline — sacar un turno o comprar
requiere conexión.

24 páginas, entre ellas: Inicio (con cartel de promoción vigente y el
indicador de mensajes sin leer), mascotas, salud, turnos, mensajes con la
clínica, tienda, recordatorios (Web Push), identidad/QR de extravío.

### 3.2 Panel de la clínica (`apps/admin`)

14 páginas. Navegación por rol (recepcionista, veterinario, administrador,
combinables): Agenda, Tablero, Pacientes, Reposiciones, Caja, Inventario,
Mensajes, Promociones, Pedidos, Equipo.

Promociones absorbió lo que antes era una sección aparte ("Campañas"): crear
un descuento, avisar por push y borrar quedaron unificados en una sola
pantalla. El envío sigue apoyándose en la tabla `campana` y las mismas RPC
por debajo (`crear_campana`, `lanzar_campana`), pero ya no tienen una
pantalla propia — son la plomería de "Avisar a los tutores", no un feature
aparte.

---

## 4. Backend — Supabase

No hay backend de aplicación custom. Postgres con Row Level Security es la
única capa de autorización real; los helpers de permiso en el frontend
(`packages/core/src/roles.ts`) son sólo para no mostrar botones que van a
fallar, nunca protección.

### 4.1 Base de datos

- **Postgres 17**, 45 tablas, 41 migraciones aplicadas en orden reproducible
  (`supabase db push` / `supabase db reset`).
- **RLS activado en el 100% de las tablas** desde el momento en que se crean
  — una tabla sin RLS es tratado como incidente, no como tarea pendiente.
- Roles como **arreglo** (`perfil.roles: rol[]`), no un enum único: la misma
  persona puede ser administradora, veterinaria y recepcionista a la vez, lo
  normal en una clínica unipersonal.
- El rol se inyecta en el JWT vía un **Custom Access Token Hook**
  (`custom_access_token_hook`), para que las políticas RLS lean el claim en
  vez de hacer una subconsulta a `perfil` en cada fila evaluada.
- Historia clínica de sólo-append: nada se sobrescribe. Un dato reportado por
  el tutor se **descarta con motivo**, nunca se corrige encima — así la
  etiqueta "reportado por el tutor" nunca miente sobre lo que dijo.

Dominios principales (ver `modelo-datos.md` para el detalle columna por
columna):

| Dominio | Tablas clave |
|---|---|
| Identidad y accesos | `perfil`, `profesional`, `configuracion_clinica` |
| Mascotas y tutores | `mascota`, `mascota_tutor`, `invitacion_tutor` |
| Salud | `peso_registro`, `aplicacion`, `antecedente`, `medicacion_en_curso`, `consulta` |
| Turnos | `turno`, `disponibilidad`, `bloqueo_agenda`, `especialidad` |
| Inventario y ventas | `producto`, `movimiento_stock`, `orden`, `orden_item`, `pago`, `comprobante` |
| Caja | `turno_caja`, `movimiento_caja` |
| Promociones | `promocion` |
| Comunicación | `campana`, `campana_envio`, `conversacion`, `mensaje` |
| Notificaciones | `push_subscription`, `preferencia_notificacion`, `recordatorio`, `notificacion_log` |
| Identidad/extravío | `mascota_token_qr` |
| Auditoría | `audit_log` |

### 4.2 Auth

Supabase Auth (GoTrue) con email/contraseña. El hook de roles (arriba) es lo
que hace que el JWT sepa quién es personal de la clínica; sin él, todo el
mundo entra como `cliente` sin ningún error visible — es el bug más caro que
tuvo este proyecto en la puesta en marcha.

### 4.3 Storage

Buckets separados por sensibilidad:

- **Privados** (mascotas, estudios): se sirven con URL firmada de vida
  corta, nunca con URL pública.
- **Público** (`productos`): las fotos de producto no tienen nada privado
  que proteger, así que se sirven por `/object/public/`, sin pasar por RLS
  ni gastar una firma por cada producto de una grilla de treinta.

### 4.4 pg_cron

Corre dentro de la base, no depende de que nadie tenga la app abierta:
genera las filas de `recordatorio` (turno 24h antes, vacunas y
desparasitaciones próximas a vencer, medicación en curso). **Lo que falta:**
nada agenda todavía la llamada a `enviar-recordatorios` — el cron genera las
filas y ahí se detienen. Ver sección 8.

### 4.5 Edge Functions (Deno)

Sólo lo que no puede resolverse en el navegador. Viven en
`supabase/functions/`, se despliegan aparte del esquema (`pnpm
deploy:funciones`) y necesitan sus propios secretos (`supabase secrets
set`).

| Función | Para qué | Quién la llama |
|---|---|---|
| `invitar-personal` | Crea la cuenta y asigna roles al invitar a alguien al equipo | El panel (administrador), directo desde el navegador |
| `enviar-campana` | Manda el push de una campaña ya lanzada (segmentada o desde una promoción) | El panel (administrador) |
| `enviar-recordatorios` | Despacha los recordatorios que generó pg_cron | Pensada para un cron externo o `pg_net`; **no está conectada todavía** |
| `pago-mercadopago` | Checkout Pro y confirmación de pago | **Sin usar** — las compras de la app no pasan más por Mercado Pago (ver sección 7) |

Dos de estas (`invitar-personal`, `enviar-campana`) las invoca el navegador
directo, no el cliente de Supabase — necesitan sus propias cabeceras CORS y
`verify_jwt = false` en `supabase/config.toml` (cada una valida la sesión
con su propia lógica, más específica que el gate genérico de la
plataforma). Sin esto el preflight `OPTIONS` nunca llega a la función.

---

## 5. Seguridad

Regla no negociable del proyecto: **la autorización vive en las políticas
RLS de Postgres. La UI oculta lo que un usuario no debería ver; nunca es lo
que lo protege.**

- **Mono-tenant real**: una base de Postgres por clínica. El aislamiento
  entre clínicas es por construcción — no depende de que ninguna política
  esté bien escrita.
- **Doble origen de datos de salud**: tutor y veterinario cargan en la misma
  línea de tiempo, distinguidos por `origen` (`tutor` | `clinica`), que fija
  un trigger del servidor — nunca se confía en lo que manda el navegador.
- **`es_personal_clinica()`, `es_administrador()`, `roles_actuales()`**: los
  helpers de permiso que usan las políticas, leídos del JWT, no de una
  subconsulta a `perfil` (más barato de evaluar por fila).
- La suite `supabase/tests/rls.mjs` corre contra la **anon key**, como lo
  haría el navegador — prueba el sistema como lo ve un atacante, no como lo
  ve un superusuario. 375 verificaciones en 109 secciones; se corre con
  `pnpm db:reset && pnpm test:rls` y es lo que valida el CI.

---

## 6. APIs y RPC

No hay un API REST propio: **PostgREST** (que Supabase expone
automáticamente sobre el esquema) es toda la superficie HTTP. Las tablas se
consultan directo desde `supabase-js` cuando RLS alcanza para proteger la
fila; cuando hace falta lógica transaccional, un cálculo que no puede vivir
en un `SELECT`, o exponer menos columnas de las que tiene la tabla, hay una
función Postgres (`security definer` cuando corresponde) llamada por RPC.

Ejemplos representativos por dominio:

| Dominio | RPC | Qué resuelve |
|---|---|---|
| Turnos | `solicitar_turno`, `slots_disponibles`, `cancelar_turno` | El personal agenda fuera de la grilla; el tutor sólo elige un slot ofrecido |
| Salud | `descartar_registro`, `restaurar_registro`, `verificar_registro` | El patrón "descartar, no reescribir" sobre las cuatro tablas de salud |
| Inventario | `registrar_movimiento`, `vender_mostrador` | Evita stock negativo con un lock de fila |
| Tienda | `catalogo_tienda`, `crear_orden_online`, `confirmar_pedido_local` | Calcula el precio con promoción aplicada; reserva stock; cobro en persona |
| Caja | `abrir_caja`, `cerrar_caja`, `resumen_caja`, `flujo_caja_mensual` | Arqueo y conciliación |
| Promociones | `precio_con_promocion`, `crear_campana`, `lanzar_campana` | Resuelve el precio vigente (producto > categoría > catálogo); "Avisar a los tutores" crea y lanza el push por debajo |
| Equipo | `invitar-personal` (Edge Function), `cambiar_roles` | Alta y gestión de roles del personal |
| Mensajería | `abrir_conversacion`, `marcar_conversacion_leida` | Conversación tutor ↔ clínica |

---

## 7. Integraciones externas

| Integración | Estado | Notas |
|---|---|---|
| **Web Push (VAPID)** | Activa | Claves propias, sin Firebase. Recordatorios y campañas se calculan en el servidor. En iOS sólo funciona con la PWA instalada en la pantalla de inicio (limitación de Safari, no del código) |
| **Email transaccional** | Activa, SMTP compartido de Supabase | Cupo bajo, puede caer en spam — para producción real hace falta un SMTP propio |
| **Mercado Pago** | **Retirada de uso** | El circuito (Checkout Pro + webhook) está construido y probado con avisos simulados, pero las compras de la app ahora generan un pedido que se paga y se retira en la clínica (`confirmar_pedido_local`), sin pasar por Mercado Pago. El código queda en el repo por si se retoma, pero la Edge Function no está desplegada |

---

## 8. Despliegue

```
Railway                              Supabase Cloud
├── servicio "cliente" (PWA)  ───►   Postgres + RLS
└── servicio "admin" (panel)  ───►   Auth · Storage · Edge Functions · pg_cron
```

Railway aloja **sólo el frontend** de las dos apps — nada de Supabase corre
ahí. Cada servicio es un `Dockerfile` propio (`apps/cliente/Dockerfile`,
`apps/admin/Dockerfile`): build multi-stage, `node:24-alpine` compila con
Vite, `caddy:2-alpine` sirve el resultado estático.

**Caddy** (`infra/Caddyfile`) resuelve dos cosas que un servidor de archivos
común no hace bien: rutas de SPA (`try_files` manda todo lo desconocido a
`index.html`, porque el router de React decide, no el servidor) y caché
(assets con hash → inmutables; todo lo demás → `no-cache`, para que la PWA
note que hay versión nueva).

**Las variables `VITE_*` se hornean en el build, no se leen en runtime.**
Cambiar una en Railway y sólo reiniciar el servicio no alcanza — hace falta
un redeploy completo.

### Lo que se aprendió operando esto (y quedó resuelto en el código)

- `apps/*/Dockerfile` fuerza un build limpio referenciando
  `RAILWAY_GIT_COMMIT_SHA` (que Railway inyecta solo, distinto en cada push)
  antes del `COPY` del código fuente. Sin esto, se vio a Railway marcar un
  deploy como "successful" sirviendo igual el bundle de un commit anterior.
- Desplegar el frontend **no** aplica migraciones ni Edge Functions: son tres
  comandos separados (`git push`, `pnpm deploy:db`, `pnpm deploy:funciones`).
  Una migración probada en local y nunca empujada con `deploy:db` se
  manifiesta en producción como `bucket not found` o `column does not
  exist`.
- pgcrypto (`gen_random_bytes`, `crypt`, `gen_salt`) necesita el esquema
  calificado explícito (`extensions.crypt(...)`) en Supabase Cloud: el
  `search_path` de una sesión de migración ahí no incluye `extensions`,
  aunque localmente sí.
- Un servicio de Railway conectado a un "Upstream Repo" (plantilla) no
  redespliega solo con los pushes al repo propio hasta que se hace *Eject*.

CI (GitHub Actions, `ci.yml`): typecheck + lint + test + build en un job;
`supabase start` desde cero + `pnpm test:rls` en otro, para atrapar tanto una
migración que no corre limpia como una fuga de RLS antes de mergear.

---

## 9. Estado actual / lo que falta

- **Push real a un celular**: las claves están configuradas y el envío
  manual (campañas) funciona, pero nada dispara todavía
  `enviar-recordatorios` de forma automática — falta agendarlo (`pg_cron` +
  `pg_net`, o un cron externo).
- **Facturación**: comprobantes internos únicamente (`docs/stack.md`,
  Decisión 3). Los campos para la fase fiscal (CAE, punto de venta) ya están
  en el esquema, pero nulos.
- **Antes de operar con datos reales de pacientes** (no antes de una demo):
  política de privacidad con consentimiento real, registro de la base ante
  la AAIP, contrato de tratamiento con Supabase, reemplazar `seed.sql` (crea
  usuarios con contraseña conocida — sólo sirve para demos).

Para el detalle de decisiones descartadas y el porqué de cada una, ver
`stack.md`. Para el esquema completo columna por columna, `modelo-datos.md`.
Para poner esto en línea desde cero, `deploy-demo.md`.
