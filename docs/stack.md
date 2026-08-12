# Stack tecnológico y decisiones de arquitectura

Estado: propuesto — v1, 2026-08-12
Decisiones tomadas junto con el dueño del proyecto. Cada una registra las alternativas descartadas para que no se vuelvan a discutir sin motivo nuevo.

---

## Premisas confirmadas

| # | Premisa | Estado |
|---|---|---|
| A1 | **Una instalación por veterinaria** (mono-tenant). Ver Decisión 11 | Confirmado |
| A2 | Público en Argentina; moneda ARS; zona horaria `America/Argentina/Buenos_Aires` | Confirmado |
| A3 | **Una mascota puede tener varios tutores**, con acceso simultáneo. Ver Decisión 12 | Confirmado |
| A4 | **Tutor y veterinario cargan datos de salud**, en paralelo y distinguibles. Ver Decisión 13 | Confirmado |
| A5 | El stock del e-commerce es el mismo stock físico del mostrador (una sola fuente de verdad) | Confirmado |
| A6 | La app cliente se usa en el celular; el panel se usa en desktop dentro de la clínica | Confirmado |
| A7 | Retención: **borrado lógico**, sin purga automática de datos | Confirmado |

**Pendiente sin bloquear:** la clínica ya usa un software propio y todavía no se sabe cómo exporta sus datos. La migración se releva más adelante. La Decisión 13 está pensada justamente para que el proyecto no dependa de que eso se resuelva.

---

## Decisión 1 — Formato de distribución: PWA

Confirmado en `plan.md`. Aplicación web instalable, sin pasar por tiendas.

**Lo que hay que saber antes de prometerle nada al cliente:**

- **iOS es el limitante, no Android.** Las notificaciones push web en iOS existen recién desde iOS 16.4 y **sólo funcionan si el usuario agrega la app a la pantalla de inicio** desde Safari. No hay banner automático de instalación en iOS: hay que enseñarle al usuario a hacer "Compartir → Agregar a inicio". Esto debe estar diseñado como pantalla de onboarding, no como un detalle técnico.
- En Android/Chrome sí existe el prompt de instalación (`beforeinstallprompt`) y push funciona sin instalar.
- iOS puede desalojar el almacenamiento de la PWA tras semanas sin uso. **Nada crítico puede vivir sólo en el dispositivo.**

**Consecuencia de diseño:** el offline es una *mejora de experiencia*, no una garantía. Ver Decisión 8.

---

## Decisión 2 — Backend: Supabase

**Elegido.** Postgres gestionado + Auth + Storage + Row Level Security + Realtime + Edge Functions.

**Por qué:**
- El dominio es intrínsecamente relacional (historia clínica, inventario, caja, turnos). Postgres es la herramienta correcta.
- RBAC con tres roles diferenciados se resuelve con RLS **en la base de datos**, no en el frontend. Esto es lo que hace que el sistema sea realmente seguro.
- Storage con buckets privados y URLs firmadas cubre radiografías, ecografías y PDFs de laboratorio.
- Al ser Postgres estándar, migrar a infraestructura propia después es viable. No hay lock-in fuerte.

**Descartados:**
- *Firebase/Firestore*: NoSQL. Los reportes del dashboard (rotación de productos, pacientes inactivos, volumen por profesional) y la conciliación de caja son consultas relacionales. Modelarlas en Firestore sería pelear contra la herramienta.
- *Backend propio NestJS*: control total, pero implica escribir y mantener auth, storage, permisos e infraestructura. No se justifica para el tamaño del equipo.

**Lo que igual necesita código de servidor** (como Edge Functions, en Deno/TypeScript):
- Webhook de MercadoPago (confirmación de pago — nunca confiar en el frontend).
- Envío de push notifications.
- Job programado de recordatorios (`pg_cron` disparando la función).
- Generación de PDFs de recetas y comprobantes.

---

## Decisión 3 — Facturación: comprobantes internos en v1

**Elegido.** Registro de ingresos/egresos, comprobantes no fiscales y conciliación de pagos de la app.

**Lo que esto significa concretamente:** el sistema **no** emite facturas válidas ante ARCA (ex AFIP) en v1. La clínica sigue facturando como lo hace hoy.

**Preparación para la fase fiscal** (para no tener que rehacer): la tabla de comprobantes ya lleva desde el día uno los campos `tipo_comprobante`, `punto_venta`, `numero`, `cae`, `cae_vencimiento` y `cuit_receptor`, aunque queden nulos. Numeración correlativa por punto de venta desde el inicio.

