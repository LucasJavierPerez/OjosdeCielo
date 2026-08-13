# Roadmap por fases

Dos principios rectores:

1. **Al final de cada fase hay algo que alguien puede usar de verdad.** Nada de seis meses de construcción antes del primer usuario real.
2. **La app del cliente no espera a la clínica.** Gracias a la Decisión 13 (doble origen de datos), el tutor carga los datos de salud de su mascota por su cuenta. Las fases 1 a 3 entregan un producto completo y valioso sin que la veterinaria haya migrado un solo registro ni adoptado el panel.

Las estimaciones asumen un desarrollador principal trabajando de forma sostenida. Son órdenes de magnitud, no compromisos.

---

## Fase 0 — Fundaciones ✅
*Sin valor visible, pero todo lo demás depende de esto. **Completada.***

- Monorepo: pnpm workspaces + Turborepo, TypeScript strict, Biome
- Proyecto Supabase: entornos local (CLI + Docker), staging y producción
- Auth: registro, login, recuperación de contraseña, verificación de email
- Enum de roles, custom claim de rol en el JWT, helpers de RLS
- `configuracion_clinica` y variables de entorno — **cero datos de la clínica en el código** (Decisión 11)
- Esqueleto de las dos apps con ruteo y layouts protegidos por rol
- PWA base en `apps/cliente`: manifest, service worker, íconos, pantalla de instalación con instrucciones para iOS
- CI en GitHub Actions: typecheck, lint, test, build
- Generación automática de tipos desde el esquema

**Terminado cuando:** un usuario se registra, entra y ve una pantalla distinta según su rol; la app cliente se instala en un iPhone y en un Android reales.

---

## Fase 1 — Mascota compartida ✅
*Primera fase con valor real para el usuario final. **Completada.***

- [x] Ficha de mascota: alta, foto, especie, raza, fecha de nacimiento, castrado, microchip
- [x] **`mascota_tutor` y todas las políticas RLS que dependen de ella** — el punto más delicado del esquema de seguridad
- [x] Invitación de tutores por **enlace para compartir**, con vencimiento a 7 días y un solo uso
- [x] Gestión de accesos: el titular invita, revoca, anula invitaciones y transfiere la titularidad
- [x] Supabase Realtime en la ficha compartida
- [x] Panel admin: buscar y ver clientes y mascotas

**Terminado cuando:** dos personas comparten la misma mascota, una edita la ficha y la otra lo ve aparecer sin recargar. ✅ *Verificado en el navegador con Ana y Bruno.*

**Invitación por email:** descartada para v1 (ver `stack.md`, Decisión 12). Requiere proveedor de envío, dominio verificado y manejo de rebotes. Se apoyaría sobre la misma tabla `invitacion_tutor`, así que no hay trabajo perdido.

**Auditar antes de cerrar la fase:** `pnpm test:rls` cubre 26 escenarios de aislamiento, incluidos los de mascota compartida. Correr también el agente `rls-auditor` para una revisión independiente de las políticas.

---

## Fase 2 — Salud autogestionada ✅
*El tutor construye el historial de su mascota sin depender de nadie. **Completada**, salvo la línea de tiempo unificada.*

- [x] Bloque de origen (`origen` / `cargado_por` / `verificado_por`) en las cuatro tablas de salud
- [x] Registro de peso + gráfico de evolución, con los dos orígenes distinguidos
- [x] Carnet de vacunación y desparasitaciones, con próxima fecha sugerida y estado de vencimiento
- [x] Alergias y antecedentes reportados por el tutor
- [x] Medicación en curso
- [x] `verificar_registro()`: un veterinario confirma un dato del tutor sin cambiarle el origen
- [ ] Línea de tiempo unificada de la salud — hoy son secciones separadas, no un orden cronológico único
- [x] Panel admin: ve lo que cargó el tutor **marcado como reportado**, con botón de verificar

**Terminado cuando:** un tutor carga el carnet de vacunación completo de su mascota y ve la próxima fecha calculada. ✅ *Verificado en el navegador.*

**Garantía central, verificada en `test:rls`:** el origen lo fija un trigger del servidor. Un cliente que manda `origen: 'clinica'` obtiene igual un registro con origen `tutor`.

---

## Fase 3 — Recordatorios y notificaciones
*La fase que convierte la app en algo que se abre todos los meses en vez de una sola vez.*

- [x] Claves VAPID, suscripción push, gestión multi-dispositivo
- [x] Pedido de permiso contextual, con estado propio para "hay que instalar primero" en iOS
- [x] Preferencias por tipo de notificación, por tutor
- [x] Motor de recordatorios: `pg_cron` + Edge Function
- [x] Tipos: vacunación, desparasitación, fin de medicación
- [x] Envío a **todos** los tutores de la mascota, respetando las preferencias de cada uno
- [x] Log de envíos, reintentos acotados y baja de suscripciones muertas
- [ ] **Envío real a un dispositivo, verificado de punta a punta** — falta probarlo con un celular

