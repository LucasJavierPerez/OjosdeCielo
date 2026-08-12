# Modelo de datos

Estado: borrador para revisión — 2026-08-12
Postgres sobre Supabase. Nombres de tablas y columnas en español, en `snake_case`, en singular para entidades y plural para colecciones de detalle.

Convenciones aplicadas a **toda** tabla:
- `id uuid primary key default gen_random_uuid()`
- `creado_en timestamptz not null default now()`, `actualizado_en timestamptz`
- `ENABLE ROW LEVEL SECURITY` en la misma migración que la crea
- Borrado lógico (`archivado_en timestamptz`) en vez de `DELETE` en todo lo que tenga valor histórico
- Todo instante se guarda en `timestamptz`; la presentación se convierte a `America/Argentina/Buenos_Aires`
- Dinero en `numeric(12,2)`, nunca `float`

---

## Identidad y accesos

**`perfil`** — extiende `auth.users` de Supabase
`id` (= `auth.users.id`), `nombre`, `apellido`, `dni`, `telefono`, `email`, `rol`, `activo`

`rol` es un enum: `cliente` | `recepcionista` | `veterinario` | `administrador`.
El rol **también** se replica en el JWT (custom claim) para que las políticas RLS no tengan que consultar la tabla en cada evaluación.

**`profesional`** — datos del veterinario, referencia a `perfil`
`perfil_id`, `matricula`, `especialidades[]`, `firma_url`, `color_agenda`

---

## Configuración de la instalación

**`configuracion_clinica`** — fila única (constraint `CHECK (id = 1)`)
`nombre`, `logo_url`, `direccion`, `localidad`, `telefono`, `email`, `horarios` (jsonb), `color_primario`, `horas_min_cancelacion`, `politica_sena`

Existe por la Decisión 11 (mono-tenant): **nada específico de la veterinaria se escribe en el código.** Levantar la instalación de otra clínica debe ser cargar esta fila y las variables de entorno.

---

## Clientes y mascotas

**`cliente`** — el tutor
`perfil_id`, `direccion`, `localidad`, `notas_internas`, `saldo_cuenta`

`notas_internas` es visible sólo para el personal de la clínica. La política RLS lo garantiza; además se expone una vista sin esa columna para la app cliente.

**`mascota`**
`nombre`, `especie`, `raza`, `sexo`, `fecha_nacimiento`, `castrado`, `color`, `foto_url`, `microchip`, `fallecido_en`

**No tiene `cliente_id`.** La propiedad se resuelve por `mascota_tutor` (Decisión 12).

**`mascota_tutor`** — tabla de unión, el corazón del modelo de acceso
`mascota_id`, `cliente_id`, `rol` (`titular` \| `tutor`), `invitado_por`, `desde`, `revocado_en`

- Único titular por mascota: índice único parcial sobre `(mascota_id)` donde `rol = 'titular' AND revocado_en IS NULL`.
- El titular invita, revoca y transfiere la titularidad. Los tutores ven todo, cargan datos de salud y gestionan turnos, pero no manejan accesos.
- **Toda política RLS sobre datos de una mascota pasa por esta tabla.** Es el punto único de falla del aislamiento entre clientes: necesita índices sobre `mascota_id` y `cliente_id`, y auditoría cada vez que se toca.
- Los accesos se revocan de forma lógica, nunca se borran — hace falta el rastro de quién tuvo acceso y hasta cuándo.

**`invitacion_tutor`**
`mascota_id`, `email`, `token` (opaco), `invitado_por`, `vence_en`, `aceptada_en`, `aceptada_por`, `revocada_en`

Permite invitar a alguien que todavía no tiene cuenta: la invitación queda pendiente y se activa al registrarse con ese email. Token opaco, vencimiento obligatorio, un solo uso.

**`mascota_token_qr`**
`mascota_id`, `token` (aleatorio, único, indexado), `activo`, `revocado_en`

Separada de `mascota` para poder revocar y regenerar sin tocar la ficha, y para mantener el token fuera de cualquier consulta que devuelva datos de la mascota.

---

## Datos de salud: columnas de origen

Por la Decisión 13, tutor y veterinario cargan datos en paralelo. **Toda tabla de salud que ambos pueden escribir lleva este bloque de columnas:**

```
origen          text not null check (origen in ('tutor','clinica'))
cargado_por     uuid not null references perfil(id)
verificado_por  uuid references perfil(id)   -- sólo un profesional
verificado_en   timestamptz
```

Regla de escritura, garantizada por RLS: **el tutor sólo puede modificar o borrar filas con `origen = 'tutor'` que él mismo cargó.** Lo que cargó la clínica es de solo lectura para él. Un profesional puede verificar un dato del tutor, pero verificarlo no lo convierte en dato de la clínica: `origen` no cambia nunca.

Aplica a: `antecedente`, `peso_registro`, `aplicacion`, `medicacion_en_curso`.
**No aplica** a `consulta`, `adjunto` ni `receta` — son exclusivamente profesionales.

---

## Historia clínica