**Descartado por ahora:** integración directa con WSAA/WSFE (certificados, homologación, puntos de venta) — es un proyecto en sí mismo. Cuando llegue el momento, la recomendación es un facturador externo (TusFacturas / Facturante) antes que la integración directa.

---

## Decisión 4 — Estructura: monorepo con dos aplicaciones

**Elegido.**

```
appcelular/
├── apps/
│   ├── cliente/     PWA instalable — tutores de mascotas
│   └── admin/       Panel interno — recepción, veterinarios, administración
├── packages/
│   ├── db/          Migraciones SQL, políticas RLS, tipos generados
│   ├── core/        Dominio compartido: esquemas Zod, reglas de negocio, cálculos
│   └── ui/          Componentes compartidos (design system)
├── supabase/
│   ├── migrations/
│   └── functions/   Edge Functions
└── docs/
```

**Por qué separadas:** el panel de administración no debe viajar al celular del cliente. Son perfiles de uso opuestos — la app cliente necesita ser liviana, instalable y funcionar con mala conexión; el panel necesita densidad de información y corre en desktop sobre WiFi de la clínica. Mezclarlas obliga a comprometer las dos.

**Herramientas:** pnpm workspaces + Turborepo (caché de builds y tareas).

**Descartado:** app única con render condicional por rol. Más simple al principio, pero termina enviando código de gestión interna al dispositivo del cliente y amplía la superficie de seguridad.

---

## Decisión 5 — Frontend: React + Vite + TypeScript

**Elegido React.**

**Vite en lugar de Next.js.** Esto es deliberado:
- Next.js aporta SSR/RSC, que acá no hace falta: ambas apps son sistemas autenticados detrás de login, donde el SEO es irrelevante.
- Next.js exige un servidor Node (o Vercel). Una SPA estática se publica en cualquier CDN, cuesta menos y tiene menos partes móviles.
- El control fino del service worker — central en una PWA — es notoriamente más simple en Vite que peleando contra el App Router.

**Única excepción:** la página pública del QR de extravío (Decisión 9) sí se beneficia de render en servidor. Se resuelve como ruta aislada, no cambiando el stack entero.

| Área | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript, `strict: true` | Historia clínica y stock no toleran errores de tipo silenciosos |
| Build | Vite 6 | Velocidad de desarrollo, control del SW |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest y service worker con estrategias declarativas |
| Estilos | Tailwind CSS | Velocidad, consistencia, sin CSS muerto |
| Componentes | shadcn/ui (sobre Radix) | Accesibles por defecto, se copian al repo — sin lock-in de librería |
| Estado servidor | TanStack Query | Caché, revalidación y estados de carga; el 80% del estado de esta app es estado de servidor |
| Estado cliente | Zustand | Sólo para lo que realmente es local (carrito, preferencias de UI) |
| Formularios | React Hook Form + Zod | Los esquemas Zod se comparten con la validación de backend desde `packages/core` |
| Ruteo | React Router v7 | Ecosistema y familiaridad |
| Gráficos | Recharts | Curva de peso y dashboard |
| Fechas | date-fns + date-fns-tz | Turnos y recordatorios **siempre** en `America/Argentina/Buenos_Aires` |
| Tablas | TanStack Table | Grillas densas del panel admin |

**Calidad:**
- Biome (lint + format en una sola herramienta, sin la configuración de ESLint + Prettier).
- Vitest + Testing Library para unitarios.
- Playwright para E2E de los flujos críticos: sacar turno, cargar consulta, cobrar.
- CI en GitHub Actions: typecheck, lint, tests, build.

---

## Decisión 6 — Seguridad y RBAC

**Regla no negociable del proyecto: la autorización vive en las políticas RLS de Postgres. La UI sólo oculta lo que el usuario no debería ver; nunca es lo que lo protege.**

Roles: `cliente`, `recepcionista`, `veterinario`, `administrador`.

Toda tabla nueva nace con `ENABLE ROW LEVEL SECURITY` y sus políticas en la misma migración. Una tabla sin RLS es un incidente de seguridad, no una tarea pendiente.

**Datos médicos:**
- La historia clínica **no se borra ni se sobrescribe**: las correcciones son entradas nuevas que referencian la anterior. Es un requisito profesional, no una preferencia técnica.
- Tabla `audit_log` con quién, qué, cuándo, para todo acceso y modificación de historia clínica.
- Los archivos médicos van a buckets privados y se sirven con URLs firmadas de vida corta. Nunca URLs públicas.
- El cliente tiene acceso **de solo lectura** a su historial (definido así en `plan.md`).

