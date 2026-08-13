import { cn } from './utils.js';

/**
 * El logo de la clínica.
 *
 * Dos piezas y no una: el isotipo (perro, gato y cruz) para lugares chicos
 * —encabezados, barra del panel— y el logo completo, con el nombre, para las
 * pantallas donde la marca es lo primero que se ve: ingreso, registro y la
 * página pública del QR.
 *
 * Meter el logo completo en un encabezado de 40 px de alto haría el texto
 * ilegible y ocuparía media pantalla en un celular.
 *
 * Los archivos viven en `public/marca/` de cada app. Son de esta instalación,
 * igual que los íconos de la PWA: cambiar de clínica es reemplazarlos, no
 * tocar código (AGENTS.md, regla 6). Lo que sí puede venir de
 * `configuracion_clinica.logo_url` es una URL que pise a la del paquete, para
 * cuando la clínica sube su logo desde el panel sin volver a compilar.
 */
export function Isotipo({
  className,
  src,
  alt = 'Ojos de Cielo',
}: {
  className?: string;
  /** URL de `configuracion_clinica.logo_url`, si la clínica cargó la suya. */
  src?: string | null;
  alt?: string;
}) {
  return (
    <img
      src={src || '/marca/isotipo.png'}
      alt={alt}
      // width/height evitan que el texto de al lado salte cuando carga la
      // imagen: sin esto el encabezado se reacomoda a la vista.
      width={320}
      height={271}
      // shrink-0 además de w-auto: dentro de un flex, un `img` con altura
      // fija se comprime a lo ancho y la silueta sale aplastada.
      className={cn('h-9 w-auto shrink-0 object-contain', className)}
    />
  );
}

export function LogoCompleto({
  className,
  src,
  alt = 'Clínica Veterinaria Ojos de Cielo',
}: {
  className?: string;
  src?: string | null;
  alt?: string;
}) {
  return (
    <img
      src={src || '/marca/logo.png'}
      alt={alt}
      width={560}
      height={526}
      className={cn('h-auto w-full max-w-56 shrink-0 object-contain', className)}
    />
  );
}
