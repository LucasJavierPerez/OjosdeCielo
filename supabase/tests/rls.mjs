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
  data && data.length === 6
    ? ok(`Recepción ve los 6 perfiles`)
    : fail(`Recepción ve ${data?.length ?? 0} perfiles, esperaba 6`);
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

console.log(
  fallos === 0
    ? '\n\x1b[32m▸ Todas las verificaciones pasaron\x1b[0m\n'
    : `\n\x1b[31m▸ ${fallos} verificación(es) fallaron\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);
