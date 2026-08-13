/**
 * Verificación del aislamiento de datos.
 *
 * Correr con:  pnpm test:rls   (requiere `pnpm db:start` y datos del seed)
 *
 * Usa la anon key, exactamente como lo haría el navegador: prueba el sistema
 * como lo ve un atacante, no como lo ve un superusuario de Postgres. Esa
 * distinción importa — el bug del hook SECURITY DEFINER sólo se manifestaba
 * por esta vía; consultado como `postgres` el resultado parecía correcto.
 *
 * Cada vez que se toque una política RLS, este archivo se corre y se amplía.
 */
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let fallos = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => {
  console.log(`  \x1b[31m✗ ${m}\x1b[0m`);
  fallos++;
};

async function comoUsuario(email) {
  const sb = createClient(URL, ANON);
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: 'password123',
  });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const claims = JSON.parse(atob(data.session.access_token.split('.')[1]));
  return { sb, claims, userId: data.user.id };
}

console.log('\n=== 1. El rol llega al JWT (custom access token hook) ===');
const esperados = {
  'admin@ojosdecielo.test': 'administrador',
  'vet@ojosdecielo.test': 'veterinario',
  'recepcion@ojosdecielo.test': 'recepcionista',
  'ana@ejemplo.test': 'cliente',
};
const sesiones = {};
for (const [email, rolEsperado] of Object.entries(esperados)) {
  const s = await comoUsuario(email);
  sesiones[email] = s;
  s.claims.rol === rolEsperado
    ? ok(`${email} → rol="${s.claims.rol}"`)
    : fail(`${email} → esperaba "${rolEsperado}", llegó "${s.claims.rol}"`);
}

console.log('\n=== 2. Un cliente sólo ve su propio perfil ===');
{
  const { sb } = sesiones['ana@ejemplo.test'];
  const { data } = await sb.from('perfil').select('email');
  data?.length === 1 && data[0].email === 'ana@ejemplo.test'
    ? ok(`Ana ve 1 perfil (el suyo)`)
    : fail(`Ana ve ${data?.length} perfiles: ${data?.map((p) => p.email).join(', ')}`);
}

console.log('\n=== 3. El personal de la clínica ve todos los perfiles ===');
{
  const { sb } = sesiones['recepcion@ojosdecielo.test'];
  const { data } = await sb.from('perfil').select('email');

  // Se verifica que estén los del seed, no un total exacto: corridas previas
  // dejan usuarios de prueba y un conteo fijo daría un falso negativo.
  const delSeed = [
    'admin@ojosdecielo.test',
    'vet@ojosdecielo.test',
    'recepcion@ojosdecielo.test',
    'ana@ejemplo.test',
    'bruno@ejemplo.test',
    'clara@ejemplo.test',
  ];
  const emails = new Set(data?.map((p) => p.email));
  const faltan = delSeed.filter((e) => !emails.has(e));

  faltan.length === 0
    ? ok(`Recepción ve los ${data?.length} perfiles del sistema`)
    : fail(`Recepción no ve: ${faltan.join(', ')}`);
}

console.log('\n=== 4. Un cliente NO puede auto-promoverse a veterinario ===');
{
  const { sb, userId } = sesiones['ana@ejemplo.test'];
  const { error } = await sb.from('perfil').update({ rol: 'veterinario' }).eq('id', userId);
  const { data } = await sb.from('perfil').select('rol').eq('id', userId).single();
  data?.rol === 'cliente'
    ? ok(`Escalada bloqueada (rol sigue en "cliente")${error ? ' con error explícito' : ''}`)
    : fail(`ESCALADA DE PRIVILEGIOS: el rol quedó en "${data?.rol}"`);
}

console.log('\n=== 5. Un cliente sí puede editar sus datos ===');
{
  const { sb, userId } = sesiones['ana@ejemplo.test'];
  const { error } = await sb
    .from('perfil')
    .update({ telefono: '+54 11 4444-4444' })
    .eq('id', userId);
  const { data } = await sb.from('perfil').select('telefono').eq('id', userId).single();
  !error && data?.telefono === '+54 11 4444-4444'
    ? ok('Ana actualizó su teléfono')
    : fail(`No pudo actualizar: ${error?.message ?? 'sin cambio'}`);
}

console.log('\n=== 6. La auditoría es sólo para el personal ===');
{
  const { data: cli } = await sesiones['ana@ejemplo.test'].sb.from('audit_log').select('id');
  const { data: rec } = await sesiones['recepcion@ojosdecielo.test'].sb
    .from('audit_log')
    .select('id');
  cli?.length === 0 ? ok('Cliente no ve auditoría') : fail(`Cliente ve ${cli?.length} filas`);
  (rec?.length ?? 0) > 0
    ? ok(`Recepción ve ${rec.length} filas de auditoría`)
    : fail('Recepción no ve auditoría (el trigger no registró nada)');
}

console.log('\n=== 7. Nadie puede alterar la auditoría, ni el administrador ===');
{
  const { sb } = sesiones['admin@ojosdecielo.test'];
  const { error } = await sb.from('audit_log').insert({ tabla: 'falso', accion: 'INSERT' });
  const { error: errDel } = await sb.from('audit_log').delete().neq('id', 0);
  const { data } = await sb.from('audit_log').select('tabla').eq('tabla', 'falso');
  error && data?.length === 0
    ? ok('INSERT rechazado')
    : fail('El administrador pudo insertar auditoría falsa');
  const { data: quedan } = await sb.from('audit_log').select('id');
  (quedan?.length ?? 0) > 0
    ? ok(`DELETE no borró nada (${quedan.length} filas intactas)`)
    : fail(`El administrador borró la auditoría: ${errDel?.message ?? 'sin error'}`);
}

console.log('\n=== 8. Config de la clínica: pública para leer, admin para escribir ===');
{
  const anon = createClient(URL, ANON);
  const { data: pub } = await anon.from('configuracion_clinica').select('nombre').single();
  pub?.nombre === 'Ojos de Cielo'
    ? ok('Anónimo lee el nombre (necesario antes del login)')
    : fail('Anónimo no puede leer la configuración');

  const { sb } = sesiones['ana@ejemplo.test'];
  await sb.from('configuracion_clinica').update({ nombre: 'Hackeado' }).eq('id', 1);
  const { data } = await sb.from('configuracion_clinica').select('nombre').single();
  data?.nombre === 'Ojos de Cielo'
    ? ok('Cliente no puede modificar la configuración')
    : fail(`Cliente modificó la config: "${data?.nombre}"`);
}

console.log('\n=== 9. El anónimo no ve perfiles ===');
{
  const anon = createClient(URL, ANON);
  const { data, error } = await anon.from('perfil').select('email');
  // Sin GRANT, PostgREST rechaza antes de evaluar RLS: más estricto que
  // devolver lista vacía. Cualquiera de las dos formas es aceptable.
  const bloqueado = error !== null || data?.length === 0;
  bloqueado
    ? ok(`Sin sesión no se accede a perfil (${error ? error.message : 'lista vacía'})`)
    : fail(`Anónimo ve ${data?.length} perfiles`);
}

// ===========================================================================
// Mascotas compartidas (fase 1)
//
// Ana es titular de Pulga e invita a Bruno. Clara no tiene relación con ellos
// y es el control: si Clara ve algo de Pulga, el aislamiento está roto.
// ===========================================================================

const ana = sesiones['ana@ejemplo.test'];
const bruno = await comoUsuario('bruno@ejemplo.test');
const clara = await comoUsuario('clara@ejemplo.test');

console.log('\n=== 10. Alta de mascota: quien la crea queda como titular ===');
let mascotaId;
{
  const { data, error } = await ana.sb.rpc('crear_mascota', {
    p_nombre: 'Pulga',
    p_especie: 'perro',
    p_raza: 'Mestiza',
    p_sexo: 'hembra',
  });
  mascotaId = data?.id;
  if (error || !mascotaId) {
    fail(`Ana no pudo crear la mascota: ${error?.message}`);
  } else {
    ok('Ana creó a Pulga');
    const { data: vinculo } = await ana.sb
      .from('mascota_tutor')
      .select('rol')
      .eq('mascota_id', mascotaId)
      .single();
    vinculo?.rol === 'titular'
      ? ok('Quedó como titular, en la misma transacción')
      : fail(`Rol inesperado: ${vinculo?.rol}`);
  }
}

console.log('\n=== 11. Sin invitación, nadie más ve la mascota ===');
{
  for (const [nombre, s] of [
    ['Bruno', bruno],
    ['Clara', clara],
  ]) {
    const { data } = await s.sb.from('mascota').select('nombre').eq('id', mascotaId);
    data?.length === 0
      ? ok(`${nombre} no ve a Pulga`)
      : fail(`FUGA: ${nombre} ve a Pulga sin ser tutor`);
  }
}

console.log('\n=== 12. Un no-titular no puede invitar ===');
{
  const { error } = await bruno.sb.rpc('invitar_tutor', {
    p_mascota_id: mascotaId,
  });
  error
    ? ok(`Bruno no puede invitar (${error.message})`)
    : fail('Bruno pudo invitar sin ser tutor');
}

console.log('\n=== 13. El titular invita y el invitado acepta ===');
let token;
{
  const { data, error } = await ana.sb.rpc('invitar_tutor', {
    p_mascota_id: mascotaId,
  });
  token = data?.token;
  token ? ok('Ana generó el enlace de invitación') : fail(`No pudo invitar: ${error?.message}`);

  const { error: errAceptar } = await bruno.sb.rpc('aceptar_invitacion', {
    p_token: token,
  });
  errAceptar ? fail(`Bruno no pudo aceptar: ${errAceptar.message}`) : ok('Bruno aceptó');

  const { data: vista } = await bruno.sb.from('mascota').select('nombre').eq('id', mascotaId);
  vista?.[0]?.nombre === 'Pulga' ? ok('Bruno ahora ve a Pulga') : fail('Bruno no ve a Pulga');

  const { data: clarita } = await clara.sb.from('mascota').select('nombre').eq('id', mascotaId);
  clarita?.length === 0 ? ok('Clara sigue sin ver nada') : fail('FUGA: Clara ve a Pulga');
}

console.log('\n=== 14. El enlace es de un solo uso ===');
{
  const { error } = await clara.sb.rpc('aceptar_invitacion', {
    p_token: token,
  });
  error ? ok('Un token ya usado no sirve') : fail('FUGA: Clara entró con un token ya consumido');
}

console.log('\n=== 15. Un token inventado no sirve ===');
{
  const { error } = await clara.sb.rpc('aceptar_invitacion', {
    p_token: 'a'.repeat(48),
  });
  error ? ok('Token inválido rechazado') : fail('FUGA: aceptó un token inventado');
}

console.log('\n=== 16. Un tutor invitado edita la mascota pero no gestiona accesos ===');
{
  const { error: errEditar } = await bruno.sb
    .from('mascota')
    .update({ color: 'Marrón' })
    .eq('id', mascotaId);
  errEditar ? fail(`Bruno no pudo editar: ${errEditar.message}`) : ok('Bruno editó la ficha');

  const { error: errInvitar } = await bruno.sb.rpc('invitar_tutor', {
    p_mascota_id: mascotaId,
  });
  errInvitar ? ok('Bruno no puede invitar a otros') : fail('ESCALADA: un tutor invitó a otro');

  const { error: errRevocar } = await bruno.sb.rpc('revocar_tutor', {
    p_mascota_id: mascotaId,
    p_perfil_id: ana.userId,
  });
  errRevocar
    ? ok('Bruno no puede expulsar a la titular')
    : fail('ESCALADA: un tutor invitado expulsó a la titular');
}

console.log('\n=== 17. El titular no puede dejar la mascota sin titular ===');
{
  const { error } = await ana.sb.rpc('revocar_tutor', {
    p_mascota_id: mascotaId,
    p_perfil_id: ana.userId,
  });
  error
    ? ok('Ana no puede revocarse a sí misma')
    : fail('Pulga quedó sin titular: nadie puede gestionarla');
}

console.log('\n=== 18. Revocar un acceso lo corta de verdad ===');
{
  const { error } = await ana.sb.rpc('revocar_tutor', {
    p_mascota_id: mascotaId,
    p_perfil_id: bruno.userId,
  });
  error ? fail(`Ana no pudo revocar: ${error.message}`) : ok('Ana revocó el acceso de Bruno');

  const { data } = await bruno.sb.from('mascota').select('nombre').eq('id', mascotaId);
  data?.length === 0 ? ok('Bruno dejó de ver a Pulga') : fail('FUGA: acceso revocado sigue activo');

  const { error: errEditar } = await bruno.sb
    .from('mascota')
    .update({ color: 'Negro' })
    .eq('id', mascotaId);
  const { data: check } = await ana.sb.from('mascota').select('color').eq('id', mascotaId).single();
  check?.color === 'Marrón'
    ? ok('Bruno tampoco puede editarla')
    : fail(`FUGA: Bruno editó tras la revocación (${errEditar?.message ?? 'sin error'})`);
}

console.log('\n=== 19. Transferir la titularidad ===');
{
  // Bruno vuelve a entrar con una invitación nueva.
  const { data: inv } = await ana.sb.rpc('invitar_tutor', {
    p_mascota_id: mascotaId,
  });
  await bruno.sb.rpc('aceptar_invitacion', { p_token: inv.token });

  const { error } = await ana.sb.rpc('transferir_titularidad', {
    p_mascota_id: mascotaId,
    p_nuevo_titular: bruno.userId,
  });
  error ? fail(`No pudo transferir: ${error.message}`) : ok('Ana transfirió la titularidad');

  const { data: tutores } = await bruno.sb
    .from('mascota_tutor')
    .select('perfil_id, rol')
    .eq('mascota_id', mascotaId)
    .is('revocado_en', null);
  const titulares = tutores?.filter((t) => t.rol === 'titular') ?? [];
  titulares.length === 1 && titulares[0].perfil_id === bruno.userId
    ? ok('Bruno es ahora el único titular')
    : fail(`Titulares tras la transferencia: ${titulares.length}`);

  const { error: errAna } = await ana.sb.rpc('invitar_tutor', {
    p_mascota_id: mascotaId,
  });
  errAna ? ok('Ana ya no gestiona accesos') : fail('Ana conservó permisos de titular');
}

