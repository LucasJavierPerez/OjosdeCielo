# Registro de sesión — 12 y 13 de agosto de 2026

Bitácora de lo trabajado, para no tener que reconstruirlo del historial de git.
Lo que está acá es el *por qué*; el *qué* está en los commits y el estado
general en `docs/roadmap.md`.

**Al cerrar la sesión:** 37 migraciones, 348 verificaciones de RLS en 105
secciones, 18 tests unitarios. Lint, typecheck y build en verde. Todo pusheado
a `main`.

---

## Qué se construyó

### Fase 7 — Inventario, tienda y caja (`5ddc677`, `4d61e47`, `eb0d87d`)

Inventario con alertas de mínimo y vencimiento, venta de mostrador, turno de
caja con arqueo, tienda con carrito en la app del tutor y checkout de
MercadoPago.

Verificado contra la base: el stock no queda negativo, los movimientos son
inmutables, el precio se congela al vender, la reserva de stock baja la
disponibilidad para otros sin tocar el stock real hasta que el pago confirma, y
cuatro avisos idénticos del webhook no duplican nada.

### Fase 8 — Recetario, métricas, campañas y mensajería (`eeb1aea` … `7f0bff1`)

- **Recetario** con código de verificación público y QR.
- **Reposición de crónicos**: el tutor pide, el veterinario decide.
- **Tablero** de métricas operativas y económicas.
- **Campañas segmentadas** con vista previa antes de enviar.
- **Mensajería** clínica ↔ tutor.

### Pendientes de fases anteriores que se cerraron

- Línea de tiempo unificada de salud (`6b35f1c`)
- Antecedentes cargados por el veterinario desde el panel (`6b35f1c`)
- Vista semanal de agenda (`fad9174`)
- Límite de intentos en las páginas públicas (`6037b4f`)
- Mecanismo de consentimiento de la política de privacidad (`0aa1e8b`)

### Pedidos del segundo día

- **Roles múltiples** (`2ab3b0d`) — una persona puede ser administradora,
  veterinaria y recepcionista a la vez.
- **Control profesional del paciente** (`2ab3b0d`) — el veterinario carga y
  corrige datos de salud desde el panel.
- **Identidad visual** (`7a5a2df`) — colores y logo de la clínica.
- **Edición de productos** (`b3142da`) — corregir nombre y precio.
- **Contactos, historial y flujo de caja** (`eb0a527`).

---

## Decisiones que conviene recordar

### Roles: se relajó una regla a propósito

Antes nadie podía cambiar sus propios roles. En una veterinaria unipersonal eso
deja al administrador único sin poder darse nunca el rol de veterinario, porque
no hay otra persona que se lo conceda. Ahora **puede, mientras no se saque
`administrador`**, que es lo que la regla realmente protegía.

Consecuencia que corrige algo dicho antes: la regla del *último administrador
activo* dejó de ser inalcanzable y pasó a ser la única barrera real contra que
la clínica se quede sin quien la administre. El test ahora la verifica de
verdad en lugar de declararla.

### Datos de salud: el profesional descarta, no reescribe

Frente a un peso mal cargado por el tutor, el veterinario **descarta con
motivo** en vez de corregir el número. Reescribirlo dejaría una fila que dice
«reportado por el tutor» con un valor que el tutor nunca dijo, y eso destruye
la distinción de origen sobre la que se apoya todo el modelo. Descartado, el
dato sale de curvas, alertas e historia; el registro queda y el tutor lee por
qué. Se puede deshacer.

**Si esto no convence, es el punto a revisar**: la alternativa es permitir la
edición directa, pero entonces hay que sacar la etiqueta «reportado por el
tutor» porque dejaría de ser cierta.

### Email del tutor: no se edita desde el panel

En `perfil` es una copia del de `auth.users`, con el que la persona ingresa.
Cambiarlo desde el panel no cambiaría su login, sólo mostraría un correo con el
que nadie puede entrar. Para los tutores **sin cuenta** sí se edita, porque ese
email es el que los vincula si algún día se registran.

### Precios: seguros de corregir

`orden_item` congela precio **y descripción** al momento de la venta. Verificado
en la práctica: tras renombrar un producto y subirle el precio, la venta
anterior sigue diciendo el nombre viejo y lo que se cobró. Aun así se le agregó
auditoría, porque un precio mal tipeado y corregido después es justo lo que hay
que rastrear cuando la caja no cierra.

### Recetas: verificables, no firmadas

No hay firma digital con certificado — eso lo tramita el profesional ante su
colegio, no la aplicación. Hay un código de verificación público: la farmacia
entra a `/r/:codigo` y ve quién la emitió, qué contiene y si sigue vigente.
Contra el riesgo real (receta fotocopiada, adulterada o vencida) eso sirve.

### Corte de acceso al dinero