**`consulta`** — la entrada base de la HCE. Sólo la carga un profesional.
`mascota_id`, `profesional_id`, `fecha`, `motivo`, `anamnesis`, `examen_fisico`, `diagnostico`, `tratamiento`, `evolucion`, `peso_kg`, `temperatura`, `corrige_a` (autorreferencia)

**No se edita ni se borra.** Una corrección es una consulta nueva con `corrige_a` apuntando a la anterior. La vista de historial muestra la última versión de cada cadena, con acceso a las anteriores.

**`adjunto`**
`consulta_id`, `tipo` (`radiografia` | `ecografia` | `laboratorio` | `otro`), `storage_path`, `nombre_archivo`, `mime`, `tamano_bytes`, `subido_por`

Bucket **privado**. El acceso es siempre por URL firmada de vida corta.

**`antecedente`** — alergias, cirugías, patologías crónicas
`mascota_id`, `tipo`, `descripcion`, `fecha`, `activo` + **bloque de origen**

Una sola tabla con discriminador en lugar de tres tablas casi idénticas.
La misma alergia cargada por el tutor se muestra como *reportada*; cargada por el veterinario, como *diagnosticada*. La distinción sale de `origen`, no de un campo aparte.

**`peso_registro`**
`mascota_id`, `fecha`, `peso_kg`, `consulta_id` (nulo si lo cargó el tutor) + **bloque de origen**

Alimenta el gráfico de evolución. La curva grafica ambos orígenes, diferenciados visualmente: un peso reportado por el dueño no tiene el mismo valor clínico que uno medido en balanza de consultorio.

**`aplicacion`** — vacunas y desparasitaciones
`mascota_id`, `tipo` (`vacuna` | `desparasitacion_interna` | `desparasitacion_externa`), `producto`, `lote`, `fecha`, `proxima_fecha`, `profesional_id` (nulo si lo cargó el tutor) + **bloque de origen**

`proxima_fecha` es lo que dispara el motor de recordatorios — **funcione o no el panel de la clínica.** Esta tabla es la que hace que la app cliente tenga valor desde el primer día.

**`medicacion_en_curso`**
`mascota_id`, `descripcion`, `dosis`, `frecuencia_horas`, `desde`, `hasta`, `receta_item_id` (nulo si lo cargó el tutor), `recordar` + **bloque de origen**

Habilita los recordatorios de dosis. El tutor puede registrar medicación que le está dando por su cuenta; si viene de una receta profesional, queda vinculada.

---

## Turnos

**`especialidad`** — `nombre`, `duracion_default_min`, `requiere_sena`, `monto_sena`

**`disponibilidad`** — plantilla semanal del profesional
`profesional_id`, `dia_semana`, `hora_inicio`, `hora_fin`, `duracion_slot_min`, `vigente_desde`, `vigente_hasta`

**`bloqueo_agenda`** — vacaciones, feriados, ausencias
`profesional_id` (nulo = toda la clínica), `desde`, `hasta`, `motivo`

**`turno`**
`mascota_id`, `profesional_id`, `especialidad_id`, `inicio`, `fin`, `estado`, `notas`, `solicitado_por`, `sena_pago_id`, `cancelado_en`, `cancelado_por`

`estado`: `solicitado` | `confirmado` | `en_curso` | `atendido` | `cancelado` | `ausente`

`solicitado_por` registra **cuál** de los tutores pidió el turno. Cualquier tutor de la mascota lo ve y puede cancelarlo o reprogramarlo, pero queda constancia de quién hizo cada cosa — necesario cuando dos personas gestionan la misma mascota.

**Los slots disponibles se calculan, no se almacenan.** Materializar la grilla completa genera un problema de sincronización permanente. Se derivan de `disponibilidad` menos `bloqueo_agenda` menos `turno` ocupados.

**La prevención de sobreturnos va en la base de datos**, con una constraint de exclusión sobre el rango `[inicio, fin)` por profesional (`btree_gist`). Validar sólo en la aplicación pierde ante dos solicitudes concurrentes.

---

## Recetas

**`receta`** — `mascota_id`, `profesional_id`, `fecha`, `vigente_hasta`, `indicaciones`, `pdf_url`
**`receta_item`** — `receta_id`, `producto_id`, `descripcion`, `dosis`, `frecuencia`, `duracion_dias`, `es_cronico`
**`solicitud_reposicion`** — `receta_item_id`, `cliente_id`, `estado`, `resuelto_por`, `resuelto_en`

Los ítems crónicos son los que habilitan el pedido de reposición y los recordatorios de dosis.

---

## Inventario y ventas

**`producto`** — `nombre`, `descripcion`, `categoria`, `precio`, `requiere_receta`, `visible_en_tienda`, `stock_minimo`, `imagen_url`

**`lote`** — `producto_id`, `numero`, `vencimiento`, `cantidad`

El control de vencimientos de fármacos exige lotes; no alcanza con un contador de stock en `producto`.

**`movimiento_stock`** — `producto_id`, `lote_id`, `tipo`, `cantidad`, `motivo`, `orden_id`, `usuario_id`

`tipo`: `ingreso` | `venta` | `uso_clinico` | `ajuste` | `vencimiento` | `reserva` | `liberacion_reserva`