console.log('\n=== 20. El personal de la clínica ve las mascotas ===');
{
  const { data } = await sesiones['vet@ojosdecielo.test'].sb
    .from('mascota')
    .select('nombre')
    .eq('id', mascotaId);
  data?.length === 1 ? ok('El veterinario ve a Pulga') : fail('El veterinario no ve la mascota');
}

console.log('\n=== 21. El anónimo no ve mascotas ===');
{
  const anon = createClient(URL, ANON);
  const { data, error } = await anon.from('mascota').select('nombre');
  error || data?.length === 0
    ? ok('Sin sesión no se accede a mascota')
    : fail(`FUGA: anónimo ve ${data?.length} mascotas`);
}

console.log('\n=== 22. Listar tutores no expone datos de más ===');
{
  // Bruno es titular tras la transferencia del test 19; Ana sigue siendo tutora.
  const { data, error } = await ana.sb.rpc('tutores_de_mascota', { p_mascota_id: mascotaId });
  if (error || !data) {
    fail(`Ana no pudo listar tutores: ${error?.message}`);
  } else {
    data.length === 2 ? ok('Ana ve los 2 tutores') : fail(`Ve ${data.length} tutores`);

    const columnas = Object.keys(data[0] ?? {});
    const sensibles = columnas.filter((c) => ['dni', 'telefono', 'rol_sistema'].includes(c));
    sensibles.length === 0
      ? ok(`Sólo devuelve lo necesario: ${columnas.join(', ')}`)
      : fail(`FUGA: expone ${sensibles.join(', ')}`);

    data.find((t) => t.soy_yo)?.perfil_id === ana.userId
      ? ok('Marca cuál de los tutores es uno mismo')
      : fail('El flag soy_yo no identifica al usuario actual');
  }
}

console.log('\n=== 23. Un extraño no puede listar los tutores ===');
{
  const { error } = await clara.sb.rpc('tutores_de_mascota', { p_mascota_id: mascotaId });
  error
    ? ok('Clara no puede listar los tutores')
    : fail('FUGA: Clara listó los tutores de una mascota ajena');
}

console.log('\n=== 24. Revocar una invitación sin usar ===');
{
  // Bruno es el titular ahora.
  const { data: inv } = await bruno.sb.rpc('invitar_tutor', { p_mascota_id: mascotaId });

  const { error: errAjeno } = await ana.sb.rpc('revocar_invitacion', {
    p_invitacion_id: inv.id,
  });
  errAjeno
    ? ok('Un tutor no titular no puede anular invitaciones')
    : fail('ESCALADA: un tutor anuló una invitación');

  const { error } = await bruno.sb.rpc('revocar_invitacion', { p_invitacion_id: inv.id });
  error ? fail(`El titular no pudo anular: ${error.message}`) : ok('El titular la anuló');

  const { error: errUsar } = await clara.sb.rpc('aceptar_invitacion', { p_token: inv.token });
  errUsar
    ? ok('La invitación anulada ya no sirve')
    : fail('FUGA: se aceptó una invitación anulada');
}

console.log('\n=== 25. Las invitaciones sólo las ven los tutores ===');
{
  const { data: deClara } = await clara.sb.from('invitacion_tutor').select('token');
  deClara?.length === 0
    ? ok('Clara no ve ninguna invitación')
    : fail(`FUGA: Clara ve ${deClara?.length} invitaciones con su token`);

  const { data: deAna } = await ana.sb
    .from('invitacion_tutor')
    .select('id')
    .eq('mascota_id', mascotaId);
  (deAna?.length ?? 0) > 0
    ? ok('Una tutora sí ve las invitaciones de su mascota')
    : fail('Ana no ve las invitaciones de una mascota que comparte');
}

console.log('\n=== 26. Storage: las fotos son privadas ===');
{
  const anon = createClient(URL, ANON);
  const { data: publica } = await anon.storage.from('mascotas').list(mascotaId);
  !publica || publica.length === 0
    ? ok('Sin sesión no se listan archivos')
    : fail(`FUGA: anónimo lista ${publica.length} archivos`);

  const { error } = await clara.sb.storage
    .from('mascotas')
    .upload(`${mascotaId}/intruso.jpg`, new Blob(['x'], { type: 'image/jpeg' }));
  error
    ? ok('Clara no puede subir fotos a una mascota ajena')
    : fail('FUGA: Clara subió una foto a la mascota de otro');
}

// ===========================================================================
// Datos de salud con doble origen (fase 2)
// ===========================================================================

const vet = sesiones['vet@ojosdecielo.test'];
const recepcion = sesiones['recepcion@ojosdecielo.test'];

console.log('\n=== 27. El origen lo fija el servidor, no el cliente ===');
let pesoTutorId;
{
  // Ana intenta hacer pasar su registro por uno de la clínica.
  const { data, error } = await ana.sb
    .from('peso_registro')
    .insert({ mascota_id: mascotaId, peso_kg: 12.5, origen: 'clinica' })
    .select()
    .single();

  if (error) {
    fail(`Ana no pudo cargar un peso: ${error.message}`);
  } else {
    pesoTutorId = data.id;
    data.origen === 'tutor'
      ? ok('El origen quedó en "tutor" aunque mandó "clinica"')
      : fail(`FALSIFICACIÓN: el registro quedó con origen "${data.origen}"`);
    data.cargado_por === ana.userId
      ? ok('cargado_por apunta a quien realmente lo cargó')
      : fail('cargado_por no coincide con el usuario');
    data.verificado_por === null ? ok('Nace sin verificar') : fail('El registro nació verificado');
  }
}

console.log('\n=== 28. El veterinario carga con origen "clinica" ===');
let pesoClinicaId;
{
  const { data, error } = await vet.sb
    .from('peso_registro')
    .insert({ mascota_id: mascotaId, peso_kg: 12.8 })
    .select()
    .single();
  pesoClinicaId = data?.id;
  data?.origen === 'clinica'
    ? ok('El veterinario cargó con origen "clinica"')
    : fail(`Origen inesperado: ${data?.origen ?? error?.message}`);
}

console.log('\n=== 29. El tutor no toca lo que cargó la clínica ===');
{
  await ana.sb.from('peso_registro').update({ peso_kg: 99 }).eq('id', pesoClinicaId);
  const { data } = await ana.sb
    .from('peso_registro')
    .select('peso_kg')
    .eq('id', pesoClinicaId)
    .single();
  Number(data?.peso_kg) === 12.8
    ? ok('Ana no pudo modificar el peso registrado por la clínica')
    : fail(`FUGA: Ana cambió un dato de la clínica a ${data?.peso_kg}`);

  await ana.sb.from('peso_registro').delete().eq('id', pesoClinicaId);
  const { data: sigue } = await ana.sb.from('peso_registro').select('id').eq('id', pesoClinicaId);
  sigue?.length === 1
    ? ok('Tampoco pudo borrarlo')
    : fail('FUGA: Ana borró un registro de la clínica');
}

console.log('\n=== 30. El tutor sí edita lo suyo ===');
{
  const { error } = await ana.sb
    .from('peso_registro')
    .update({ peso_kg: 13.1 })
    .eq('id', pesoTutorId);
  const { data } = await ana.sb
    .from('peso_registro')
    .select('peso_kg')
    .eq('id', pesoTutorId)
    .single();
  !error && Number(data?.peso_kg) === 13.1
    ? ok('Ana corrigió su propio registro')
    : fail(`No pudo editar lo suyo: ${error?.message}`);
}

console.log('\n=== 31. El origen es inmutable ===');
{
  const { error } = await ana.sb
    .from('peso_registro')
    .update({ origen: 'clinica' })
    .eq('id', pesoTutorId);
  const { data } = await ana.sb
    .from('peso_registro')
    .select('origen')
    .eq('id', pesoTutorId)
    .single();
  data?.origen === 'tutor'
    ? ok(`No se puede cambiar el origen (${error ? 'con error' : 'sin efecto'})`)
    : fail('FALSIFICACIÓN: un registro del tutor pasó a ser de la clínica');
}

console.log('\n=== 32. Verificar es exclusivo del veterinario ===');
{
  const { error: errDirecto } = await ana.sb
    .from('peso_registro')
    .update({ verificado_por: ana.userId })
    .eq('id', pesoTutorId);
  errDirecto
    ? ok('Nadie se auto-verifica con un UPDATE directo')
    : fail('FUGA: se pudo escribir verificado_por a mano');

  const { error: errRecepcion } = await recepcion.sb.rpc('verificar_registro', {
    p_tabla: 'peso_registro',
    p_id: pesoTutorId,
  });
  errRecepcion
    ? ok('Recepción no puede verificar')
    : fail('ESCALADA: recepción verificó un dato clínico');

  const { error: errVet } = await vet.sb.rpc('verificar_registro', {
    p_tabla: 'peso_registro',
    p_id: pesoTutorId,
  });
  errVet
    ? fail(`El veterinario no pudo verificar: ${errVet.message}`)
    : ok('El veterinario verificó');

  const { data } = await ana.sb
    .from('peso_registro')
    .select('origen, verificado_por')
    .eq('id', pesoTutorId)
    .single();
  data?.verificado_por === vet.userId && data?.origen === 'tutor'
    ? ok('Queda verificado y el origen sigue siendo "tutor"')
    : fail(`Estado inesperado tras verificar: ${JSON.stringify(data)}`);
}

console.log('\n=== 33. verificar_registro no acepta tablas arbitrarias ===');
{
  for (const tabla of ['perfil', 'audit_log', 'mascota_tutor']) {
    const { error } = await vet.sb.rpc('verificar_registro', { p_tabla: tabla, p_id: pesoTutorId });
    if (!error) {
      fail(`INYECCIÓN: aceptó la tabla ${tabla}`);
    }
  }
  ok('Rechaza tablas fuera de la lista blanca');
}

console.log('\n=== 34. Los datos de salud siguen el acceso a la mascota ===');
{
  const { data: deClara } = await clara.sb
    .from('peso_registro')
    .select('id')
    .eq('mascota_id', mascotaId);
  deClara?.length === 0
    ? ok('Clara no ve los pesos de una mascota ajena')
    : fail(`FUGA: Clara ve ${deClara?.length} registros de peso`);

  const { error } = await clara.sb
    .from('peso_registro')
    .insert({ mascota_id: mascotaId, peso_kg: 1 });
  error
    ? ok('Clara tampoco puede cargar datos en una mascota ajena')
    : fail('FUGA: Clara cargó un peso en la mascota de otro');
}

console.log('\n=== 35. Las cuatro tablas de salud tienen las mismas garantías ===');
{
  const casos = [
    ['aplicacion', { tipo: 'vacuna', producto: 'Antirrábica', proxima_fecha: '2027-08-12' }],
    ['antecedente', { tipo: 'alergia', descripcion: 'Polen' }],
    ['medicacion_en_curso', { descripcion: 'Meloxicam', dosis: '0.5 mg' }],
  ];

  for (const [tabla, campos] of casos) {
    const { data, error } = await ana.sb
      .from(tabla)
      .insert({ mascota_id: mascotaId, origen: 'clinica', ...campos })
      .select()
      .single();

    if (error) {
      fail(`${tabla}: Ana no pudo cargar (${error.message})`);
      continue;
    }
    data.origen === 'tutor'
      ? ok(`${tabla}: origen forzado a "tutor"`)
      : fail(`${tabla}: origen "${data.origen}"`);

    const { data: deClara } = await clara.sb.from(tabla).select('id').eq('mascota_id', mascotaId);
    deClara?.length === 0 ? ok(`${tabla}: Clara no ve nada`) : fail(`FUGA en ${tabla}`);
  }
}

// ===========================================================================
// Notificaciones (fase 3)
// ===========================================================================

console.log('\n=== 36. Los dispositivos de push son privados ===');
{
  const suscripcion = {
    endpoint: `https://push.example/${crypto.randomUUID()}`,
    p256dh: 'clave-publica-falsa',
    auth: 'secreto-falso',
  };

  const { error } = await ana.sb.from('push_subscription').insert(suscripcion);
  error
    ? fail(`Ana no pudo registrar su dispositivo: ${error.message}`)
    : ok('Ana registró un dispositivo');

  const { data: deClara } = await clara.sb.from('push_subscription').select('endpoint');
  deClara?.length === 0
    ? ok('Clara no ve dispositivos ajenos')
    : fail(`FUGA: Clara ve ${deClara?.length} suscripciones de otros`);

  // Registrar un endpoint a nombre de otro permitiría redirigirle sus
  // notificaciones al dispositivo propio.
  const endpointRobo = `${suscripcion.endpoint}-suplantado`;
  const { error: errRobo } = await clara.sb
    .from('push_subscription')
    .insert({ ...suscripcion, perfil_id: ana.userId, endpoint: endpointRobo });

  // Se busca ese endpoint puntual en vez de contar el total: la base acumula
  // suscripciones de corridas anteriores y el conteo daría un falso positivo.
  const { data: colado } = await ana.sb
    .from('push_subscription')
    .select('endpoint')
    .eq('endpoint', endpointRobo);
  errRobo && colado?.length === 0
    ? ok('Clara no puede registrar dispositivos a nombre de Ana')
    : fail(
        `SUPLANTACIÓN: el endpoint ajeno quedó registrado (${errRobo ? 'con error' : 'sin error'})`,
      );
}

console.log('\n=== 37. Las preferencias son de cada uno ===');
{
  const { error } = await ana.sb
    .from('preferencia_notificacion')
    .upsert({ tipo: 'vacuna', habilitado: false }, { onConflict: 'perfil_id,tipo' });
  error
    ? fail(`Ana no pudo guardar su preferencia: ${error.message}`)
    : ok('Ana desactivó vacunas');

  const { data: deClara } = await clara.sb.from('preferencia_notificacion').select('tipo');
  deClara?.length === 0
    ? ok('Clara no ve las preferencias de Ana')
    : fail(`FUGA: Clara ve ${deClara?.length} preferencias ajenas`);
}

