-- Un tipo de notificación nuevo para las campañas.
--
-- Va en su propia migración porque `alter type ... add value` no puede usarse
-- en la misma transacción que lo declara. Ya pasó con tipo_hallazgo.
--
-- Que sea un tipo aparte no es cosmético: preferencia_notificacion se indexa
-- por tipo, así que el tutor puede silenciar las campañas sin perder los
-- recordatorios de vacunas de su propia mascota. Son cosas distintas y la ley
-- 25.326 (art. 27) exige poder darse de baja de lo publicitario.
alter type public.tipo_notificacion add value if not exists 'campana';