---

## Decisión 7 — Notificaciones push

Web Push estándar con claves VAPID. No hace falta Firebase.

**Arquitectura:** el service worker recibe el push → tabla `push_subscriptions` guarda los endpoints por usuario y dispositivo → una Edge Function programada por `pg_cron` evalúa qué recordatorios corresponden y despacha.

**Los recordatorios se calculan en el servidor, no en el dispositivo.** Un recordatorio de desparasitación a 90 días no puede depender de que el celular tenga la app abierta.

Tipos: turno 24 h antes, desparasitación interna/externa, dosis de medicación continua, vacunación, y broadcast por segmento.

**Reglas:** el permiso de notificaciones se pide después de un gesto explícito del usuario y con contexto — nunca al primer arranque. Toda notificación es cancelable por tipo desde preferencias. Los envíos quedan registrados (`notificaciones_log`) para poder auditar qué se mandó y a quién.

---

## Decisión 8 — Estrategia offline

Honesta y acotada:

- **Cacheado para lectura offline:** ficha de la mascota, historial médico, recetas activas, próximos turnos, carnet de vacunación. Es lo que sirve tener a mano en el consultorio o con mala señal.
- **Requiere conexión:** sacar o cancelar turnos, comprar, pagar, cualquier escritura del panel admin.
- **No se implementa** cola de escrituras offline con resolución de conflictos. La complejidad no se justifica frente al beneficio, y en un sistema con stock y turnos los conflictos son peligrosos.
- La UI indica con claridad cuándo está mostrando datos cacheados y de cuándo son.

---

## Decisión 9 — QR de identidad y extravío

- El QR apunta a `/m/{token}`, donde `token` es un **identificador opaco y aleatorio**, nunca el ID de la mascota. Un ID secuencial permitiría enumerar todas las mascotas del sistema.
- La página pública muestra únicamente: nombre, foto, especie/raza, y un contacto para reportar el hallazgo. **Nada de historia clínica, dirección ni datos del tutor.**
- El token es revocable y regenerable por el tutor.
- Página con `noindex`, y rate limiting para evitar barridos.

---

## Decisión 10 — Pagos: MercadoPago

Checkout Pro para carrito y seña de turnos.

**La confirmación del pago viene exclusivamente del webhook servidor-a-servidor, validando la firma.** El retorno del navegador es sólo experiencia de usuario: nunca se marca una orden como pagada porque el frontend lo diga.

El stock se reserva al iniciar el pago con expiración, y se descuenta definitivamente al confirmarse. Idempotencia por `payment_id` — los webhooks llegan repetidos.

---

## Decisión 11 — Mono-tenant: una instalación por veterinaria

**Elegido.** Mismo código fuente; cada veterinaria tiene su proyecto Supabase, su base de datos y su dominio.

**Por qué:** el aislamiento de datos de salud entre clínicas queda garantizado *por construcción*. No existe política RLS que se pueda escribir mal y filtrar datos de una veterinaria a otra, porque están en bases distintas. En un esquema multi-tenant, cada política tendría que verificar simultáneamente la cadena de propiedad del cliente y la pertenencia a la clínica — carga permanente sobre cada consulta del sistema, y un solo error expone historia clínica entre competidores.

**Costo asumido:** aplicar cada migración en N bases. Molesto a partir de unas diez instalaciones; irrelevante con dos o tres.

**Lo que se hace ahora para preservar la opción** (barato hoy, caro después):
- Tabla `configuracion_clinica` de una sola fila: nombre, logo, dirección, teléfono, horarios, colores de marca, políticas de cancelación.
- Todo lo específico del entorno en variables de entorno: URL de Supabase, claves, dominio, credenciales de MercadoPago.
- **Cero datos de la clínica escritos en el código.** Ni el nombre, ni el logo, ni un horario.
- Migraciones versionadas y aplicables de forma reproducible con la CLI de Supabase.

Con esto, la segunda instalación es un deploy configurado, no una refactorización.

**Si el producto llega a ~10 veterinarias**, conviene reevaluar y migrar a multi-tenant. Es trabajo real, pero se hace con diez clientes pagando, no antes de tener el primero.

---

## Decisión 12 — Tutores múltiples por mascota

**Elegido.** Una mascota puede tener varios tutores con acceso simultáneo. Cualquiera de ellos saca un turno y el turno aparece para todos.