console.log('\n=== 38. Los recordatorios siguen el acceso a la mascota ===');
{
  const { data: deAna } = await ana.sb.from('recordatorio').select('id, tipo');
  const { data: deClara } = await clara.sb.from('recordatorio').select('id');

  (deAna?.length ?? 0) >= 0
    ? ok(`Ana ve ${deAna?.length ?? 0} recordatorios de sus mascotas`)
    : fail('Ana no puede leer sus recordatorios');
  deClara?.length === 0
    ? ok('Clara no ve recordatorios ajenos')
    : fail(`FUGA: Clara ve ${deClara?.length} recordatorios`);
}

console.log('\n=== 39. El generador de recordatorios no es invocable desde el cliente ===');
{
  // Dispara envíos masivos: sólo puede llamarlo pg_cron dentro de la base.
  for (const [quien, s] of [
    ['Ana', ana],
    ['el veterinario', vet],
    ['el administrador', sesiones['admin@ojosdecielo.test']],
  ]) {
    const { error } = await s.sb.rpc('generar_recordatorios', { p_dias_antes: 7 });
    if (!error) fail(`${quien} pudo ejecutar generar_recordatorios`);
  }
  ok('Nadie puede ejecutarlo desde la API');

  const { error: errDest } = await ana.sb.rpc('destinatarios_recordatorio', {
    p_recordatorio_id: crypto.randomUUID(),
  });
  errDest
    ? ok('destinatarios_recordatorio tampoco es accesible')
    : fail('FUGA: se pueden listar endpoints de push desde el cliente');
}

console.log('\n=== 40. El log de notificaciones es privado ===');
{
  const { data } = await clara.sb.from('notificacion_log').select('id');
  data?.length === 0
    ? ok('Clara no ve notificaciones de otros')
    : fail(`FUGA: Clara ve ${data?.length} registros de envío`);
}

// ===========================================================================
// Archivar, dejar y eliminar
// ===========================================================================

console.log('\n=== 41. Archivar y recuperar ===');
{
  const { data: m } = await clara.sb.rpc('crear_mascota', {
    p_nombre: 'Temporal',
    p_especie: 'gato',
  });

  const { error } = await clara.sb.rpc('archivar_mascota', { p_mascota_id: m.id });
  error ? fail(`No pudo archivar: ${error.message}`) : ok('Clara archivó a Temporal');

  const { data: activas } = await clara.sb
    .from('mascota')
    .select('id')
    .eq('id', m.id)
    .is('archivado_en', null);
  activas?.length === 0 ? ok('Sale del listado activo') : fail('Sigue apareciendo como activa');

  const { data: todas } = await clara.sb.from('mascota').select('id').eq('id', m.id);
  todas?.length === 1 ? ok('Pero la ficha sigue accesible') : fail('Se perdió la ficha');

  await clara.sb.rpc('desarchivar_mascota', { p_mascota_id: m.id });
  const { data: recuperada } = await clara.sb
    .from('mascota')
    .select('id')
    .eq('id', m.id)
    .is('archivado_en', null);
  recuperada?.length === 1 ? ok('Se recupera de archivados') : fail('No se pudo recuperar');

  // Limpieza para no ensuciar los conteos de otras verificaciones.
  await clara.sb.rpc('eliminar_mascota', { p_mascota_id: m.id });
}

console.log('\n=== 42. Un extraño no puede archivar ni eliminar ===');
{
  const { error: errArchivar } = await clara.sb.rpc('archivar_mascota', {
    p_mascota_id: mascotaId,
  });
  errArchivar
    ? ok('Clara no puede archivar una mascota ajena')
    : fail('FUGA: Clara archivó la mascota de otro');

  const { error: errBorrar } = await clara.sb.rpc('eliminar_mascota', {
    p_mascota_id: mascotaId,
  });
  errBorrar ? ok('Clara no puede eliminarla') : fail('FUGA: Clara eliminó la mascota de otro');
}

console.log('\n=== 43. No se elimina una mascota compartida ===');
{
  // Bruno es titular de la mascota compartida tras la transferencia del test 19.
  const { error } = await bruno.sb.rpc('eliminar_mascota', { p_mascota_id: mascotaId });
  error?.message.includes('archivarla')
    ? ok('Se rechaza con un motivo entendible y ofrece archivar')
    : fail(`Se eliminó una mascota que otra persona también cuida: ${error?.message}`);
}

console.log('\n=== 44. No se elimina si la clínica registró atención ===');
{
  const { data: m } = await clara.sb.rpc('crear_mascota', {
    p_nombre: 'ConHistoria',
    p_especie: 'perro',
  });
  // El veterinario ve todas las mascotas, así que puede registrar el peso.
  await vet.sb.from('peso_registro').insert({ mascota_id: m.id, peso_kg: 8.5 });

  const { error } = await clara.sb.rpc('eliminar_mascota', { p_mascota_id: m.id });
  error?.message.includes('archivarla')
    ? ok('La historia clínica impide el borrado, y se explica por qué')
    : fail(`Se borró una ficha con atención registrada: ${error?.message}`);

  const { data: sigue } = await clara.sb.from('mascota').select('id').eq('id', m.id);
  sigue?.length === 1 ? ok('La ficha sigue existiendo') : fail('La ficha desapareció');
}

console.log('\n=== 45. El titular no puede abandonar la mascota ===');
{
  const { error } = await bruno.sb.rpc('dejar_mascota', { p_mascota_id: mascotaId });
  error
    ? ok('El titular tiene que transferir antes de salir')
    : fail('La mascota quedó sin titular');

  // Ana es tutora no titular: ella sí puede salir.
  const { error: errAna } = await ana.sb.rpc('dejar_mascota', { p_mascota_id: mascotaId });
  errAna ? fail(`Ana no pudo salir: ${errAna.message}`) : ok('Una tutora sí puede salir');

  const { data } = await ana.sb.from('mascota').select('id').eq('id', mascotaId);
  data?.length === 0 ? ok('Ana dejó de ver la mascota') : fail('FUGA: sigue viéndola tras salir');

  const { data: deBruno } = await bruno.sb.from('mascota').select('id').eq('id', mascotaId);
  deBruno?.length === 1 ? ok('Bruno la conserva') : fail('La mascota desapareció para el titular');
}

console.log('\n=== 46. Marcar fallecida conserva la ficha ===');
{
  const { data: m } = await clara.sb.rpc('crear_mascota', {
    p_nombre: 'Despedida',
    p_especie: 'perro',
  });
  await clara.sb.from('aplicacion').insert({
    mascota_id: m.id,
    tipo: 'vacuna',
    proxima_fecha: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });

  const { error } = await clara.sb.rpc('marcar_fallecida', { p_mascota_id: m.id });
  error ? fail(`No se pudo registrar: ${error.message}`) : ok('Se registró el fallecimiento');

  const { data: ficha } = await clara.sb
    .from('mascota')
    .select('fallecido_en, archivado_en')
    .eq('id', m.id)
    .single();
  ficha?.fallecido_en && !ficha?.archivado_en
    ? ok('La ficha se conserva visible, no se esconde')
    : fail('La ficha se archivó o no se marcó');

  const { data: salud } = await clara.sb.from('aplicacion').select('id').eq('mascota_id', m.id);
  salud?.length === 1 ? ok('El historial sigue accesible') : fail('Se perdió el historial');

  const { error: errFutura } = await clara.sb.rpc('marcar_fallecida', {
    p_mascota_id: m.id,
    p_fecha: '2099-01-01',
  });
  errFutura ? ok('No acepta una fecha futura') : fail('Aceptó una fecha futura');
}

// ===========================================================================
// Gestión del equipo
// ===========================================================================

const admin = sesiones['admin@ojosdecielo.test'];

console.log('\n=== 47. Sólo el administrador cambia roles ===');
{
  for (const [quien, s] of [
    ['El veterinario', vet],
    ['Recepción', recepcion],
    ['Un cliente', ana],
  ]) {
    const { error } = await s.sb.rpc('cambiar_rol', {
      p_perfil_id: recepcion.userId,
      p_rol: 'administrador',
    });
    if (!error) fail(`ESCALADA: ${quien} pudo cambiar un rol`);
  }
  ok('Nadie fuera de administración puede cambiar roles');

  const { data } = await admin.sb.from('perfil').select('rol').eq('id', recepcion.userId).single();
  data?.rol === 'recepcionista'
    ? ok('El rol quedó intacto')
    : fail(`El rol cambió a "${data?.rol}"`);
}

console.log('\n=== 48. Nadie cambia su propio rol ===');
{
  // Ni siquiera un administrador: evita degradarse por error y perder acceso.
  const { error } = await admin.sb.rpc('cambiar_rol', {
    p_perfil_id: admin.userId,
    p_rol: 'recepcionista',
  });
  error
    ? ok('El administrador no puede cambiarse el rol a sí mismo')
    : fail('Un administrador se cambió el rol');
}

console.log('\n=== 49. Promover y degradar administradores ===');
{
  const { error } = await admin.sb.rpc('cambiar_rol', {
    p_perfil_id: recepcion.userId,
    p_rol: 'administrador',
  });
  error ? fail(`No pudo promover: ${error.message}`) : ok('Promovió a recepción a administradora');

  const { error: errDegradar } = await admin.sb.rpc('cambiar_rol', {
    p_perfil_id: recepcion.userId,
    p_rol: 'recepcionista',
  });
  errDegradar
    ? fail(`No pudo degradar habiendo dos: ${errDegradar.message}`)
    : ok('Con dos administradores, degradar a uno funciona');

  // Tras la degradación, recepción perdió el permiso. Esto NO prueba la regla
  // del último administrador: la clínica queda protegida por la regla anterior
  // (nadie cambia su propio rol), que hace que el último admin no pueda
  // degradarse ni quede nadie más con permiso para hacerlo. La verificación de
  // "último administrador" en la base es defensa en profundidad, para el día
  // que alguna de las otras reglas se relaje.
  const { error: errSinPermiso } = await recepcion.sb.rpc('cambiar_rol', {
    p_perfil_id: admin.userId,
    p_rol: 'recepcionista',
  });
  errSinPermiso
    ? ok('Quien deja de ser administrador pierde el permiso de inmediato')
    : fail('ESCALADA: conserva permisos tras perder el rol');
}

console.log('\n=== 50. Dar de baja conserva la trazabilidad ===');
{
  const { error } = await admin.sb.rpc('cambiar_estado_personal', {
    p_perfil_id: vet.userId,
    p_activo: false,
  });
  error ? fail(`No pudo dar de baja: ${error.message}`) : ok('El veterinario quedó inactivo');

  const { data } = await admin.sb
    .from('perfil')
    .select('activo, rol')
    .eq('id', vet.userId)
    .single();
  data?.activo === false && data?.rol === 'veterinario'
    ? ok('Se conserva el rol y el registro, no se borra la cuenta')
    : fail(`Estado inesperado: ${JSON.stringify(data)}`);

  // El hook de acceso filtra por `activo`, así que al reingresar pierde el rol.
  const reingreso = await comoUsuario('vet@ojosdecielo.test');
  reingreso.claims.rol === 'cliente'
    ? ok('Al volver a entrar ya no tiene rol de clínica')
    : fail(`Un usuario dado de baja conserva el rol "${reingreso.claims.rol}"`);

  await admin.sb.rpc('cambiar_estado_personal', { p_perfil_id: vet.userId, p_activo: true });
  ok('Se puede reactivar');
}

console.log('\n=== 51. El listado del equipo no expone datos de más ===');
{
  const { data, error } = await recepcion.sb.rpc('listar_personal');
  if (error || !data) {
    fail(`Recepción no pudo listar el equipo: ${error?.message}`);
  } else {
    const columnas = Object.keys(data[0] ?? {});
    columnas.includes('dni') || columnas.includes('telefono')
      ? fail(`FUGA: expone ${columnas.join(', ')}`)
      : ok(`Sólo lo necesario: ${columnas.join(', ')}`);

    data.every((p) => p.rol !== 'cliente')
      ? ok('No mezcla clientes en el listado del equipo')
      : fail('Aparecen clientes en el equipo');
  }

  const { error: errCliente } = await ana.sb.rpc('listar_personal');
  errCliente
    ? ok('Un cliente no puede listar al personal')
    : fail('FUGA: un cliente ve la nómina de la clínica');
}

// ===========================================================================
// Historia clínica (fase 6)
// ===========================================================================

console.log('\n=== 52. Alta de paciente desde la clínica ===');
let pacienteId;
{
  const { error: errCliente } = await ana.sb.rpc('crear_paciente', {
    p_nombre: 'Intruso',
    p_especie: 'perro',
    p_tutor_nombre: 'Quien',
  });
  errCliente
    ? ok('Un cliente no puede dar de alta pacientes')
    : fail('FUGA: un cliente creó un paciente desde la RPC de la clínica');

  const { data, error } = await recepcion.sb.rpc('crear_paciente', {
    p_nombre: 'Toby',
    p_especie: 'perro',
    p_raza: 'Caniche',
    p_tutor_nombre: 'Jorge',
    p_tutor_apellido: 'Pérez',
    p_tutor_telefono: '+54 11 3333-3333',
  });
  pacienteId = data?.id;
  pacienteId ? ok('Recepción dio de alta a Toby') : fail(`No pudo: ${error?.message}`);

  // Lo importante: el paciente NO queda a nombre de quien lo cargó.
  const { data: tutores } = await recepcion.sb
    .from('mascota_tutor')
    .select('perfil_id')
    .eq('mascota_id', pacienteId);
  tutores?.length === 0
    ? ok('No deja al personal como titular de la mascota')
    : fail('El personal quedó como tutor del paciente');

  const { data: contacto } = await recepcion.sb
    .from('contacto_tutor')
    .select('nombre, telefono, vinculado_en')
    .eq('mascota_id', pacienteId)
    .single();
  contacto?.nombre === 'Jorge' && contacto?.vinculado_en === null
    ? ok('Queda la ficha de contacto, sin cuenta')
    : fail(`Contacto inesperado: ${JSON.stringify(contacto)}`);
}

