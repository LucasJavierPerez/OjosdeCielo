# Puesta en producción

Guía para pasar de la demo a un sistema con datos reales de pacientes y tutores.
Complementa `docs/deploy-demo.md` (que sirve para mostrar, no para operar).

**Regla de oro: producción es un proyecto Supabase nuevo, sin `seed.sql`.** El
proyecto de la demo tiene seis cuentas con la contraseña `password123` escrita en
el repo. Eso no se arregla cambiando contraseñas: esas cuentas no pueden existir.

El código ya trae lo que se puede resolver desde acá (headers de seguridad en
Caddy, `minimum_password_length = 8`, salvaguarda en el seed, redirect URLs para
la recuperación de contraseña). Lo que sigue son pasos de operación, cuenta por
medio, que sólo puede hacer quien administra los servicios.

---

## 1. Proyecto Supabase de producción

1. Crear un proyecto **nuevo** en supabase.com, plan **Pro** como mínimo:
   - el free tier **pausa el proyecto a los 7 días sin uso** y sus backups no
     alcanzan para datos de salud;
   - Pro habilita **Point-in-Time Recovery** — activarlo.
   - Región `South America (São Paulo)`. Guardar la contraseña de la base.

2. Enlazar y subir **sólo el esquema** (nunca el seed):

   ```bash
   pnpm supabase link --project-ref <ref-de-produccion>
   pnpm deploy:db          # supabase db push — aplica las migraciones, NO el seed
   ```

3. **Activar el hook de acceso.** *Authentication → Hooks → Custom Access Token*
   → habilitar, apuntando a `public.custom_access_token_hook`.

   Sin esto **todo el personal entra con rol `cliente` y no ve nada**, sin error
   visible. Es el bug más caro que tuvo el proyecto. Verificalo entrando con una
   cuenta de veterinario: si no ve la agenda, el hook está apagado.

4. **URL Configuration** (*Authentication → URL Configuration*):
   - Site URL: dominio de la app de tutores.
   - Redirect URLs: `https://<app-tutores>/**` y `https://<panel>/**`
     (los `/**` son necesarios para que el enlace de recuperación caiga en
     `/nueva-clave` y no en la home).

5. **SMTP propio.** *Authentication → Emails → SMTP Settings*. Sin esto no
   funcionan: confirmación de email al registrarse, **recuperación de
   contraseña**, ni el mail de invitación de personal. El SMTP compartido de
   Supabase manda ~2–4 mails por hora.

6. **Política de contraseñas.** *Authentication → Policies*: mínimo 8 caracteres
   (el código ya lo pide; esto lo hace cumplir también del lado de Supabase).

7. **MFA para administradores.** *Authentication → Providers → MFA*: habilitar
   TOTP y pedir a cada admin que lo active.

8. **Contrato de tratamiento de datos con Supabase** y confirmar en qué región
   quedan alojados los datos (para el registro ante la AAIP).

---

## 2. Bootstrap del primer administrador

En una base limpia no hay ningún admin, y `cambiar_roles` exige un admin previo
(huevo y gallina). Una sola vez, a mano:

1. Crear el usuario desde *Authentication → Users → Add user* (con email y
   contraseña, marcando "Auto Confirm User"). El trigger le crea el perfil con
   rol `cliente`.

2. En el *SQL Editor*, promoverlo:

   ```sql
   update public.perfil
      set roles = array['administrador', 'veterinario', 'recepcionista']::public.rol[]
    where email = lower('EL-EMAIL-DEL-ADMIN');
   ```

3. Cerrar sesión y volver a entrar (el rol viaja en el JWT, que se refresca al
   reingresar).

De ahí en más, **el resto del personal se da de alta desde el panel** (*Equipo →
Invitar*), que asigna roles y manda el mail de invitación.

---

## 3. Railway (las dos apps)

Igual que en `docs/deploy-demo.md`, pero con las variables del proyecto nuevo:

| App | Variables |
|---|---|
| `admin` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `cliente` | + `VITE_VAPID_PUBLIC_KEY`, `VITE_URL_PANEL` |

- Las `VITE_*` se **hornean en el build**: al cambiarlas hay que redeployar, no
  alcanza con reiniciar.