**Terminado cuando:** un recordatorio de desparasitación programado a 90 días llega al celular de ambos tutores. ⏳ *La cadena completa está verificada salvo el último salto: hace falta un dispositivo real con el permiso concedido.*

El aviso se programa **3 días antes** del vencimiento, no el mismo día: enterarse el día que vence no le da margen al tutor para sacar turno.

**Riesgo a medir acá:** qué porcentaje de usuarios de iOS instaló la app y aceptó notificaciones. Si es bajo, reforzar el onboarding o agregar respaldo por email/WhatsApp.

**En este punto ya hay producto lanzable**, sin que la clínica haya tocado nada.

---

## Gestión del equipo ✅
*Fuera del roadmap original. Hizo falta antes de que la clínica use el panel.*

- [x] Listado del personal con su rol y estado
- [x] Invitación por email con rol asignado (Edge Function, `service_role`)
- [x] Cambio de rol y baja/reactivación
- [x] Si la persona ya tiene cuenta como cliente, se le asigna el rol sin duplicarla

**Reglas garantizadas en la base:** sólo un administrador cambia roles; nadie
cambia el suyo; dar de baja conserva la cuenta y su trazabilidad, y el hook de
acceso le quita el rol al reingresar.

---

## Fase 4 — Identidad y extravío ✅

- [x] QR con token opaco de 32 caracteres, revocación y regeneración
- [x] Página pública: nombre, foto, especie y raza. **Nada más**
- [x] Marcar como perdida / encontrada
- [x] Aviso de hallazgo sin cuenta, con push a todos los tutores
- [x] `noindex` en la página pública
- [ ] Rate limiting — hoy la defensa es la longitud del token, no un límite de intentos

**La decisión de privacidad de esta fase:** el teléfono del tutor aparece **sólo** si
la mascota está marcada como perdida. Un QR se escanea por curiosidad, y no hay
motivo para regalar un teléfono cuando el animal está en su casa. El contacto de la
clínica sí se muestra siempre: es institucional, no personal, y da a dónde llevarlo.

Fase corta y de alto impacto percibido: es la función que hace que la app se recomiende.

---

## Fase 5 — Turnos ✅
*Primera fase que exige participación de la clínica.*

- [x] Especialidades, disponibilidad semanal por profesional, bloqueos
- [x] Cálculo de slots disponibles (no materializados)
- [x] Constraint de exclusión anti-sobreturno en la base
- [x] Agenda del panel por día, con estados y contacto del tutor a mano
- [x] Solicitud desde la app: mascota → motivo → día → hora
- [x] Cancelación con plazo mínimo configurable, que no aplica al personal
- [x] **Cualquier tutor gestiona el turno; todos lo ven**, con registro de quién hizo qué
- [x] Recordatorio de turno 24 h antes, y se cancela si el turno se cancela
- [x] Estados del turno: solicitado → confirmado → en consultorio → atendido
- [ ] Reprogramar arrastrando en la agenda — hoy se cancela y se saca de nuevo
- [ ] Vista semanal y por profesional — hoy es día a día

**Terminado cuando:** un cliente saca turno desde el celular, le aparece al otro tutor, y entra en la agenda de la clínica sin intervención manual. ✅ *Verificado de punta a punta en el navegador.*

---

## Fase 6 — Historia clínica electrónica
*La fase que decide si la clínica adopta el sistema.*

- [x] Cargar consulta: anamnesis, examen físico, diagnóstico, tratamiento, evolución
- [x] Historial cronológico con correcciones versionadas (`corrige_a`)
- [x] Adjuntos en bucket privado con URLs firmadas: radiografías, ecografías, laboratorio
- [x] Alta de pacientes desde la clínica, con tutor sin cuenta y vinculación automática
- [x] El peso medido en consulta se suma a la curva del paciente
- [x] App cliente: historial profesional y descarga de estudios
- [ ] Antecedentes diagnosticados por el profesional desde el panel
- [ ] Auditoría de **lectura** — buena práctica, no obligación legal (ver `stack.md`, Protección de datos personales). Tiene sentido cuando la clínica tenga varios empleados
- [ ] Migración de datos desde el sistema actual de la clínica

**Terminado cuando:** los veterinarios cargan consultas reales durante una semana sin volver al sistema anterior. ⏳ *Funciona de punta a punta; falta el uso real.*