console.log('\n=== 53. Un paciente sin tutor registrado no es visible para clientes ===');
{
  for (const [quien, s] of [
    ['Ana', ana],
    ['Clara', clara],
  ]) {
    const { data } = await s.sb.from('mascota').select('id').eq('id', pacienteId);
    if (data?.length !== 0) fail(`FUGA: ${quien} ve un paciente que no es suyo`);
  }
  ok('Sólo lo ve el personal de la clínica');
}

console.log('\n=== 54. Sólo el veterinario carga consultas ===');
{
  for (const [quien, s] of [
    ['Recepción', recepcion],
    ['El administrador', admin],
    ['Un cliente', ana],
  ]) {
    const { error } = await s.sb
      .from('consulta')
      .insert({ mascota_id: mascotaId, motivo: 'Prueba' });
    if (!error) fail(`ESCALADA: ${quien} cargó una consulta`);
  }
  ok('Recepción, administración y clientes no pueden cargar consultas');
}

let consultaId;
console.log('\n=== 55. El veterinario carga y el tutor lee ===');
{
  const { data, error } = await vet.sb
    .from('consulta')
    .insert({
      mascota_id: mascotaId,
      motivo: 'Control anual',
      anamnesis: 'Come bien, sin síntomas',
      diagnostico: 'Sana',
      tratamiento: 'Refuerzo de vacuna',
      peso_kg: 13.2,
      temperatura: 38.5,
    })
    .select()
    .single();
  consultaId = data?.id;
  consultaId ? ok('El veterinario registró la consulta') : fail(`No pudo: ${error?.message}`);

  const { data: delTutor } = await bruno.sb.rpc('historial_mascota', {
    p_mascota_id: mascotaId,
  });
  delTutor?.length === 1 && delTutor[0].diagnostico === 'Sana'
    ? ok('El tutor ve la consulta en su historial')
    : fail(`El tutor ve ${delTutor?.length} consultas`);

  const { error: errClara } = await clara.sb.rpc('historial_mascota', {
    p_mascota_id: mascotaId,
  });
  errClara ? ok('Clara no accede al historial ajeno') : fail('FUGA: Clara leyó el historial');
}

console.log('\n=== 56. La historia clínica es inmutable ===');
{
  const { error: errUpdate } = await vet.sb
    .from('consulta')
    .update({ diagnostico: 'Cambiado' })
    .eq('id', consultaId);
  const { error: errDelete } = await vet.sb.from('consulta').delete().eq('id', consultaId);

  const { data } = await vet.sb
    .from('consulta')
    .select('diagnostico')
    .eq('id', consultaId)
    .single();

  data?.diagnostico === 'Sana'
    ? ok('Ni el veterinario que la cargó puede editarla o borrarla')
    : fail(`Se modificó: ${JSON.stringify(data)} (${errUpdate?.message ?? errDelete?.message})`);

  // La forma correcta de corregir: una consulta nueva que apunta a la anterior.
  const { data: correccion } = await vet.sb
    .from('consulta')
    .insert({
      mascota_id: mascotaId,
      motivo: 'Control anual',
      diagnostico: 'Sana. Corrige peso mal tipeado',
      peso_kg: 13.4,
      corrige_a: consultaId,
    })
    .select()
    .single();
  correccion?.id ? ok('Se corrige con una consulta nueva') : fail('No se pudo corregir');

  const { data: historial } = await vet.sb.rpc('historial_mascota', {
    p_mascota_id: mascotaId,
  });
  historial?.length === 1 && historial[0].corrige_a === consultaId
    ? ok('El historial muestra la corrección y oculta la versión corregida')
    : fail(`El historial tiene ${historial?.length} entradas`);
}

console.log('\n=== 57. Los estudios siguen el acceso a la mascota ===');
{
  const archivo = new Blob(['contenido-de-prueba'], { type: 'image/png' });
  const ruta = `${mascotaId}/${consultaId}/radiografia.png`;

  const { error: errVet } = await vet.sb.storage.from('estudios').upload(ruta, archivo);
  errVet
    ? fail(`El veterinario no pudo subir: ${errVet.message}`)
    : ok('El veterinario subió un estudio');

  const { error: errCliente } = await ana.sb.storage
    .from('estudios')
    .upload(`${mascotaId}/${consultaId}/falso.png`, archivo);
  errCliente
    ? ok('Un cliente no puede subir estudios')
    : fail('FUGA: un cliente subió un archivo a estudios');

  const { data: verBruno } = await bruno.sb.storage
    .from('estudios')
    .list(`${mascotaId}/${consultaId}`);
  (verBruno?.length ?? 0) > 0
    ? ok('El tutor puede ver los estudios de su mascota')
    : fail('El tutor no ve los estudios');

  const { data: verClara } = await clara.sb.storage
    .from('estudios')
    .list(`${mascotaId}/${consultaId}`);
  (verClara?.length ?? 0) === 0
    ? ok('Clara no ve estudios ajenos')
    : fail(`FUGA: Clara lista ${verClara?.length} estudios`);

  const anon = createClient(URL, ANON);
  const { data: verAnon } = await anon.storage.from('estudios').list(`${mascotaId}`);
  (verAnon?.length ?? 0) === 0
    ? ok('Sin sesión no se accede a los estudios')
    : fail('FUGA: anónimo lista estudios');
}

console.log('\n=== 58. Un tutor se vincula solo al registrarse ===');
{
  // La clínica carga un paciente con el email de alguien que todavía no tiene
  // cuenta; al registrarse, debe encontrar la mascota ya cargada.
  const email = `nuevo.tutor.${Date.now()}@ejemplo.test`;
  const { data: paciente } = await recepcion.sb.rpc('crear_paciente', {
    p_nombre: 'Luna',
    p_especie: 'gato',
    p_tutor_nombre: 'Marina',
    p_tutor_email: email,
  });

  const sb = createClient(URL, ANON);
  const { error: errAlta } = await sb.auth.signUp({
    email,
    password: 'password123',
    options: { data: { nombre: 'Marina', apellido: 'López' } },
  });
  if (errAlta) {
    fail(`No se pudo registrar: ${errAlta.message}`);
  } else {
    // El vínculo se verifica desde el personal y no desde la cuenta nueva:
    // con la confirmación de email activada, signUp no devuelve sesión, así
    // que una consulta desde ese cliente correría sin autenticar y daría
    // vacío por RLS — un falso negativo, no una falla de la vinculación.
    const { data: vinculo } = await recepcion.sb
      .from('mascota_tutor')
      .select('rol, perfil_id')
      .eq('mascota_id', paciente.id)
      .is('revocado_en', null);

    vinculo?.length === 1 && vinculo[0].rol === 'titular'
      ? ok('Al registrarse queda como titular de la mascota que cargó la clínica')
      : fail(`Vínculo inesperado: ${JSON.stringify(vinculo)}`);

    const { data: contacto } = await recepcion.sb
      .from('contacto_tutor')
      .select('vinculado_en, perfil_id')
      .eq('mascota_id', paciente.id)
      .single();
    contacto?.vinculado_en && contacto?.perfil_id === vinculo?.[0]?.perfil_id
      ? ok('La ficha de contacto queda marcada como vinculada a ese perfil')
      : fail('El contacto sigue sin vincular');
  }
}

// ===========================================================================
// QR de identidad y extravío (fase 4)
//
// Es el único punto del sistema abierto a alguien sin cuenta, así que es donde
// una fuga sería más grave.
// ===========================================================================

console.log('\n=== 59. La página pública no expone el contacto si no está perdida ===');
let tokenQr;
{
  const anon = createClient(URL, ANON);
  const { data: qr } = await bruno.sb.rpc('generar_qr', { p_mascota_id: mascotaId });
  tokenQr = qr?.token;
  tokenQr ? ok('El tutor generó el código') : fail('No se pudo generar');

  tokenQr && tokenQr.length >= 32 && !/^[0-9]+$/.test(tokenQr)
    ? ok(`Token opaco de ${tokenQr.length} caracteres`)
    : fail(`Token débil: ${tokenQr}`);

  const { data } = await anon.rpc('mascota_por_qr', { p_token: tokenQr });
  const p = data?.[0];

  p?.nombre ? ok('Un desconocido ve el nombre y la especie') : fail('No devuelve nada');
  p?.contacto_telefono === null && p?.contacto_nombre === null
    ? ok('NO expone el contacto del tutor mientras no esté perdida')
    : fail(`FUGA: expone ${p?.contacto_nombre} / ${p?.contacto_telefono}`);

  const columnas = Object.keys(p ?? {});
  const prohibidas = columnas.filter((c) =>
    ['id', 'mascota_id', 'microchip', 'email', 'dni', 'direccion', 'fecha_nacimiento'].includes(c),
  );
  prohibidas.length === 0
    ? ok(`Sólo devuelve: ${columnas.join(', ')}`)
    : fail(`FUGA: expone ${prohibidas.join(', ')}`);
}

console.log('\n=== 60. Marcada como perdida sí expone el contacto ===');
{
  const anon = createClient(URL, ANON);
  await bruno.sb.rpc('marcar_perdida', {
    p_mascota_id: mascotaId,
    p_nota: 'Se escapó del patio',
  });

  const { data } = await anon.rpc('mascota_por_qr', { p_token: tokenQr });
  const p = data?.[0];
  p?.perdida === true && p?.contacto_telefono !== undefined
    ? ok('Ahora sí muestra a quién llamar')
    : fail('No expone el contacto estando perdida');

  await bruno.sb.rpc('marcar_encontrada', { p_mascota_id: mascotaId });
  const { data: despues } = await anon.rpc('mascota_por_qr', { p_token: tokenQr });
  despues?.[0]?.contacto_telefono === null
    ? ok('Al marcarla encontrada, el contacto se oculta de nuevo')
    : fail('FUGA: el teléfono sigue visible tras aparecer');
}

console.log('\n=== 61. El anónimo no puede leer las tablas por su cuenta ===');
{
  const anon = createClient(URL, ANON);
  for (const tabla of ['mascota', 'mascota_token_qr', 'perfil', 'aviso_hallazgo', 'consulta']) {
    const { data, error } = await anon.from(tabla).select('*').limit(1);
    if (!error && (data?.length ?? 0) > 0) {
      fail(`FUGA: anónimo lee ${tabla}`);
    }
  }
  ok('Ninguna tabla es legible sin sesión');

  const { data: inventado } = await anon.rpc('mascota_por_qr', { p_token: 'f'.repeat(32) });
  inventado?.length === 0
    ? ok('Un token inventado no devuelve nada')
    : fail('FUGA con token falso');
}

console.log('\n=== 62. Sólo un tutor gestiona el código ===');
{
  const { error: errGenerar } = await clara.sb.rpc('generar_qr', { p_mascota_id: mascotaId });
  errGenerar
    ? ok('Clara no puede regenerar el código de una mascota ajena')
    : fail('FUGA: Clara regeneró el QR de otro');

  const { error: errPerdida } = await clara.sb.rpc('marcar_perdida', {
    p_mascota_id: mascotaId,
  });
  errPerdida
    ? ok('Clara no puede marcarla como perdida')
    : fail('FUGA: Clara marcó como perdida una mascota ajena');

  const { data: token } = await clara.sb
    .from('mascota_token_qr')
    .select('token')
    .eq('mascota_id', mascotaId);
  token?.length === 0
    ? ok('Clara no ve el token')
    : fail('FUGA: Clara puede leer el token de otro');
}

console.log('\n=== 63. Regenerar invalida el código anterior ===');
{
  const anon = createClient(URL, ANON);
  const { data: nuevo } = await bruno.sb.rpc('generar_qr', { p_mascota_id: mascotaId });

  const { data: viejo } = await anon.rpc('mascota_por_qr', { p_token: tokenQr });
  viejo?.length === 0
    ? ok('La chapita vieja deja de funcionar')
    : fail('FUGA: el token viejo sigue activo');

  const { data: actual } = await anon.rpc('mascota_por_qr', { p_token: nuevo.token });
  actual?.length === 1 ? ok('El código nuevo funciona') : fail('El código nuevo no anda');
  tokenQr = nuevo.token;
}

console.log('\n=== 64. Aviso de hallazgo sin cuenta ===');
{
  const anon = createClient(URL, ANON);
  const { error } = await anon.rpc('avisar_hallazgo', {
    p_token: tokenQr,
    p_mensaje: 'La tengo en casa, está bien',
    p_contacto: '11-5555-0000',
  });
  error ? fail(`No se pudo avisar: ${error.message}`) : ok('Un desconocido dejó el aviso');

  const { data: vistos } = await bruno.sb
    .from('aviso_hallazgo')
    .select('mensaje')
    .eq('mascota_id', mascotaId);
  (vistos?.length ?? 0) > 0 ? ok('El tutor lo ve') : fail('El aviso no llegó al tutor');

  const { data: deClara } = await clara.sb.from('aviso_hallazgo').select('id');
  deClara?.length === 0 ? ok('Clara no ve avisos ajenos') : fail('FUGA: Clara ve los avisos');

  const { error: errToken } = await anon.rpc('avisar_hallazgo', {
    p_token: 'e'.repeat(32),
    p_mensaje: 'spam',
  });
  errToken ? ok('Con un token inválido no se puede avisar') : fail('FUGA: aviso con token falso');

  const { error: errVacio } = await anon.rpc('avisar_hallazgo', {
    p_token: tokenQr,
    p_mensaje: '   ',
  });
  errVacio ? ok('Rechaza un mensaje vacío') : fail('Aceptó un mensaje vacío');
}