**Modelo de permisos: titular + tutores invitados.**

- El **titular** es quien registró la mascota: invita y revoca accesos, y transfiere la titularidad.
- Los **tutores invitados** ven todo, cargan datos de salud y sacan o cancelan turnos, pero no gestionan quién más accede.

**Por qué asimétrico:** el caso de uso más frecuente de esta función es una familia o una pareja separada. Con permisos simétricos, cualquiera puede expulsar al otro del acceso a la mascota sin aviso — exactamente en el escenario donde más se necesita que eso no pase.

**Invitación** por email o enlace, con vencimiento. Si la persona todavía no tiene cuenta, la invitación queda pendiente y se activa al registrarse.

**Consecuencia técnica:** desaparece `mascota.cliente_id`. La propiedad se resuelve por la tabla de unión `mascota_tutor`, y **todas las políticas RLS de datos de mascota pasan por ahí**. Es el punto más delicado del esquema de seguridad.

**Simultaneidad:** las vistas compartidas (ficha de mascota, turnos, registros de salud) se suscriben a Supabase Realtime, para que un cambio hecho por un tutor aparezca en el dispositivo del otro sin recargar.

---

## Decisión 13 — Doble origen de los datos de salud

**Elegido.** Tanto el tutor como el veterinario cargan datos de salud. No son alternativas: conviven en la misma línea de tiempo, distinguidos por origen.

**Esta es la decisión que hace que el producto exista sin depender de la clínica.** Los recordatorios, el gráfico de peso y el carnet de vacunación funcionan desde el primer día, con la clínica todavía usando su sistema anterior y sin ningún dato migrado.

**Reglas:**

| | Puede cargar el tutor | Puede cargar el veterinario |
|---|---|---|
| Ficha, foto, microchip | Sí | Sí |
| Peso | Sí | Sí |
| Vacunas y desparasitaciones | Sí | Sí |
| Alergias y antecedentes | Sí, como *reportados* | Sí, como *diagnosticados* |
| Medicación en curso | Sí | Sí |
| Consulta, anamnesis, diagnóstico, tratamiento | **No** | Sí |
| Recetas | **No** | Sí |

La consulta y la receta son actos profesionales. Esa frontera no se mueve.

- Cada registro guarda `origen` (`tutor` \| `clinica`), `cargado_por` y opcionalmente `verificado_por`.
- **El tutor edita y borra únicamente lo que él cargó.** Lo cargado por la clínica es de solo lectura para él.
- **En el panel, lo reportado por el tutor se muestra marcado como tal.** Un peso que dijo el dueño no tiene el mismo valor clínico que uno medido en la balanza del consultorio, y el veterinario tiene que poder distinguirlos de un vistazo.
- El profesional puede **verificar** un dato del tutor; queda registrado quién lo hizo y cuándo.
- En la app cliente ambos orígenes aparecen en la misma línea de tiempo, visualmente diferenciados.

---

## Hosting

- Frontends: Vercel o Cloudflare Pages (ambas apps son estáticas).
- Datos, auth, storage y funciones: Supabase.
- Dominios sugeridos: `app.ojosdecielo.com` (cliente) y `panel.ojosdecielo.com` (admin).

---

## Riesgos abiertos

| Riesgo | Mitigación |
|---|---|
| Instalación en iOS depende de un gesto manual del usuario | Onboarding explícito con instrucciones ilustradas; medir tasa de instalación |
| El alcance total es grande para un MVP | Roadmap por fases con producto usable al final de cada una (ver `roadmap.md`) |
| Datos de salud → responsabilidad legal (Ley 25.326 de Protección de Datos Personales) | Cifrado en tránsito y reposo, auditoría de accesos, borrado lógico, consentimiento explícito |
| Migración desde el software actual de la clínica: formato desconocido | La Decisión 13 hace que el producto funcione sin migrar nada. Relevar cuando la clínica adopte el panel |
| Las políticas RLS ahora dependen de `mascota_tutor` — punto único de falla del aislamiento | Auditoría obligatoria con el agente `rls-auditor` ante cada cambio que toque acceso a mascotas |
| Adopción interna del panel por parte del equipo de la clínica | Involucrar a recepción y veterinarios antes de diseñar la HCE, no al entregarla |
| Datos duplicados o contradictorios entre lo que carga el tutor y lo que carga la clínica | Origen visible siempre; el profesional puede verificar; nunca se sobrescriben entre sí |