**Recomendación fuerte:** sentarse a mirar trabajar a recepción y a un veterinario **antes** de diseñar estas pantallas. La fricción en la carga de la HCE es la causa número uno de abandono de estos sistemas.

**Acá aparece el tema migración**, postergado hasta ahora a propósito.

---

## Fase 7 — Inventario, tienda y caja

- [x] Productos, categorías, lotes con vencimiento
- [x] Stock como suma de movimientos; alertas de mínimo y de vencimiento próximo
- [x] Venta de mostrador en el panel
- [x] Catálogo y carrito en la app cliente
- [x] MercadoPago Checkout Pro + webhook idempotente
- [x] Reserva de stock con expiración durante el pago
- [x] Turno de caja: apertura, cierre, arqueo y diferencias
- [x] Comprobantes internos numerados correlativamente
- [x] Uso clínico de productos (movimiento `uso_clinico`, descuenta sin pasar por caja)

**Terminado cuando:** una venta desde la app descuenta stock, queda en caja y genera comprobante, sin tocar nada a mano. ⚠️ *Todo verificado salvo el cobro real: el checkout de MercadoPago necesita credenciales de la clínica. El webhook está probado con avisos simulados —cuatro idénticos no duplican nada— pero nunca habló con MercadoPago de verdad.*

Fase de mayor riesgo técnico: dinero, stock y concurrencia. Conviene atacarla con el equipo ya familiarizado con el sistema.

---

## Fase 8 — Recetario y métricas

- [x] Recetario digital con verificación pública por código y QR
- [x] Solicitud de reposición de medicación crónica
- [x] Dashboard: turnos por día y profesional, rotación de productos, pacientes inactivos
- [x] Broadcast segmentado (ej. campaña antirrábica), con vista previa antes de enviar
- [x] Mensajería directa clínica ↔ cliente

**Sobre "PDF firmado":** no hay firma digital con certificado. Eso lo tramita
el profesional ante su colegio, no la aplicación. Lo que hay es un código de
verificación público: la farmacia entra a `/r/:codigo` y ve quién la emitió,
para qué mascota, qué contiene y si sigue vigente. Contra el riesgo real
—receta fotocopiada, adulterada o vencida— eso sirve; una firma criptográfica
que nadie sabe validar, no. Si la clínica llega a necesitar la firma con
certificado, se agrega encima de esto sin rehacer nada.

**Terminado cuando:** la clínica lanza una campaña de vacunación desde el panel y mide la respuesta. ⚠️ *Todo el circuito verificado salvo la llegada real del push a un celular, que necesita un teléfono físico (mismo pendiente que la fase 3). El despacho, la autorización y la idempotencia sí se probaron contra la Edge Function corriendo.*

Va última porque las métricas necesitan volumen de datos cargado para significar algo.

---

## Antes de operar con clientes reales

Independiente de las fases: nada de esto es necesario para seguir desarrollando,
pero sí antes de que la clínica atienda gente de verdad.

- [ ] **Política de privacidad con consentimiento en el registro** — obligación
      concreta de la Ley 25.326 (art. 6). Es lo más barato de la lista
- [ ] Registro de la base ante la AAIP (lo hace la clínica como responsable)
- [ ] Contrato de tratamiento con Supabase y verificar dónde quedan alojados los datos
- [ ] Política de retención: hoy nada se borra nunca
- [ ] Deploy real: proyecto Supabase de producción, dominios, secretos, `functions deploy`
- [ ] Verificar el CI en GitHub (nunca se comprobó: falta `gh auth login`)
- [ ] Íconos definitivos de la PWA — los actuales son un placeholder generado
- [ ] Probar la instalación y el push en un iPhone y un Android reales

---

## Explícitamente fuera de alcance en v1

Se registran para que no se cuelen sin decisión:

- Facturación electrónica ARCA/AFIP (`stack.md`, Decisión 3)
- Multi-tenant / SaaS multi-veterinaria (`stack.md`, Decisión 11)
- Telemedicina o videoconsulta
- Integración con laboratorios externos vía API
- App nativa en tiendas
- Escritura offline con resolución de conflictos (`stack.md`, Decisión 8)
- Internacionalización — sólo español rioplatense

---

## Por qué este orden

El cambio respecto del plan original es deliberado: las fases 1 a 4 dependen **exclusivamente** del tutor. Se pueden construir, lanzar y validar con usuarios reales mientras la clínica sigue con su software actual y sin haber migrado un solo dato.

Eso desacopla el riesgo mayor del proyecto — que la adopción interna o la migración se demoren — del momento en que hay algo funcionando en la calle. Cuando llegan las fases 5 y 6, la app ya tiene usuarios, y el argumento para que la clínica adopte el panel deja de ser una promesa y pasa a ser un hecho.