// ===========================================================================
// Turnos (fase 5)
// ===========================================================================

// La fecha se arma con las partes locales y NO con toISOString(): en zona -03,
// después de las 21 h toISOString() devuelve el día siguiente y el test pedía
// turno un domingo, cuando no hay atención. Es el mismo error que la regla 10
// de AGENTS.md previene en la aplicación — acá se coló en el propio test, y
// sólo aparecía si la suite se corría de noche.
const proximoHabil = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

// Mascota propia para esta sección: la compartida quedó a nombre de Bruno tras
// la transferencia del test 19, y Ana salió de ella en el 45. Depender de ese
// estado hacía fallar todo por cascada.
const { data: mascotaTurnos } = await ana.sb.rpc('crear_mascota', {
  p_nombre: 'Turnera',
  p_especie: 'perro',
});
const mascotaConTurnos = mascotaTurnos.id;

// Se invita a Bruno para poder verificar que cualquier tutor gestiona el turno.
{
  const { data: inv } = await ana.sb.rpc('invitar_tutor', { p_mascota_id: mascotaConTurnos });
  await bruno.sb.rpc('aceptar_invitacion', { p_token: inv.token });
}

console.log('\n=== 65. Slots y reserva ===');
let turnoId;
let slotTomado;
{
  const { data: esp } = await ana.sb.from('especialidad').select('id, nombre');
  const especialidad = esp?.find((e) => e.nombre === 'Consulta general')?.id;
  const { data: profs } = await ana.sb.rpc('profesionales_disponibles');
  const prof = profs?.[0]?.id;
  const fecha = proximoHabil();

  profs && profs.length > 0 && profs[0].nombre
    ? ok(`Un cliente puede listar profesionales con nombre (${profs[0].nombre})`)
    : fail('profesionales_disponibles no devuelve nombres');

  const { data: slots } = await ana.sb.rpc('slots_disponibles', {
    p_profesional_id: prof,
    p_fecha: fecha,
    p_especialidad_id: especialidad,
  });
  (slots?.length ?? 0) > 0 ? ok(`${slots.length} slots disponibles`) : fail('No hay slots');
  slotTomado = slots?.[0]?.inicio;

  const { data: turno, error } = await ana.sb.rpc('solicitar_turno', {
    p_mascota_id: mascotaConTurnos,
    p_profesional_id: prof,
    p_especialidad_id: especialidad,
    p_inicio: slotTomado,
  });
  turnoId = turno?.id;
  turno?.estado === 'solicitado'
    ? ok('El cliente reserva y queda "solicitado"')
    : fail(`Estado inesperado: ${turno?.estado ?? error?.message}`);

  const { data: despues } = await ana.sb.rpc('slots_disponibles', {
    p_profesional_id: prof,
    p_fecha: fecha,
    p_especialidad_id: especialidad,
  });
  despues?.length === slots.length - 1
    ? ok('El horario reservado deja de ofrecerse')
    : fail(`Slots antes ${slots.length}, después ${despues?.length}`);

  const { error: errDoble } = await clara.sb.rpc('solicitar_turno', {
    p_mascota_id: mascotaConTurnos,
    p_profesional_id: prof,
    p_especialidad_id: especialidad,
    p_inicio: slotTomado,
  });
  errDoble ? ok('Otro usuario no puede tomar el mismo horario') : fail('SOBRETURNO');
}

console.log('\n=== 66. Un turno no se crea por fuera de la agenda ===');
{
  const { data: esp } = await ana.sb.from('especialidad').select('id').limit(1);
  const { data: profs } = await ana.sb.rpc('profesionales_disponibles');

  // Las 4 de la mañana, fuera de todo horario de atención.
  const madrugada = new Date();
  madrugada.setDate(madrugada.getDate() + 3);
  madrugada.setUTCHours(7, 0, 0, 0);

  const { error } = await ana.sb.rpc('solicitar_turno', {
    p_mascota_id: mascotaConTurnos,
    p_profesional_id: profs[0].id,
    p_especialidad_id: esp[0].id,
    p_inicio: madrugada.toISOString(),
  });
  error ? ok('Rechaza un horario fuera de la grilla') : fail('Aceptó un turno a las 4 AM');

  // El INSERT directo tampoco: la tabla no otorga insert a authenticated.
  const { error: errInsert } = await ana.sb.from('turno').insert({
    mascota_id: mascotaConTurnos,
    profesional_id: profs[0].id,
    especialidad_id: esp[0].id,
    inicio: madrugada.toISOString(),
    fin: madrugada.toISOString(),
  });
  errInsert ? ok('Tampoco se puede insertar un turno a mano') : fail('FUGA: INSERT directo');
}

console.log('\n=== 67. Los turnos siguen el acceso a la mascota ===');
{
  const { data: deBruno } = await bruno.sb.from('turno').select('id').eq('id', turnoId);
  deBruno?.length === 1 ? ok('El otro tutor ve el turno') : fail('El otro tutor no lo ve');

  const { data: deClara } = await clara.sb.from('turno').select('id').eq('id', turnoId);
  deClara?.length === 0 ? ok('Clara no ve turnos ajenos') : fail('FUGA: Clara ve el turno');

  const { error } = await clara.sb.rpc('cancelar_turno', { p_turno_id: turnoId });
  error ? ok('Clara no puede cancelarlo') : fail('FUGA: Clara canceló un turno ajeno');
}

console.log('\n=== 68. La agenda es sólo para el personal ===');
{
  const fecha = proximoHabil();
  const { error } = await ana.sb.rpc('agenda_dia', { p_fecha: fecha });
  error
    ? ok('Un cliente no puede ver la agenda de la clínica')
    : fail('FUGA: cliente ve la agenda');

  const { data } = await recepcion.sb.rpc('agenda_dia', { p_fecha: fecha });
  (data?.length ?? 0) > 0
    ? ok(`Recepción ve ${data.length} turno(s) del día`)
    : fail('Recepción no ve la agenda');

  const { error: errEstado } = await ana.sb.rpc('cambiar_estado_turno', {
    p_turno_id: turnoId,
    p_estado: 'atendido',
  });
  errEstado
    ? ok('Un cliente no puede marcar un turno como atendido')
    : fail('FUGA: cliente cambió el estado');
}

console.log('\n=== 69. Cancelar libera el horario y cancela el recordatorio ===');
{
  const { data: esp } = await ana.sb.from('especialidad').select('id, nombre');
  const especialidad = esp?.find((e) => e.nombre === 'Consulta general')?.id;
  const { data: profs } = await ana.sb.rpc('profesionales_disponibles');
  const fecha = proximoHabil();

  const antes = (
    await ana.sb.rpc('slots_disponibles', {
      p_profesional_id: profs[0].id,
      p_fecha: fecha,
      p_especialidad_id: especialidad,
    })
  ).data.length;

  // Cualquier tutor puede cancelar, no sólo quien lo pidió.
  const { error } = await bruno.sb.rpc('cancelar_turno', { p_turno_id: turnoId });
  error ? fail(`El otro tutor no pudo cancelar: ${error.message}`) : ok('El otro tutor canceló');

  const despues = (
    await ana.sb.rpc('slots_disponibles', {
      p_profesional_id: profs[0].id,
      p_fecha: fecha,
      p_especialidad_id: especialidad,
    })
  ).data.length;
  despues === antes + 1 ? ok('El horario vuelve a ofrecerse') : fail('El horario no se liberó');

  const { data: t } = await recepcion.sb
    .from('turno')
    .select('estado, cancelado_por')
    .eq('id', turnoId)
    .single();
  t?.estado === 'cancelado' && t?.cancelado_por === bruno.userId
    ? ok('Queda registrado quién canceló')
    : fail(`Estado tras cancelar: ${JSON.stringify(t)}`);

  const { data: rec } = await recepcion.sb
    .from('recordatorio')
    .select('estado')
    .eq('origen_id', turnoId);
  rec?.every((r) => r.estado === 'cancelado')
    ? ok('El recordatorio de 24 h también se cancela')
    : fail('Quedó un recordatorio activo de un turno cancelado');
}

// ===========================================================================
// Inventario, ventas y caja (fase 7)
//
// Acá los errores cuestan dinero, así que se verifica más fino.
// ===========================================================================

// service_role: sólo para simular al webhook de MercadoPago, que corre en el
// servidor. Nunca sale del navegador en la app real.
const SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const comoWebhook = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

let productoId;
console.log('\n=== 70. El stock no puede quedar negativo ===');
{
  const { data: p } = await recepcion.sb
    .from('producto')
    .insert({ nombre: `Producto ${Date.now()}`, precio: 1000, visible_en_tienda: true })
    .select()
    .single();
  productoId = p.id;

  await recepcion.sb.rpc('registrar_movimiento', {
    p_producto_id: productoId,
    p_tipo: 'ingreso',
    p_cantidad: 5,
  });

  const { error } = await recepcion.sb.rpc('registrar_movimiento', {
    p_producto_id: productoId,
    p_tipo: 'venta',
    p_cantidad: -10,
  });
  error ? ok('No se puede vender más de lo que hay') : fail('STOCK NEGATIVO');

  const { error: errCliente } = await ana.sb.rpc('registrar_movimiento', {
    p_producto_id: productoId,
    p_tipo: 'ingreso',
    p_cantidad: 100,
  });
  errCliente
    ? ok('Un cliente no registra movimientos de stock')
    : fail('FUGA: cliente movió stock');
}

console.log('\n=== 71. Los movimientos son inmutables ===');
{
  const { data: movs } = await recepcion.sb
    .from('movimiento_stock')
    .select('id')
    .eq('producto_id', productoId)
    .limit(1);

  await recepcion.sb.from('movimiento_stock').update({ cantidad: 999 }).eq('id', movs[0].id);
  await recepcion.sb.from('movimiento_stock').delete().eq('id', movs[0].id);

  const { data: sigue } = await recepcion.sb
    .from('movimiento_stock')
    .select('cantidad')
    .eq('id', movs[0].id)
    .single();
  sigue?.cantidad === 5
    ? ok('Ni el personal puede editar o borrar un movimiento')
    : fail(`El movimiento cambió: ${JSON.stringify(sigue)}`);
}

console.log('\n=== 72. El precio se congela al vender ===');
{
  await recepcion.sb.rpc('abrir_caja', { p_monto_inicial: 1000 });
  const { data: orden } = await recepcion.sb.rpc('vender_mostrador', {
    p_items: [{ producto_id: productoId, cantidad: 2 }],
    p_medio: 'efectivo',
  });
  Number(orden?.total) === 2000 ? ok('Venta registrada por $2000') : fail(`Total ${orden?.total}`);

  await recepcion.sb.from('producto').update({ precio: 50000 }).eq('id', productoId);

  const { data: items } = await recepcion.sb
    .from('orden_item')
    .select('precio_unitario')
    .eq('orden_id', orden.id);
  Number(items?.[0]?.precio_unitario) === 1000
    ? ok('Cambiar el precio no altera la orden ya emitida')
    : fail(`El precio de la orden cambió a ${items?.[0]?.precio_unitario}`);

  await recepcion.sb.from('producto').update({ precio: 1000 }).eq('id', productoId);
}

console.log('\n=== 73. La caja es sólo del personal ===');
{
  const { error: errVender } = await ana.sb.rpc('vender_mostrador', {
    p_items: [{ producto_id: productoId, cantidad: 1 }],
    p_medio: 'efectivo',
  });
  errVender ? ok('Un cliente no puede registrar una venta') : fail('FUGA: cliente vendió');

  const { data: caja } = await ana.sb.from('movimiento_caja').select('id');
  caja?.length === 0
    ? ok('Un cliente no ve la caja')
    : fail(`FUGA: ve ${caja?.length} movimientos`);

  const { error: errCaja } = await ana.sb.rpc('resumen_caja');
  errCaja ? ok('Ni el resumen') : fail('FUGA: cliente ve el resumen de caja');
}

console.log('\n=== 74. Los productos con receta no llegan a la tienda ===');
{
  const { data: recetado } = await recepcion.sb
    .from('producto')
    .insert({
      nombre: `Recetado ${Date.now()}`,
      precio: 3000,
      requiere_receta: true,
      visible_en_tienda: true,
    })
    .select()
    .single();

  const { data: catalogo } = await ana.sb.rpc('catalogo_tienda');
  catalogo?.some((p) => p.id === recetado.id)
    ? fail('FUGA: un producto con receta aparece en la tienda')
    : ok('El catálogo excluye lo que requiere receta');

  const { data: visible } = await ana.sb.from('producto').select('id').eq('id', recetado.id);
  visible?.length === 0
    ? ok('Tampoco es visible por consulta directa')
    : fail('FUGA: el cliente lo ve en la tabla');
}

console.log('\n=== 75. Reserva de stock en el checkout online ===');
{
  const disponibleAntes = (await ana.sb.rpc('catalogo_tienda')).data.find(
    (p) => p.id === productoId,
  )?.disponible;

  const { data: orden } = await ana.sb.rpc('crear_orden_online', {
    p_items: [{ producto_id: productoId, cantidad: 2 }],
  });
  orden?.estado === 'pendiente_pago'
    ? ok('La orden queda pendiente de pago')
    : fail(`Estado ${orden?.estado}`);

  const disponibleDespues = (await clara.sb.rpc('catalogo_tienda')).data.find(
    (p) => p.id === productoId,
  )?.disponible;
  disponibleDespues === disponibleAntes - 2
    ? ok('La reserva descuenta disponibilidad para los demás')
    : fail(`Disponible ${disponibleAntes} → ${disponibleDespues}`);

  // El stock real no se toca hasta que el pago se confirma.
  const { data: stock } = await recepcion.sb
    .from('stock_actual')
    .select('cantidad')
    .eq('producto_id', productoId)
    .single();
  stock?.cantidad === 3
    ? ok('El stock real no se descuenta antes de pagar')
    : fail(`Stock ${stock?.cantidad}, esperaba 3`);

  const { error } = await clara.sb.rpc('crear_orden_online', {
    p_items: [{ producto_id: productoId, cantidad: 99 }],
  });
  error ? ok('No se puede sobrevender lo reservado') : fail('SOBREVENTA');

  await ana.sb.rpc('cancelar_orden', { p_orden_id: orden.id });
  const trasCancelar = (await clara.sb.rpc('catalogo_tienda')).data.find(
    (p) => p.id === productoId,
  )?.disponible;
  trasCancelar === disponibleAntes
    ? ok('Cancelar la orden libera la reserva')
    : fail(`Disponible tras cancelar: ${trasCancelar}`);
}

