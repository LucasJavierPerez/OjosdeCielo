# Poner la demo en línea

Guía para tener las dos apps accesibles desde internet y poder mostrárselas al
cliente. **No es un deploy de producción**: al final hay una lista de lo que
falta para eso.

## La forma del sistema

Railway aloja **sólo las dos apps**. No aloja el backend, y no por una
limitación de Railway: el backend es Supabase entero —Postgres con RLS, Auth,
Storage, Edge Functions y pg_cron—. Autohospedarlo son seis servicios que hay
que coordinar y mantener, y para una demo eso es desproporcionado.

```
Railway                          Supabase Cloud
├── app de tutores  (PWA)  ──────► Postgres + RLS
└── panel de la clínica    ──────► Auth
                                   Storage (fotos, estudios)
                                   Edge Functions
                                   pg_cron
```

El plan gratuito de Supabase alcanza de sobra para demostraciones. La única
molestia: **pausa el proyecto tras una semana sin uso** y hay que reactivarlo
desde el panel, así que conviene entrar un día antes de una reunión.

---

## 1. Supabase Cloud

1. Crear un proyecto en [supabase.com](https://supabase.com). Elegir la región
   más cercana (`South America (São Paulo)`). Guardar la contraseña de la base:
   no se puede recuperar después.

2. Enlazar el repo local con el proyecto y subir el esquema:

   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref <ref-del-proyecto>
   pnpm deploy:db                 # aplica las 37 migraciones
   ```

3. **Activar el hook de acceso.** Sin esto, todo el personal entra con rol
   `cliente` y no ve nada, sin ningún error visible — es el bug más caro que
   tuvo este proyecto. En el panel de Supabase:

   *Authentication → Hooks → Custom Access Token* → habilitar y apuntar a
   `public.custom_access_token_hook`.

   Es lo mismo que `supabase/config.toml` declara para local, pero en la nube
   se configura por panel.

4. **Cargar las URL de retorno.** *Authentication → URL Configuration*:
   - Site URL: la URL de la app de tutores en Railway
   - Redirect URLs: las dos URL de Railway

   Sin esto, confirmar el email o aceptar una invitación lleva a `localhost`.

5. Copiar de *Settings → API*: la **Project URL** y la **anon key**. Van a
   Railway en el paso siguiente. La **service_role key** no va a Railway nunca:
   sólo a los secretos de las Edge Functions.

---

## 2. Railway: las dos apps

Un servicio por app, los dos desde el mismo repo.

**Servicio `cliente`**
- Root Directory: `/`
- Dockerfile Path: `apps/cliente/Dockerfile`
- Variables:

  | Variable | Valor |
  |---|---|
  | `VITE_SUPABASE_URL` | Project URL de Supabase |
  | `VITE_SUPABASE_ANON_KEY` | anon key |
  | `VITE_VAPID_PUBLIC_KEY` | clave pública VAPID (ver paso 3) |
  | `VITE_URL_PANEL` | URL del servicio `admin` |

**Servicio `admin`**
- Root Directory: `/`
- Dockerfile Path: `apps/admin/Dockerfile`
- Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`

> **Las `VITE_*` se hornean durante el build, no se leen en runtime.** Si se
> cambia una, hay que volver a desplegar: reiniciar el servicio no alcanza.
> Es la causa número uno de "cambié la variable y sigue apuntando al viejo".

Las dos apps se sirven con Caddy (`infra/Caddyfile`), que resuelve dos cosas
que un servidor de archivos común no hace bien:

- **Rutas de la SPA**: recargar sobre `/tienda/orden/abc` sirve el `index.html`
  en vez de un 404, porque esas rutas las resuelve el router del navegador.
- **Caché**: los assets con hash quedan inmutables; todo lo demás va con
  `no-cache`, para que la PWA se entere de que hay versión nueva.

---

## 3. Edge Functions y secretos

Las funciones no van a Railway: viven en Supabase.

```bash
# Claves VAPID para las notificaciones push (una sola vez)
npx web-push generate-vapid-keys

pnpm supabase secrets set \
  VAPID_PUBLIC_KEY=<pública> \
  VAPID_PRIVATE_KEY=<privada> \
  VAPID_SUBJECT=mailto:contacto@laclinica.com \
  SECRETO_CRON=<algo largo y aleatorio> \
  URL_APP=<URL de Railway del cliente> \
  URL_PANEL=<URL de Railway del panel>

pnpm deploy:funciones

# pago-mercadopago se despliega aparte, sólo si vas a mostrar cobros:
# necesita MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET de la cuenta de la clínica.
#   pnpm supabase functions deploy pago-mercadopago
```

La **clave pública** de VAPID va también a Railway como `VITE_VAPID_PUBLIC_KEY`.
La **privada** no sale de los secretos de Supabase.

---

## 4. Datos para mostrar

El proyecto queda vacío: `db push` aplica el esquema, no el seed.

Para la demo conviene cargar los datos de prueba, que traen mascotas
compartidas, turnos, productos e historia clínica:

```bash
psql "<connection string de Supabase>" -f supabase/seed.sql
```

> **Ojo:** el seed crea usuarios con la contraseña `password123` escrita en el
> archivo. Sirve para demostrar; **no puede quedar en un sistema con datos
> reales de pacientes**. Cuando la clínica empiece a cargar información de
> verdad, hay que arrancar de un proyecto limpio.

Después de cargarlo, entrar al panel con `admin@ojosdecielo.test` y:

1. *Equipo* → darse los roles que correspondan.
2. Cargar los datos de la clínica en `configuracion_clinica` (nombre,
   dirección, teléfono) — es lo que sale en el membrete de las recetas.
3. Publicar la política de privacidad revisada, si ya la tenés.

---

## Lo que NO queda funcionando con esto

Vale la pena tenerlo claro antes de la reunión, para no prometer de más:

- **Push real a un celular.** Las claves quedan configuradas, pero nada dispara
  `enviar-recordatorios`: el cron genera las filas de recordatorio y ahí se
  detienen. Falta agendar la llamada a la función (con `pg_cron` + `pg_net`, o
  un cron externo con el header `x-secreto-cron`). Además Safari en iOS sólo
  admite push si la app está **instalada** en la pantalla de inicio.
- **Cobro con MercadoPago.** El circuito está construido y el webhook probado
  con avisos simulados, pero nunca habló con MercadoPago de verdad. Necesita
  credenciales de la clínica.
- **Emails.** Supabase manda confirmaciones y invitaciones con su SMTP
  compartido, que tiene un cupo bajo y suele caer en spam. Para la demo alcanza;
  para producción hay que conectar un SMTP propio.

## Para producción hace falta, además

Está todo en `docs/roadmap.md`, sección «Antes de operar con clientes reales»:
texto de la política revisado por un abogado, registro ante la AAIP, contrato
de tratamiento con Supabase, política de retención, y probar instalación y push
en un iPhone y un Android reales.
