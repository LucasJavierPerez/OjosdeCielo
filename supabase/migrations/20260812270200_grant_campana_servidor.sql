-- Falta el SELECT de service_role sobre campana.
--
-- La Edge Function lee el título y el cuerpo para armar el push. Sin este
-- GRANT, PostgREST devolvía "no encontramos la campaña": rechaza por permisos
-- antes de llegar a evaluar RLS, y el error no distingue un caso del otro.
--
-- Tercera vez que aparece esta trampa en el proyecto (ver AGENTS.md): que
-- service_role bypasse RLS no lo exime del GRANT. Son dos capas distintas.
grant select on public.campana to service_role;