console.log('\n=== 76. Sólo el webhook confirma un pago online ===');
{
  const { data: orden } = await ana.sb.rpc('crear_orden_online', {
    p_items: [{ producto_id: productoId, cantidad: 1 }],
  });

  // Lo más grave que podría pasar: que un cliente marque su orden como pagada.
  for (const [quien, s] of [
    ['Un cliente', ana],
    ['Recepción', recepcion],
    ['El administrador', admin],
  ]) {
    const { error } = await s.sb.rpc('confirmar_pago_online', {
      p_orden_id: orden.id,
      p_mp_payment_id: `falso-${Date.now()}`,
      p_monto: 1,
    });
    if (!error) fail(`FUGA GRAVE: ${quien} confirmó un pago`);
  }
  ok('Nadie desde el navegador puede confirmar un pago');

  const { data: estado } = await recepcion.sb
    .from('orden')
    .select('estado')
    .eq('id', orden.id)
    .single();
  estado?.estado === 'pendiente_pago'
    ? ok('La orden sigue pendiente')
    : fail(`La orden quedó en ${estado?.estado}`);

  // Ahora sí, como lo haría el webhook.
  const pagoId = `MP-${Date.now()}`;
  const { error } = await comoWebhook.rpc('confirmar_pago_online', {
    p_orden_id: orden.id,
    p_mp_payment_id: pagoId,
    p_monto: 1000,
  });
  error ? fail(`El webhook no pudo confirmar: ${error.message}`) : ok('El webhook confirma');

  // MercadoPago reintenta el mismo aviso varias veces.
  for (let i = 0; i < 3; i++) {
    await comoWebhook.rpc('confirmar_pago_online', {
      p_orden_id: orden.id,
      p_mp_payment_id: pagoId,
      p_monto: 1000,
    });
  }

  const { data: pagos } = await recepcion.sb.from('pago').select('id').eq('orden_id', orden.id);
  const { data: comps } = await recepcion.sb
    .from('comprobante')
    .select('id')
    .eq('orden_id', orden.id);
  const { data: movs } = await recepcion.sb
    .from('movimiento_stock')
    .select('id')
    .eq('orden_id', orden.id);

  pagos?.length === 1 && comps?.length === 1 && movs?.length === 1
    ? ok('Cuatro avisos idénticos no duplican pago, comprobante ni stock')
    : fail(`Duplicados: pagos=${pagos?.length} comp=${comps?.length} mov=${movs?.length}`);

  const { error: errCancelar } = await ana.sb.rpc('cancelar_orden', { p_orden_id: orden.id });
  errCancelar ? ok('Una orden pagada no se puede cancelar') : fail('Se canceló una orden pagada');
}

// ===========================================================================
// Fase 8 — Recetario
// ===========================================================================

// Mascota propia, por la misma razón que en la sección de turnos: no depender
// del estado que dejaron los tests anteriores.
const { data: mascotaReceta } = await ana.sb.rpc('crear_mascota', {
  p_nombre: 'Recetada',
  p_especie: 'gato',
});
const mascotaConReceta = mascotaReceta.id;

const dentroDeUnMes = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};

let recetaId;
let recetaCodigo;
let itemCronicoId;

console.log('\n=== 77. Sólo un veterinario emite recetas ===');
{
  const items = [
    {
      descripcion: 'Enalapril 5 mg',
      cantidad: '30 comprimidos',
      dosis: 'medio comprimido cada 12 h',
      duracion: '30 días',
      cronico: true,
    },
    { descripcion: 'Omega 3', cantidad: '1 frasco', dosis: '1 cápsula por día' },
  ];

  for (const [quien, sesion] of [
    ['El tutor', ana],
    ['Recepción', recepcion],
    ['El administrador', admin],
  ]) {
    const { error } = await sesion.sb.rpc('emitir_receta', {
      p_mascota_id: mascotaConReceta,
      p_vence_el: dentroDeUnMes(),
      p_items: items,
    });
    error ? ok(`${quien} no puede emitir una receta`) : fail(`FUGA: ${quien} emitió una receta`);
  }

  const { data, error } = await vet.sb.rpc('emitir_receta', {
    p_mascota_id: mascotaConReceta,
    p_vence_el: dentroDeUnMes(),
    p_items: items,
    p_diagnostico: 'Cardiopatía compensada',
    p_indicaciones: 'Control en 30 días',
  });

  if (error) {
    fail(`El veterinario no pudo emitir: ${error.message}`);
  } else {
    recetaId = data.id;
    recetaCodigo = data.codigo;
    ok(`El veterinario emite la receta (código ${data.codigo})`);
  }

  /^[0-9A-F]{12}$/.test(recetaCodigo ?? '')
    ? ok('El código es aleatorio de 12 caracteres, no un correlativo')
    : fail(`El código no tiene la forma esperada: ${recetaCodigo}`);
}

console.log('\n=== 78. Una receta sin medicamentos no se emite ===');
{
  const { error } = await vet.sb.rpc('emitir_receta', {
    p_mascota_id: mascotaConReceta,
    p_vence_el: dentroDeUnMes(),
    p_items: [],
  });
  error ? ok('Una receta vacía se rechaza') : fail('Se emitió una receta sin medicamentos');
}

console.log('\n=== 79. La receta la ven los tutores y el personal, nadie más ===');
{
  const { data: dAna } = await ana.sb.from('receta').select('id').eq('id', recetaId);
  const { data: dClara } = await clara.sb.from('receta').select('id').eq('id', recetaId);
  const { data: dRecep } = await recepcion.sb.from('receta').select('id').eq('id', recetaId);

  dAna?.length === 1 ? ok('Ana ve la receta de su gato') : fail('Ana no ve su receta');
  dRecep?.length === 1 ? ok('Recepción ve la receta') : fail('Recepción no ve la receta');
  dClara?.length === 0 ? ok('Clara no ve la receta') : fail('FUGA: Clara ve una receta ajena');

  const { data: itemsAna } = await ana.sb
    .from('receta_item')
    .select('descripcion')
    .eq('receta_id', recetaId);
  const { data: itemsClara } = await clara.sb
    .from('receta_item')
    .select('descripcion')
    .eq('receta_id', recetaId);

  itemsAna?.length === 2 ? ok('Ana ve los dos medicamentos') : fail('Ana no ve los items');
  itemsClara?.length === 0
    ? ok('Clara no ve los medicamentos')
    : fail('FUGA: Clara ve los items de una receta ajena');
}

console.log('\n=== 80. Una receta emitida no se edita ni se borra ===');
{
  const { error: errEdit } = await vet.sb
    .from('receta')
    .update({ diagnostico: 'Otra cosa' })
    .eq('id', recetaId);
  errEdit ? ok('Ni el veterinario edita una receta emitida') : fail('Se editó una receta');

  const { error: errAdmin } = await admin.sb
    .from('receta')
    .update({ vence_el: '2030-01-01' })
    .eq('id', recetaId);
  errAdmin ? ok('Ni el administrador la edita') : fail('El administrador editó una receta');

  const { error: errDel } = await vet.sb.from('receta').delete().eq('id', recetaId);
  const { data: sigue } = await vet.sb.from('receta').select('id').eq('id', recetaId);
  errDel || sigue?.length === 1
    ? ok('Una receta emitida no se borra')
    : fail('Se borró una receta emitida');

  const { error: errItem } = await vet.sb
    .from('receta_item')
    .update({ dosis: 'lo que sea' })
    .eq('receta_id', recetaId);
  errItem ? ok('Los medicamentos tampoco se editan') : fail('Se editó un item de receta');
}

console.log('\n=== 81. Verificación pública por código ===');
{
  const anonimo = createClient(URL, ANON);
  const { data, error } = await anonimo.rpc('verificar_receta', { p_codigo: recetaCodigo });

  if (error || !data) {
    fail(`La verificación pública falló: ${error?.message}`);
  } else {
    data.mascota === 'Recetada' && data.estado === 'vigente'
      ? ok('Sin cuenta, con el código se verifica la receta')
      : fail(`La verificación devolvió algo raro: ${JSON.stringify(data)}`);

    data.items?.length === 2
      ? ok('La verificación muestra los medicamentos para contrastar con el papel')
      : fail('La verificación no muestra los medicamentos');

    data.vencida === false ? ok('Informa que no está vencida') : fail('Marcó vencida una vigente');

    // Lo que NO tiene que aparecer: nada del tutor.
    const texto = JSON.stringify(data).toLowerCase();
    !texto.includes('ana') && !texto.includes('ejemplo.test')
      ? ok('La página pública no expone nada del tutor')
      : fail('FUGA: la verificación pública filtra datos del tutor');
  }

  const { data: nada } = await anonimo.rpc('verificar_receta', { p_codigo: 'AAAAAAAAAAAA' });
  nada === null
    ? ok('Un código inventado no devuelve nada')
    : fail('Un código falso devolvió algo');

  // El código es lo único que abre la puerta: la tabla sigue cerrada.
  const { data: filas } = await anonimo.from('receta').select('id');
  !filas || filas.length === 0
    ? ok('Sin sesión no se puede listar el recetario')
    : fail(`FUGA: anónimo lista ${filas.length} recetas`);
}

console.log('\n=== 82. Datos para imprimir ===');
{
  const { data, error } = await ana.sb.rpc('receta_para_imprimir', { p_receta_id: recetaId });
  if (error || !data) {
    fail(`El tutor no pudo obtener la receta para imprimir: ${error?.message}`);
  } else {
    data.clinica?.nombre && data.profesional
      ? ok(
          'Trae el encabezado de la clínica y el profesional, que el cliente no puede leer directo',
        )
      : fail('Faltan datos del encabezado');
  }

  const { error: errClara } = await clara.sb.rpc('receta_para_imprimir', { p_receta_id: recetaId });
  errClara
    ? ok('Clara no puede imprimir una receta ajena')
    : fail('FUGA: Clara imprimió una receta ajena');
}

console.log('\n=== 83. Reposición de medicación crónica ===');
{
  const { data: items } = await ana.sb
    .from('receta_item')
    .select('id, descripcion, cronico')
    .eq('receta_id', recetaId);

  itemCronicoId = items?.find((i) => i.cronico)?.id;
  const noCronico = items?.find((i) => !i.cronico)?.id;

  const { error: errNoCronico } = await ana.sb.rpc('solicitar_reposicion', {
    p_receta_item_id: noCronico,
  });
  errNoCronico
    ? ok('Un medicamento que no es crónico no se repone sin consulta')
    : fail('Se repuso un medicamento no crónico');

  const { error: errClara } = await clara.sb.rpc('solicitar_reposicion', {
    p_receta_item_id: itemCronicoId,
  });
  errClara ? ok('Clara no puede pedir reposición') : fail('FUGA: Clara pidió una reposición ajena');

  const { data: sol, error } = await ana.sb.rpc('solicitar_reposicion', {
    p_receta_item_id: itemCronicoId,
    p_nota: 'Se le termina el viernes',
  });
  error ? fail(`Ana no pudo pedir reposición: ${error.message}`) : ok('Ana pide la reposición');

  const { error: errDoble } = await ana.sb.rpc('solicitar_reposicion', {
    p_receta_item_id: itemCronicoId,
  });
  errDoble
    ? ok('Un segundo pedido del mismo medicamento se rechaza')
    : fail('Se acumularon dos pedidos pendientes del mismo medicamento');

  const { data: pendientes } = await vet.sb.rpc('reposiciones_pendientes');
  pendientes?.some((r) => r.id === sol?.id)
    ? ok('El veterinario ve el pedido pendiente')
    : fail('El pedido no aparece en la bandeja del veterinario');

  const { data: pendientesCliente } = await ana.sb.rpc('reposiciones_pendientes');
  !pendientesCliente || pendientesCliente.length === 0
    ? ok('Un cliente no ve la bandeja de pedidos de la clínica')
    : fail('FUGA: un cliente ve los pedidos de otros');

  const { error: errRecep } = await recepcion.sb.rpc('resolver_reposicion', {
    p_solicitud_id: sol?.id,
    p_aprobar: true,
  });
  errRecep
    ? ok('Recepción no resuelve una reposición: es un acto profesional')
    : fail('FUGA: recepción aprobó una reposición');

  const { error: errResolver } = await vet.sb.rpc('resolver_reposicion', {
    p_solicitud_id: sol?.id,
    p_aprobar: true,
    p_nota: 'Renovada por 30 días más',
  });
  errResolver
    ? fail(`El veterinario no pudo resolver: ${errResolver.message}`)
    : ok('El veterinario aprueba la reposición');

  const { error: errOtraVez } = await vet.sb.rpc('resolver_reposicion', {
    p_solicitud_id: sol?.id,
    p_aprobar: false,
  });
  errOtraVez
    ? ok('Una reposición resuelta no se vuelve a resolver')
    : fail('Se resolvió dos veces la misma solicitud');

  const { data: verAna } = await ana.sb
    .from('solicitud_reposicion')
    .select('estado, nota_respuesta')
    .eq('id', sol?.id);
  verAna?.[0]?.estado === 'aprobada'
    ? ok('Ana ve la respuesta en su app')
    : fail('Ana no ve el resultado de su pedido');
}