**El stock es la suma de los movimientos, no un número que se edita.** Una columna `stock` mutable pierde la trazabilidad y se desincroniza. Para performance, vista materializada o columna derivada mantenida por trigger.

**`orden`** — `cliente_id`, `estado`, `total`, `canal` (`app` | `mostrador`), `pago_id`
**`orden_item`** — `orden_id`, `producto_id`, `cantidad`, `precio_unitario`, `subtotal`

`precio_unitario` se **copia** al momento de la venta. Nunca se lee el precio actual del producto para una orden histórica.

---

## Pagos y caja

**`pago`**
`orden_id`, `turno_id`, `monto`, `medio` (`efectivo` | `debito` | `credito` | `transferencia` | `mercadopago`), `estado`, `mp_payment_id` (único), `mp_preference_id`, `payload_webhook` (jsonb), `confirmado_en`

`mp_payment_id` único es lo que da idempotencia frente a webhooks repetidos.

**`movimiento_caja`**
`tipo` (`ingreso` | `egreso`), `monto`, `concepto`, `medio`, `pago_id`, `usuario_id`, `turno_caja_id`

**`turno_caja`** — apertura y cierre
`abierto_por`, `abierto_en`, `monto_inicial`, `cerrado_por`, `cerrado_en`, `monto_declarado`, `monto_calculado`, `diferencia`

**`comprobante`**
`orden_id`, `tipo_comprobante`, `punto_venta`, `numero`, `total`, `pdf_url`, `cae`, `cae_vencimiento`, `cuit_receptor`

Los cuatro últimos campos quedan nulos en v1 (comprobantes internos). Existen desde ahora para que la fase fiscal no requiera migrar datos. Numeración correlativa por punto de venta desde el día uno.

---

## Notificaciones

**`push_subscription`** — `perfil_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`, `ultima_vez_ok`, `fallos_consecutivos`

Un usuario tiene varias suscripciones (celular, tablet). Se dan de baja tras N fallos consecutivos.

**`preferencia_notificacion`** — `perfil_id`, `tipo`, `habilitado`

**`recordatorio`** — `mascota_id`, `tipo`, `programado_para`, `origen_tabla`, `origen_id`, `estado`, `enviado_en`

Se genera desde `aplicacion.proxima_fecha`, `turno.inicio` y `medicacion_en_curso`. El job programado lee esta tabla; no recalcula reglas en cada corrida.

**Un recordatorio de una mascota compartida se envía a todos sus tutores activos**, respetando las preferencias de cada uno por separado.

**`campana`** / **`campana_destinatario`** — broadcast segmentado
`nombre`, `mensaje`, `segmento` (jsonb con los criterios), `programada_para`, `estado`

**`notificacion_log`** — `perfil_id`, `tipo`, `titulo`, `cuerpo`, `enviado_en`, `resultado`, `error`

---

## Auditoría

**`audit_log`** — `usuario_id`, `tabla`, `registro_id`, `accion`, `datos_antes` (jsonb), `datos_despues` (jsonb), `ip`, `creado_en`

Poblada por trigger sobre las tablas sensibles: `consulta`, `adjunto`, `antecedente`, `receta`, `movimiento_caja`, `movimiento_stock`, `perfil`.

**La lectura de historia clínica también se audita**, no sólo la escritura: en datos de salud importa quién miró qué.

Nadie tiene permiso de `UPDATE` ni `DELETE` sobre esta tabla, incluido el rol administrador.

---

## Realtime

Dos tutores pueden estar mirando la misma mascota al mismo tiempo. Se suscriben vía Supabase Realtime:

- `turno` — filtrado por las mascotas del tutor
- `mascota` y las tablas de salud — cuando la ficha está abierta
- `mascota_tutor` — para reflejar de inmediato una invitación aceptada o un acceso revocado

Realtime respeta RLS, así que la suscripción no abre un canal lateral de fuga. Igual conviene suscribirse sólo mientras la vista está montada: cada canal abierto cuesta.

---

## Decisiones cerradas

| Punto | Resolución |
|---|---|
| Multi-clínica | Mono-tenant, una instalación por veterinaria. `configuracion_clinica` en lugar de valores en el código |
| Mascotas con varios tutores | `mascota_tutor` con roles titular/tutor. `mascota.cliente_id` eliminado |
| Origen de los datos de salud | Tutor y clínica cargan en paralelo; bloque `origen` / `cargado_por` / `verificado_por` |
| Retención | Borrado lógico vía `archivado_en`, sin purga automática |
| Migración desde el sistema actual | Diferida. El modelo no depende de ella |

## Abierto

**Uso clínico de productos.** Cuando el veterinario aplica una vacuna o usa un insumo durante la consulta, ¿se descuenta stock automáticamente?

Propuesta por defecto, a validar cuando se llegue a la fase de inventario: en la carga de la consulta hay un selector **opcional** de productos usados, que genera movimientos de tipo `uso_clinico`. Opcional a propósito — si descontar stock bloquea el cierre de la consulta, el veterinario deja de cargar consultas, y perder la historia clínica es mucho peor que tener el stock con desvíos. El control fino se corrige en el arqueo de inventario, no obligando al profesional.

