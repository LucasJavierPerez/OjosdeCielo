-- Tipo de notificación para el aviso de hallazgo (fase 4).
--
-- Va en su propia migración porque `alter type ... add value` no permite usar
-- el valor nuevo dentro de la misma transacción que lo agrega, y las
-- migraciones de Supabase corren en una.
--
-- Merece un tipo propio y no reusar 'turno': si alguien desactivó los avisos de
-- turnos, se perdería justamente el mensaje de que encontraron a su mascota.

alter type public.tipo_notificacion add value if not exists 'hallazgo';