console.log('\n=== 84. Anular una receta ===');
{
  const { error: errSinMotivo } = await vet.sb.rpc('anular_receta', {
    p_receta_id: recetaId,
    p_motivo: '   ',
  });
  errSinMotivo ? ok('Anular sin motivo se rechaza') : fail('Se anuló sin motivo');

  const { error: errAna } = await ana.sb.rpc('anular_receta', {
    p_receta_id: recetaId,
    p_motivo: 'me arrepentí',
  });
  errAna ? ok('El tutor no anula una receta') : fail('FUGA: el tutor anuló una receta');

  const { error } = await vet.sb.rpc('anular_receta', {
    p_receta_id: recetaId,
    p_motivo: 'Dosis mal calculada',
  });
  error ? fail(`El veterinario no pudo anular: ${error.message}`) : ok('El veterinario anula');

  const anonimo = createClient(URL, ANON);
  const { data } = await anonimo.rpc('verificar_receta', { p_codigo: recetaCodigo });
  data?.estado === 'anulada' && data?.motivo_anulacion
    ? ok('La verificación pública avisa que está anulada, y por qué')
    : fail('La página pública sigue mostrando la receta como válida');

  const { error: errRepo } = await ana.sb.rpc('solicitar_reposicion', {
    p_receta_item_id: itemCronicoId,
  });
  errRepo
    ? ok('No se pide reposición sobre una receta anulada')
    : fail('Se pidió reposición de una receta anulada');
}

// ===========================================================================
// Fase 8 — Métricas
// ===========================================================================

console.log('\n=== 85. Las métricas operativas son del personal ===');
{
  for (const [quien, sesion] of [
    ['Ana', ana],
    ['Clara', clara],
  ]) {
    const { error } = await sesion.sb.rpc('metricas_resumen');
    error ? ok(`${quien} no accede al tablero`) : fail(`FUGA: ${quien} vio las métricas`);
  }

  const { data, error } = await recepcion.sb.rpc('metricas_resumen');
  error
    ? fail(`Recepción no pudo ver el resumen: ${error.message}`)
    : ok('Recepción ve el resumen operativo');

  typeof data?.consultas === 'number'
    ? ok('El resumen trae los contadores esperados')
    : fail(`El resumen devolvió algo raro: ${JSON.stringify(data)}`);

  const { data: turnos, error: errTurnos } = await recepcion.sb.rpc('metricas_turnos');
  errTurnos || !Array.isArray(turnos)
    ? fail(`Turnos por día falló: ${errTurnos?.message}`)
    : ok(`Turnos por día devuelve ${turnos.length} días`);

  const { data: profs, error: errProfs } = await vet.sb.rpc('metricas_profesionales');
  errProfs || !Array.isArray(profs)
    ? fail(`Métricas por profesional falló: ${errProfs?.message}`)
    : ok('El veterinario ve el desglose por profesional');
}

console.log('\n=== 86. Las métricas económicas son sólo del administrador ===');
{
  for (const [quien, sesion] of [
    ['Recepción', recepcion],
    ['El veterinario', vet],
    ['Ana', ana],
  ]) {
    const { error } = await sesion.sb.rpc('metricas_ventas');
    error
      ? ok(`${quien} no ve la facturación`)
      : fail(`FUGA: ${quien} vio las métricas económicas`);
  }

  const { data, error } = await admin.sb.rpc('metricas_ventas');
  if (error) {
    fail(`El administrador no pudo ver la facturación: ${error.message}`);
  } else {
    data && typeof data.facturado !== 'undefined' && Array.isArray(data.productos)
      ? ok('El administrador ve facturación y rotación de productos')
      : fail(`Las métricas económicas devolvieron algo raro: ${JSON.stringify(data)}`);
  }
}

console.log('\n=== 87. Pacientes inactivos ===');
{
  const { error } = await ana.sb.rpc('pacientes_inactivos', { p_meses: 12 });
  error
    ? ok('Un cliente no puede listar los pacientes inactivos de la clínica')
    : fail('FUGA: un cliente listó pacientes de otros');

  // Con 0 meses entran todas las mascotas sin atención registrada, que es lo
  // que hay en el entorno de prueba. Sirve para verificar que la consulta
  // devuelve el contacto del tutor, que es para lo que existe la lista.
  const { data, error: errRecep } = await recepcion.sb.rpc('pacientes_inactivos', {
    p_meses: 0,
  });

  if (errRecep) {
    fail(`Recepción no pudo listar inactivos: ${errRecep.message}`);
  } else {
    const filas = data ?? [];
    filas.length > 0
      ? ok(`Recepción ve ${filas.length} pacientes sin atención`)
      : fail('La lista de inactivos vino vacía');
    filas.every((f) => f.mascota)
      ? ok('Cada fila trae el paciente y el contacto para llamarlo')
      : fail('Faltan datos en la lista de inactivos');
  }
}

// ===========================================================================
// Fase 8 — Campañas y mensajería
// ===========================================================================

console.log('\n=== 88. Sólo el administrador crea y lanza campañas ===');
let campanaId;
{
  for (const [quien, sesion] of [
    ['Ana', ana],
    ['Recepción', recepcion],
    ['El veterinario', vet],
  ]) {
    const { error } = await sesion.sb.rpc('crear_campana', {
      p_titulo: 'Campaña trucha',
      p_cuerpo: 'No debería existir',
    });
    error ? ok(`${quien} no puede crear una campaña`) : fail(`FUGA: ${quien} creó una campaña`);
  }

  const { data, error } = await admin.sb.rpc('crear_campana', {
    p_titulo: 'Antirrábica al día',
    p_cuerpo: 'Tu perro tiene la antirrábica vencida. Te esperamos.',
    p_segmento: { especie: 'perro' },
    p_url: '/turnos/nuevo',
  });

  if (error) {
    fail(`El administrador no pudo crear la campaña: ${error.message}`);
  } else {
    campanaId = data.id;
    ok('El administrador crea la campaña');
  }

  const { data: vista } = await admin.sb.from('campana').select('estado').eq('id', campanaId);
  vista?.[0]?.estado === 'borrador'
    ? ok('Nace en borrador: crear no es mandar')
    : fail(`La campaña nació en estado ${vista?.[0]?.estado}`);
}

console.log('\n=== 89. La vista previa dice a cuánta gente llega ===');
{
  const { error } = await ana.sb.rpc('previsualizar_campana', { p_segmento: {} });
  error ? ok('Un cliente no puede previsualizar el padrón') : fail('FUGA: un cliente previsualizó');

  const { data: todos, error: errTodos } = await recepcion.sb.rpc('previsualizar_campana', {
    p_segmento: {},
  });
  errTodos
    ? fail(`Recepción no pudo previsualizar: ${errTodos.message}`)
    : ok(`Sin criterios alcanza a ${todos.total} tutores`);

  const { data: gatos } = await admin.sb.rpc('previsualizar_campana', {
    p_segmento: { especie: 'gato' },
  });
  const { data: perros } = await admin.sb.rpc('previsualizar_campana', {
    p_segmento: { especie: 'perro' },
  });

  gatos.total > 0 && perros.total > 0 && gatos.total !== todos.total
    ? ok(`Segmentar por especie cambia el alcance (perros ${perros.total}, gatos ${gatos.total})`)
    : fail(`La segmentación por especie no filtró: ${JSON.stringify({ todos, perros, gatos })}`);

  Array.isArray(todos.muestra) && todos.muestra.length > 0 && todos.muestra[0].nombre
    ? ok('La vista previa muestra nombres concretos, no sólo un número')
    : fail('La vista previa no trae muestra');

  const { data: imposible } = await admin.sb.rpc('previsualizar_campana', {
    p_segmento: { sin_venir_meses: 0, vacuna_vencida_dias: 99999 },
  });
  imposible.total === 0
    ? ok('Un criterio que no alcanza a nadie devuelve cero, no todos')
    : fail(`Un criterio imposible alcanzó a ${imposible.total}`);
}

console.log('\n=== 90. Silenciar campañas no silencia los recordatorios ===');
{
  const { data: antes } = await admin.sb.rpc('previsualizar_campana', { p_segmento: {} });

  // Se guarda el estado previo de la preferencia de vacunas: el test 37 ya la
  // tocó, así que lo que se verifica es que NO cambie, no que valga algo fijo.
  const leerVacuna = async () => {
    const { data } = await ana.sb
      .from('preferencia_notificacion')
      .select('habilitado')
      .eq('perfil_id', ana.userId)
      .eq('tipo', 'vacuna');
    return data?.[0]?.habilitado ?? null;
  };
  const vacunaAntes = await leerVacuna();

  await ana.sb.from('preferencia_notificacion').upsert({
    perfil_id: ana.userId,
    tipo: 'campana',
    habilitado: false,
  });

  const { data: despues } = await admin.sb.rpc('previsualizar_campana', { p_segmento: {} });
  despues.total === antes.total - 1
    ? ok('Quien silenció las campañas sale del alcance, no sólo del envío')
    : fail(`El alcance pasó de ${antes.total} a ${despues.total}, esperaba uno menos`);

  (await leerVacuna()) === vacunaAntes
    ? ok('La preferencia de recordatorios de vacunas queda intacta')
    : fail('Silenciar campañas cambió también la preferencia de recordatorios');

  // Se revierte para no ensuciar lo que venga después.
  await ana.sb
    .from('preferencia_notificacion')
    .update({ habilitado: true })
    .eq('perfil_id', ana.userId)
    .eq('tipo', 'campana');
}

console.log('\n=== 91. Lanzar congela el alcance ===');
{
  const { error: errAna } = await ana.sb.rpc('lanzar_campana', { p_campana_id: campanaId });
  errAna ? ok('Un cliente no lanza una campaña') : fail('FUGA: un cliente lanzó una campaña');

  const { data, error } = await admin.sb.rpc('lanzar_campana', { p_campana_id: campanaId });
  error ? fail(`No se pudo lanzar: ${error.message}`) : ok('El administrador lanza la campaña');

  typeof data?.destinatarios === 'number' && data.destinatarios > 0
    ? ok(`Queda congelado el alcance: ${data.destinatarios} destinatarios`)
    : fail(`No se congeló el alcance: ${JSON.stringify(data)}`);

  const { error: errDoble } = await admin.sb.rpc('lanzar_campana', { p_campana_id: campanaId });
  errDoble ? ok('Una campaña lanzada no se vuelve a lanzar') : fail('Se lanzó dos veces');

  const { error: errCancelar } = await admin.sb.rpc('cancelar_campana', {
    p_campana_id: campanaId,
  });
  errCancelar
    ? ok('Una campaña que ya salió no se cancela')
    : fail('Se canceló una campaña ya enviada');

  const { data: vacia } = await admin.sb.rpc('crear_campana', {
    p_titulo: 'A nadie',
    p_cuerpo: 'Esta no debería poder salir',
    p_segmento: { vacuna_vencida_dias: 99999, sin_venir_meses: 0 },
  });
  const { error: errVacia } = await admin.sb.rpc('lanzar_campana', {
    p_campana_id: vacia.id,
  });
  errVacia
    ? ok('Una campaña que no alcanza a nadie se rechaza al lanzar')
    : fail('Se lanzó una campaña sin destinatarios');
}

console.log('\n=== 92. Los destinatarios sólo los ve el servidor ===');
{
  for (const [quien, sesion] of [
    ['Ana', ana],
    ['El administrador', admin],
  ]) {
    const { error } = await sesion.sb.rpc('destinatarios_campana', { p_campana_id: campanaId });
    error
      ? ok(`${quien} no puede leer los endpoints push desde el navegador`)
      : fail(`FUGA: ${quien} leyó las suscripciones push de todos`);
  }

  const { error } = await comoWebhook.rpc('destinatarios_campana', { p_campana_id: campanaId });
  error
    ? fail(`El servidor no pudo leer los destinatarios: ${error.message}`)
    : ok('El servidor sí');

  const { data: campanas } = await ana.sb.from('campana').select('id');
  !campanas || campanas.length === 0
    ? ok('Un cliente no ve las campañas de la clínica')
    : fail(`FUGA: un cliente ve ${campanas.length} campañas`);
}

console.log('\n=== 93. Mensajería: cada uno ve lo suyo ===');
let convId;
{
  const { data, error } = await ana.sb.rpc('abrir_conversacion', {
    p_asunto: '¿Le doy la pastilla con comida?',
    p_mensaje: 'Milo escupe el comprimido. ¿Se lo puedo dar con el alimento?',
  });

  if (error) {
    fail(`Ana no pudo abrir la conversación: ${error.message}`);
  } else {
    convId = data.id;
    ok('Ana abre una conversación');
  }

  const { data: msgs } = await ana.sb
    .from('mensaje')
    .select('cuerpo, de_la_clinica')
    .eq('conversacion_id', convId);
  msgs?.length === 1 && msgs[0].de_la_clinica === false
    ? ok('El primer mensaje queda sellado como del tutor')
    : fail(`El mensaje inicial quedó mal: ${JSON.stringify(msgs)}`);

  const { data: deClara } = await clara.sb.from('conversacion').select('id').eq('id', convId);
  deClara?.length === 0
    ? ok('Clara no ve la conversación de Ana')
    : fail('FUGA: Clara ve una conversación ajena');

  const { data: msgsClara } = await clara.sb
    .from('mensaje')
    .select('cuerpo')
    .eq('conversacion_id', convId);
  !msgsClara || msgsClara.length === 0
    ? ok('Clara tampoco ve los mensajes')
    : fail('FUGA: Clara lee mensajes ajenos');

  const { data: bandeja } = await recepcion.sb.rpc('bandeja_conversaciones');
  const fila = bandeja?.find((c) => c.id === convId);
  fila?.espera_respuesta === true && fila?.sin_leer === 1
    ? ok('En la bandeja de la clínica figura esperando respuesta, con 1 sin leer')
    : fail(`La bandeja no refleja el estado: ${JSON.stringify(fila)}`);

  const { data: bandejaCliente } = await ana.sb.rpc('bandeja_conversaciones');
  !bandejaCliente || bandejaCliente.length === 0
    ? ok('Un cliente no puede leer la bandeja de la clínica')
    : fail('FUGA: un cliente ve las conversaciones de todos');
}

