-- Borrador de la política de privacidad, versión 0.1.
--
-- ⚠️ ESTE TEXTO NO ESTÁ REVISADO POR UN ABOGADO. Se publica igual porque sin
-- una versión vigente el registro no puede pedir consentimiento y el circuito
-- queda a medias. Describe lo que la aplicación hace de verdad —qué datos
-- toma, para qué y a dónde van— que es justamente el insumo que un abogado
-- necesita para redactar la versión definitiva.
--
-- Publicar la versión revisada es una acción del administrador desde el panel;
-- no hace falta tocar código. Las versiones viejas quedan como prueba de qué
-- aceptó cada persona y cuándo.

insert into public.politica_privacidad (version, vigente, contenido) values (
  '0.1-borrador',
  true,
  $texto$
# Política de privacidad

**Versión 0.1 — borrador pendiente de revisión legal.**

## Quién es responsable de tus datos

La clínica veterinaria que opera esta aplicación. Sus datos de contacto figuran
en la sección "La clínica" de la app y al pie de cada receta.

## Qué datos tomamos y para qué

**Tuyos:** nombre, apellido, email y teléfono. Los usamos para identificarte,
avisarte de los turnos y recordatorios de tu mascota, y para que la clínica
pueda comunicarse con vos. El email y la contraseña son necesarios para tener
cuenta; el teléfono es opcional, pero sin él la clínica no puede llamarte si
encuentran a tu mascota perdida.

**De tu mascota:** especie, raza, fecha de nacimiento, peso, vacunas,
antecedentes, medicación, consultas y estudios. Los datos de salud de un animal
no son datos personales sensibles en los términos de la Ley 25.326: esa
categoría aplica a personas.

**De uso:** si activás las notificaciones, guardamos un identificador del
navegador de tu celular para poder enviarlas. Podés desactivarlas cuando
quieras y lo borramos.

## Con quién los compartimos

- **Los otros tutores de tu mascota.** Si compartís el cuidado, ven la misma
  ficha que vos. Lo autorizás vos al invitarlos y podés revocarlo.
- **El personal de la clínica.** Ven tus datos de contacto y la ficha de tus
  mascotas para poder atenderlas.
- **Supabase**, que aloja la base de datos y los archivos, como proveedor de
  infraestructura.
- **MercadoPago**, si pagás por la app. Los datos de tu tarjeta no pasan por
  esta aplicación en ningún momento: los ingresás en el sitio de MercadoPago.

No vendemos ni cedemos tus datos a terceros con fines publicitarios.

## Las páginas públicas

Dos partes de la aplicación se pueden ver sin cuenta:

- **El QR de tu mascota.** Quien lo escanee ve su nombre, especie, raza y foto.
  Tu nombre de pila y tu teléfono aparecen **sólo si vos la marcaste como
  perdida**, y dejan de aparecer cuando la marcás como encontrada.
- **La verificación de recetas.** Con el código de una receta se puede ver qué
  contiene, quién la emitió y si está vigente. No muestra ningún dato tuyo.

## Publicidad y campañas

La clínica puede mandarte avisos sobre campañas de vacunación u ofertas. Podés
desactivarlos desde Recordatorios sin perder los avisos de salud de tu mascota,
que son otra cosa. También podés pedir que te den de baja escribiéndole a la
clínica.

## Tus derechos

Podés pedir en cualquier momento acceder a tus datos, corregirlos o que los
borremos, escribiéndole a la clínica por los medios de contacto de la app. La
Ley 25.326 te da derecho a una respuesta gratuita cada seis meses.

La **Agencia de Acceso a la Información Pública** es el organismo de control y
atiende las denuncias por incumplimiento.

## Cuánto tiempo los guardamos

Mientras tengas cuenta. Si pedís que borremos tus datos, se eliminan tus datos
personales. La historia clínica de tu mascota puede conservarse anonimizada
cuando la clínica tenga obligación profesional de hacerlo.

## Cambios

Si cambiamos esta política te vamos a pedir que aceptes la versión nueva.
Guardamos qué versión aceptaste y cuándo.
$texto$
);