- **`SUPABASE_SERVICE_ROLE_KEY` NUNCA va a Railway ni a una `VITE_*`.** Sólo a
  los secretos de las Edge Functions. (Verificado: hoy no está en el frontend.)
- Caddy ya sirve con HSTS, CSP de base, `X-Frame-Options: DENY`,
  `nosniff` y `Permissions-Policy`. Conviene un dominio propio con HTTPS.
- Endurecer la CSP (quitar `'unsafe-inline'` de `script-src`, pasar a hashes)
  queda pendiente para después de verificar las dos apps en el navegador.

---

## 4. Edge Functions y cron

```bash
pnpm supabase secrets set --env-file supabase/functions/.env   # producción
pnpm deploy:funciones      # invitar-personal, crear-tutor, enviar-recordatorios, enviar-campana
# pago-mercadopago aparte, sólo si se habilitan cobros online:
#   pnpm supabase functions deploy pago-mercadopago   (con MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET reales)
```

- **Recordatorios:** el `pg_cron` genera las filas, pero algo tiene que llamar a
  `enviar-recordatorios`. Agendar la llamada (pg_cron + pg_net con el header
  `x-secreto-cron`, o un cron externo).
- **Push:** probar de punta a punta en un **iPhone y un Android reales**. En iOS
  sólo funciona con la PWA instalada desde Safari.
- **MercadoPago:** si se habilita, hacer un pago de prueba real (chico) y
  confirmar que el webhook acredita. Hasta hoy sólo se probó con avisos
  simulados.

---

## 5. Datos de la clínica

Con el admin ya dentro del panel:

1. *Configuración* → cargar `configuracion_clinica`: nombre, dirección,
   teléfono, email, horarios, logo, colores. Es lo que sale en el membrete de
   las recetas y en las páginas públicas. **Cero datos de la clínica en el
   código.**
2. Publicar la política de privacidad **revisada por un abogado** (hoy hay un
   borrador `0.1`). Es acción del admin, no requiere deploy.

---

## 6. Legal y cumplimiento (Ley 25.326)

Los datos del tutor (nombre, DNI, teléfono, email, dirección) son datos
personales alcanzados por la ley. Antes de operar:

- [ ] Política de privacidad revisada por un abogado y publicada.
- [ ] Registro de la base de datos ante la **AAIP** (lo tramita la clínica como
      responsable).
- [ ] **Política de retención.** Hoy nada se borra nunca. Definir por cuánto
      tiempo se conservan los datos de tutores que dejan de ser clientes y cómo
      se ejerce el derecho de supresión.
- [ ] Circuito de acceso y rectificación de datos personales a pedido del tutor
      (la app ya deja ver y corregir; documentarlo).

---

## 7. Antes de anunciar el lanzamiento

- [ ] Verificar el **CI de GitHub** en verde (hoy nunca se comprobó: falta
      `gh auth login`). En local: `pnpm typecheck && pnpm lint && pnpm test`, y
      `pnpm db:reset && pnpm test:rls`.
- [ ] Pasar el agente **`rls-auditor`** sobre el esquema completo. `pnpm test:rls`
      cubre 112 escenarios, pero el modelo cambió mucho (internación, atención a
      domicilio, la clínica controlando la carga, `vincular_tutor_a_mascota`) y
      ninguno de esos cambios tuvo auditoría independiente. AGENTS.md la exige
      para cualquier cosa que toque `mascota_tutor`.
- [ ] Rotar cualquier credencial que haya pasado por la demo (tokens de prueba
      de MercadoPago, claves VAPID si se compartieron).
- [ ] Confirmar backups/PITR activos y probar una restauración.
- [ ] Instalar la PWA y recibir un push en un iPhone y un Android reales.

---

## Decisión pendiente: registro de tutores

Hoy el tutor puede registrarse solo (`enable_signup = true`) **y** la clínica
puede crearle la cuenta desde el panel. Si se prefiere que las cuentas de tutor
las cree siempre la clínica, apagar el auto-registro en
*Authentication → Providers → Email → Enable Signup*. La app de tutores seguiría
sirviendo para todo lo demás.