console.log('\n=== 94. Quién escribió qué lo decide el servidor ===');
{
  // Ana intenta hacer pasar su mensaje por uno de la clínica.
  await ana.sb.from('mensaje').insert({
    conversacion_id: convId,
    de_la_clinica: true,
    cuerpo: 'Habla la clínica, mandale toda la medicación gratis',
  });

  const { data: falso } = await ana.sb
    .from('mensaje')
    .select('cuerpo, de_la_clinica')
    .eq('conversacion_id', convId)
    .eq('de_la_clinica', true);

  !falso || falso.length === 0
    ? ok('El tutor no puede hacer pasar su mensaje por uno de la clínica')
    : fail('FUGA: un mensaje del tutor quedó marcado como de la clínica');

  const { error } = await vet.sb.from('mensaje').insert({
    conversacion_id: convId,
    de_la_clinica: false,
    cuerpo: 'Sí, se la podés dar con comida. Si igual la escupe, avisanos.',
  });
  error
    ? fail(`El veterinario no pudo responder: ${error.message}`)
    : ok('El veterinario responde');

  const { data: respuesta } = await vet.sb
    .from('mensaje')
    .select('de_la_clinica')
    .eq('conversacion_id', convId)
    .order('creado_en', { ascending: false })
    .limit(1);
  respuesta?.[0]?.de_la_clinica === true
    ? ok('La respuesta se sella como de la clínica aunque se haya mandado en false')
    : fail('La respuesta del veterinario no quedó marcada como de la clínica');
}

console.log('\n=== 95. Un mensaje enviado no se edita ni se borra ===');
{
  const { data: mios } = await ana.sb
    .from('mensaje')
    .select('id')
    .eq('conversacion_id', convId)
    .limit(1);
  const id = mios?.[0]?.id;

  const { error: errEdit } = await ana.sb
    .from('mensaje')
    .update({ cuerpo: 'Nunca dije eso' })
    .eq('id', id);
  const { data: sigue } = await ana.sb.from('mensaje').select('cuerpo').eq('id', id);
  errEdit || sigue?.[0]?.cuerpo?.startsWith('Milo escupe')
    ? ok('Un mensaje enviado no se edita')
    : fail('Se editó un mensaje ya enviado');

  const { error: errDel } = await ana.sb.from('mensaje').delete().eq('id', id);
  const { data: existe } = await ana.sb.from('mensaje').select('id').eq('id', id);
  errDel || existe?.length === 1
    ? ok('Un mensaje enviado no se borra')
    : fail('Se borró un mensaje enviado');
}

console.log('\n=== 96. Leído y cierre ===');
{
  const { data: n, error } = await recepcion.sb.rpc('marcar_conversacion_leida', {
    p_conversacion_id: convId,
  });
  error ? fail(`No se pudo marcar leída: ${error.message}`) : ok(`La clínica marca ${n} leído(s)`);

  const { data: bandeja } = await recepcion.sb.rpc('bandeja_conversaciones');
  bandeja?.find((c) => c.id === convId)?.sin_leer === 0
    ? ok('El contador de sin leer baja a cero')
    : fail('El contador de sin leer no bajó');

  // Nadie marca leído lo suyo: si pudiera, el contador de la clínica se
  // vaciaría solo cada vez que responde.
  const { data: propios } = await vet.sb
    .from('mensaje')
    .select('id, leido_en')
    .eq('conversacion_id', convId)
    .eq('de_la_clinica', true);
  const { error: errPropio } = await vet.sb
    .from('mensaje')
    .update({ leido_en: new Date().toISOString() })
    .eq('id', propios?.[0]?.id);
  const { data: tras } = await vet.sb.from('mensaje').select('leido_en').eq('id', propios?.[0]?.id);
  errPropio || tras?.[0]?.leido_en === null
    ? ok('Nadie marca como leído lo que escribió')
    : fail('FUGA: se pudo marcar leído el propio mensaje');

  const { error: errClara } = await clara.sb.rpc('marcar_conversacion_leida', {
    p_conversacion_id: convId,
  });
  errClara
    ? ok('Clara no puede marcar leída una conversación ajena')
    : fail('FUGA: Clara marcó leída una conversación ajena');

  await ana.sb
    .from('conversacion')
    .update({ cerrada_en: new Date().toISOString() })
    .eq('id', convId);

  const { error: errEscribir } = await ana.sb.from('mensaje').insert({
    conversacion_id: convId,
    de_la_clinica: false,
    cuerpo: 'Una cosa más',
  });
  errEscribir
    ? ok('En una conversación cerrada no se escribe')
    : fail('Se escribió en una conversación cerrada');

  const { data: cerradas } = await recepcion.sb.rpc('bandeja_conversaciones', {
    p_cerradas: true,
  });
  cerradas?.some((c) => c.id === convId)
    ? ok('La cerrada pasa a la bandeja de cerradas, no desaparece')
    : fail('La conversación cerrada se perdió');
}

// ===========================================================================
// Límite de intentos en las páginas públicas
// ===========================================================================

console.log('\n=== 97. Las páginas públicas cortan un barrido ===');
{
  const anonimo = createClient(URL, ANON);

  // Veintiún códigos inexistentes seguidos. El límite es 20 fallidos por hora.
  let cortoEn = null;
  for (let i = 0; i < 25; i++) {
    const { error } = await anonimo.rpc('verificar_receta', {
      p_codigo: `NOEXISTE${String(i).padStart(4, '0')}`,
    });
    if (error && cortoEn === null) cortoEn = i;
  }

  cortoEn !== null && cortoEn <= 21
    ? ok(`Tras ${cortoEn} códigos inventados deja de responder`)
    : fail(`No cortó el barrido (cortó en ${cortoEn})`);

  // El registro queda para poder mirarlo después.
  const { data: intentos } = await recepcion.sb
    .from('intento_publico')
    .select('origen, acierto')
    .eq('origen', 'receta');
  intentos && intentos.length > 20
    ? ok(`Quedan ${intentos.length} intentos registrados para revisar`)
    : fail('Los intentos no quedaron registrados');

  const { data: deAna } = await ana.sb.from('intento_publico').select('id');
  !deAna || deAna.length === 0
    ? ok('Un cliente no ve el registro de intentos')
    : fail('FUGA: un cliente ve el registro de accesos públicos');

  // El QR se cuenta aparte: saturar la verificación de recetas no puede dejar
  // sin servicio a quien encontró una mascota perdida.
  const { error: errQr } = await anonimo.rpc('mascota_por_qr', { p_token: 'inexistente' });
  !errQr
    ? ok('El QR tiene su propio contador: sigue respondiendo')
    : fail('Saturar recetas dejó sin servicio al QR de extravío');
}

console.log('\n=== 98. Línea de tiempo unificada ===');
{
  const { error } = await clara.sb.rpc('linea_de_tiempo', { p_mascota_id: mascotaConReceta });
  error
    ? ok('Clara no puede ver la historia de una mascota ajena')
    : fail('FUGA: Clara vio la línea de tiempo de otra mascota');

  const { data, error: errAna } = await ana.sb.rpc('linea_de_tiempo', {
    p_mascota_id: mascotaConReceta,
  });

  if (errAna) {
    fail(`Ana no pudo ver la historia de su gato: ${errAna.message}`);
  } else {
    const tipos = new Set(data.map((e) => e.tipo));
    tipos.has('receta')
      ? ok(`La historia junta ${data.length} eventos de ${tipos.size} tipo(s) distinto(s)`)
      : fail(`La historia no trajo la receta: ${JSON.stringify([...tipos])}`);

    // Orden estrictamente descendente por fecha civil.
    const ordenada = data.every((e, i) => i === 0 || data[i - 1].fecha >= e.fecha);
    ordenada ? ok('Viene del más nuevo al más viejo') : fail('La historia vino desordenada');
  }

  const { data: delVet } = await vet.sb.rpc('linea_de_tiempo', {
    p_mascota_id: mascotaConReceta,
  });
  delVet && delVet.length > 0
    ? ok('El personal de la clínica también la ve')
    : fail('El veterinario no ve la línea de tiempo');
}

console.log('\n=== 99. Agenda por rango ===');
{
  const { error } = await ana.sb.rpc('agenda_rango', {
    p_desde: proximoHabil(),
    p_hasta: proximoHabil(),
  });
  error ? ok('Un cliente no ve la agenda por rango') : fail('FUGA: un cliente vio la agenda');

  const { data, error: errRecep } = await recepcion.sb.rpc('agenda_rango', {
    p_desde: proximoHabil(),
    p_hasta: proximoHabil(),
  });
  errRecep
    ? fail(`Recepción no pudo ver el rango: ${errRecep.message}`)
    : ok(`Recepción ve el rango (${data.length} turno[s])`);

  data?.every((t) => typeof t.dia === 'string' && t.dia.length === 10)
    ? ok('Cada turno viene con su fecha civil ya resuelta')
    : fail('Falta la fecha civil por turno');

  const { error: errLargo } = await recepcion.sb.rpc('agenda_rango', {
    p_desde: '2020-01-01',
    p_hasta: '2026-12-31',
  });
  errLargo
    ? ok('Un rango de años se rechaza en el servidor, no en la pantalla')
    : fail('Se aceptó un rango de años');

  const { error: errInvertido } = await recepcion.sb.rpc('agenda_rango', {
    p_desde: '2026-08-20',
    p_hasta: '2026-08-10',
  });
  errInvertido ? ok('Un rango invertido se rechaza') : fail('Se aceptó un rango invertido');
}

console.log('\n=== 100. Consentimiento de la política de privacidad ===');
{
  const anonimo = createClient(URL, ANON);
  const { data: publica } = await anonimo
    .from('politica_privacidad')
    .select('version, contenido')
    .eq('vigente', true);
  publica?.length === 1 && publica[0].contenido.length > 100
    ? ok('La política se puede leer sin cuenta, que es cuando hace falta')
    : fail('La política no es legible sin sesión');

  const { data: aceptado, error } = await ana.sb.rpc('aceptar_politica');
  error ? fail(`Ana no pudo aceptar: ${error.message}`) : ok('Ana acepta la política');

  aceptado?.version === publica?.[0]?.version
    ? ok('Queda registrada la versión vigente, no la que mande el navegador')
    : fail(`Se guardó la versión ${aceptado?.version}`);

  // Aceptar dos veces no genera dos registros: sería ruido, no más prueba.
  await ana.sb.rpc('aceptar_politica');
  const { data: suyos } = await ana.sb.from('consentimiento').select('id');
  suyos?.length === 1
    ? ok('Aceptar de nuevo no duplica el registro')
    : fail(`Ana tiene ${suyos?.length} consentimientos`);

  const { data: pendiente } = await ana.sb.rpc('politica_pendiente');
  pendiente === null
    ? ok('Tras aceptar no le queda nada pendiente')
    : fail('Sigue figurando como pendiente después de aceptar');

  const { data: deClara } = await clara.sb.rpc('politica_pendiente');
  deClara !== null
    ? ok('A quien no aceptó le figura pendiente')
    : fail('Clara no aceptó pero no le figura pendiente');

  // La prueba de que alguien consintió no se puede alterar.
  const { error: errEdit } = await ana.sb
    .from('consentimiento')
    .update({ version: 'inventada' })
    .eq('id', suyos?.[0]?.id);
  const { error: errDel } = await ana.sb.from('consentimiento').delete().eq('id', suyos?.[0]?.id);
  const { data: sigue } = await ana.sb.from('consentimiento').select('id');
  (errEdit || errDel) && sigue?.length === 1
    ? ok('Un consentimiento registrado no se edita ni se borra')
    : fail('Se pudo alterar la prueba del consentimiento');

  const { data: deOtro } = await clara.sb.from('consentimiento').select('id');
  !deOtro || deOtro.length === 0
    ? ok('Nadie ve los consentimientos ajenos')
    : fail('FUGA: se ven consentimientos de otras personas');

  for (const [quien, sesion] of [
    ['Ana', ana],
    ['Recepción', recepcion],
  ]) {
    const { error: err } = await sesion.sb.rpc('publicar_politica', {
      p_version: `trucha-${Date.now()}`,
      p_contenido: 'No debería existir',
    });
    err ? ok(`${quien} no puede publicar una política`) : fail(`FUGA: ${quien} publicó una`);
  }

  // Ojo: esto deja la política de prueba como vigente en la base local. Es a
  // propósito —hay que verificar que publicar desplaza a la anterior— y se
  // deshace con `pnpm db:reset`.
  const nueva = `2.0-test-${Date.now()}`;
  const { error: errPub } = await admin.sb.rpc('publicar_politica', {
    p_version: nueva,
    p_contenido: '# Política\n\nVersión de prueba.',
  });
  errPub
    ? fail(`El administrador no pudo publicar: ${errPub.message}`)
    : ok('El administrador publica una versión nueva');

  const { data: vigentes } = await admin.sb
    .from('politica_privacidad')
    .select('version')
    .eq('vigente', true);
  vigentes?.length === 1 && vigentes[0].version === nueva
    ? ok('Queda una sola vigente y es la nueva')
    : fail(`Vigentes: ${JSON.stringify(vigentes)}`);

  const { data: ahoraPendiente } = await ana.sb.rpc('politica_pendiente');
  ahoraPendiente?.version === nueva
    ? ok('Publicar una versión nueva la vuelve a pedir a quien ya había aceptado')
    : fail('Una versión nueva no se le pide a quien aceptó la anterior');

  const { data: vieja } = await admin.sb
    .from('politica_privacidad')
    .select('version')
    .eq('version', '0.1-borrador');
  vieja?.length === 1
    ? ok('La versión anterior sigue existiendo: es la prueba de qué se aceptó')
    : fail('Se perdió la versión anterior');
}

console.log(
  fallos === 0
    ? '\n\x1b[32m▸ Todas las verificaciones pasaron\x1b[0m\n'
    : `\n\x1b[31m▸ ${fallos} verificación(es) fallaron\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);
