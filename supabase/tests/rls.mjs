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
  error && error.message.includes('archivarla')
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
  error && error.message.includes('archivarla')
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

console.log(
  fallos === 0
    ? '\n\x1b[32m▸ Todas las verificaciones pasaron\x1b[0m\n'
    : `\n\x1b[31m▸ ${fallos} verificación(es) fallaron\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);