Los **cierres de caja** los ve todo el personal: recepción los necesita para
explicar una diferencia. El **acumulado por mes** es del administrador, igual
que la facturación del tablero.

---

## Errores encontrados en el camino

Vale la pena tenerlos escritos: casi todos fallaban en silencio.

1. **«Hoy» se calculaba en UTC en 18 lugares.** `new Date().toISOString()`
   devuelve el día siguiente después de las 21 h en zona −03. La agenda abría en
   el día equivocado y los formularios proponían mañana. Los tests de fechas
   usaban el mismo patrón roto, así que tampoco lo habrían detectado. Ahora hay
   helpers en `core` y dos tests con el reloj congelado a las 23:00. (`fad9174`)

2. **Fuga de caché al cambiar de sesión.** En el mismo dispositivo, el segundo
   usuario veía las mascotas del primero. RLS impide *traer* datos ajenos, no
   *mostrar* los que ya estaban en memoria: se limpiaba la caché del service
   worker pero no la de react-query. (`0aa1e8b`)

3. **Tailwind no escanea `packages/ui`.** La detección automática parte de la
   raíz de Vite e ignora `node_modules`, y el paquete entra por un symlink de
   ahí adentro. Toda clase usada sólo en el paquete compartido no se generaba,
   sin error ni advertencia. Lo delató un `object-contain` que deformaba el
   logo. (`7a5a2df`)

4. **`service_role` bypassa RLS pero igual necesita `GRANT`.** Tercera aparición
   en el proyecto, esta vez sobre `campana`. (`7f0bff1`)

5. **Una función que leía una columna eliminada.** `perfiles_del_segmento`
   seguía leyendo `perfil.rol` tras el cambio a roles múltiples: compilaba bien
   y habría fallado recién al enviar una campaña. (`2ab3b0d`)

6. **Un test que frenó un error de diseño.** Al agregar teléfono y DNI a
   `tutores_de_mascota()`, el test 22 lo rechazó: esa función la comparte la app
   del tutor, y sumarle el teléfono habría convertido «quién accede» en una
   agenda de contactos ajenos. Los campos se movieron a una función sólo para la
   clínica. (`eb0a527`)

Todo esto quedó anotado en `AGENTS.md` como reglas, no como anécdotas.

---

## Qué queda pendiente

### Del `plan.md` original — nunca llegaron al roadmap

Son omisiones al armar las fases, no decisiones:

- **Reprogramar un turno.** El plan pide «opciones de reprogramación y
  cancelación»; hoy sólo hay cancelación, así que para cambiar un horario el
  tutor cancela y saca otro, y en el medio el turno queda libre.
- **Señar turnos de especialidad.** Las columnas existen
  (`especialidad.requiere_sena`, `monto_sena`, `configuracion_clinica.politica_sena`)
  pero nada las usa. La infraestructura de cobro ya está hecha.

### Decisiones tuyas, no trabajo pendiente

- Reprogramar arrastrando en la agenda del panel — conviene decidirlo mirando
  trabajar a recepción.
- Auditoría de **lectura** — tiene sentido con varios empleados.
- Política de retención — hoy no se borra nada.

### Requieren algo que no está en esta máquina

- Envío real de push a un iPhone y un Android (teléfonos físicos)
- Cobro real con MercadoPago (credenciales de la clínica)
- Verificar el CI en GitHub (`gh auth login`)
- Migración desde el sistema actual de la clínica (sus datos)

### Trámites y decisiones de la clínica

- Texto de la política revisado por un abogado — hay un borrador publicado
  (`0.1-borrador`) que describe lo que la aplicación hace de verdad, que es el
  insumo que un abogado necesita. Publicar la versión revisada es una acción del
  administrador, sin deploy.
- Registro de la base ante la AAIP
- Contrato de tratamiento con Supabase
- Deploy real: proyecto de producción, dominios, secretos, `functions deploy`

---

## Cómo retomar

```bash
pnpm db:start                  # Supabase local (necesita Docker)
pnpm db:reset && pnpm test:rls # la suite asume base recién reseteada
pnpm dev                       # cliente en 5173, panel en 5174
```

Usuarios del seed, todos con contraseña `password123`:

| Email | Rol |
|---|---|
| `admin@ojosdecielo.test` | administrador |
| `vet@ojosdecielo.test` | veterinario |
| `recepcion@ojosdecielo.test` | recepcionista |
| `ana@ejemplo.test` | cliente (comparte mascota con Bruno) |
| `bruno@ejemplo.test` | cliente |
| `clara@ejemplo.test` | cliente (control de aislamiento) |

Antes de tocar el esquema o los permisos, leer `AGENTS.md`: las reglas de ahí
son las que evitan repetir los errores de la lista de arriba. En esta sesión se
sumaron dos: la 4 bis (los roles son un conjunto) y la 10 bis (Tailwind no
escanea `packages/ui`).
