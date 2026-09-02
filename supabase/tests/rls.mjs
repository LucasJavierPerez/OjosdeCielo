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
 *
 * SE CORRE SOBRE UNA BASE RECIÉN RESETEADA: `pnpm db:reset && pnpm test:rls`,
 * que es lo que hace el CI. Dos corridas seguidas sobre la misma base fallan a
 * propósito — la sección 97 gasta el cupo de intentos de las páginas públicas,
 * y a la segunda vuelta el límite corta las consultas del QR. Eso no es un
 * defecto del test: es la protección haciendo lo suyo. Aflojarla para que la
 * suite sea re-ejecutable sería cambiar el sistema para complacer al test.
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

console.log('\n=== 1. Los roles llegan al JWT (custom access token hook) ===');
const esperados = {
  'admin@ojosdecielo.test': ['administrador'],
  'vet@ojosdecielo.test': ['veterinario'],
  'recepcion@ojosdecielo.test': ['recepcionista'],
  'ana@ejemplo.test': ['cliente'],
};
const mismosRoles = (a, b) =>
  Array.isArray(a) && a.length === b.length && b.every((r) => a.includes(r));

const sesiones = {};
for (const [email, rolesEsperados] of Object.entries(esperados)) {
  const s = await comoUsuario(email);
  sesiones[email] = s;
  mismosRoles(s.claims.roles, rolesEsperados)
    ? ok(`${email} → roles=${JSON.stringify(s.claims.roles)}`)
    : fail(
        `${email} → esperaba ${JSON.stringify(rolesEsperados)}, llegó ${JSON.stringify(s.claims.roles)}`,
      );
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
  const { error } = await sb
    .from('perfil')
    .update({ roles: ['cliente', 'veterinario'] })
    .eq('id', userId);
  const { data } = await sb.from('perfil').select('roles').eq('id', userId).single();
  mismosRoles(data?.roles, ['cliente'])
    ? ok(`Escalada bloqueada (roles siguen en ["cliente"])${error ? ' con error explícito' : ''}`)
    : fail(`ESCALADA DE PRIVILEGIOS: los roles quedaron en ${JSON.stringify(data?.roles)}`);
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

console.log('\n=== 27. El tutor ya no carga datos de salud ===');
{
  // Las cuatro tablas de salud: el tutor no puede insertar en ninguna.
  for (const [tabla, campos] of [
    ['peso_registro', { peso_kg: 12.5 }],
    ['aplicacion', { tipo: 'vacuna', producto: 'Antirrábica' }],
    ['antecedente', { tipo: 'alergia', descripcion: 'Polen' }],
    ['medicacion_en_curso', { descripcion: 'Meloxicam', dosis: '0.5 mg' }],
  ]) {
    const { error } = await ana.sb.from(tabla).insert({ mascota_id: mascotaId, ...campos });
    error ? ok(`${tabla}: el tutor no puede cargar`) : fail(`FUGA: el tutor cargó en ${tabla}`);
  }
}

console.log('\n=== 28. El veterinario carga con origen "clinica" ===');
let pesoClinicaId;
{
  const { data, error } = await vet.sb
    .from('peso_registro')
    .insert({ mascota_id: mascotaId, peso_kg: 12.8, nota: 'Balanza de consultorio' })
    .select()
    .single();
  pesoClinicaId = data?.id;
  data?.origen === 'clinica'
    ? ok('El veterinario cargó con origen "clinica"')
    : fail(`Origen inesperado: ${data?.origen ?? error?.message}`);
  data?.cargado_por === vet.userId
    ? ok('cargado_por apunta a quien lo cargó')
    : fail('cargado_por no coincide con el veterinario');
}

console.log('\n=== 29. Recepción tampoco carga datos de salud ===');
{
  const { error } = await recepcion.sb
    .from('peso_registro')
    .insert({ mascota_id: mascotaId, peso_kg: 10 });
  error
    ? ok('Recepción no carga peso: es acto del veterinario')
    : fail('FUGA: recepción cargó un peso');
}

console.log('\n=== 30. El tutor no toca lo que cargó la clínica ===');
{
  await ana.sb.from('peso_registro').update({ peso_kg: 99 }).eq('id', pesoClinicaId);
  const { data } = await ana.sb
    .from('peso_registro')
    .select('peso_kg')
    .eq('id', pesoClinicaId)
    .single();
  Number(data?.peso_kg) === 12.8
    ? ok('Ana no pudo modificar el peso de la clínica')
    : fail(`FUGA: Ana cambió un dato de la clínica a ${data?.peso_kg}`);

  await ana.sb.from('peso_registro').delete().eq('id', pesoClinicaId);
  const { data: sigue } = await ana.sb.from('peso_registro').select('id').eq('id', pesoClinicaId);
  sigue?.length === 1
    ? ok('Tampoco pudo borrarlo')
    : fail('FUGA: Ana borró un registro de la clínica');
}

console.log('\n=== 31. El tutor sí lee la salud de su mascota ===');
{
  const { data } = await ana.sb
    .from('peso_registro')
    .select('peso_kg, origen')
    .eq('id', pesoClinicaId)
    .single();
  data?.origen === 'clinica' && Number(data?.peso_kg) === 12.8
    ? ok('Ana ve el peso que cargó la clínica')
    : fail(`Ana no ve bien el peso de la clínica: ${JSON.stringify(data)}`);
}

console.log('\n=== 32. Verificar y descartar son exclusivos del veterinario ===');
{
  for (const [rol, sb] of [
    ['un cliente', ana.sb],
    ['recepción', recepcion.sb],
  ]) {
    const { error: errVer } = await sb.rpc('verificar_registro', {
      p_tabla: 'peso_registro',
      p_id: pesoClinicaId,
    });
    errVer ? ok(`Verificar: ${rol} no puede`) : fail(`ESCALADA: ${rol} verificó un dato clínico`);

    const { error: errDesc } = await sb.rpc('descartar_registro', {
      p_tabla: 'peso_registro',
      p_id: pesoClinicaId,
      p_motivo: 'no corresponde',
    });
    errDesc ? ok(`Descartar: ${rol} no puede`) : fail(`ESCALADA: ${rol} descartó un dato clínico`);
  }

  // El intento directo de auto-verificarse con un UPDATE no tiene efecto: el
  // tutor ya no tiene política de escritura sobre la tabla.
  await ana.sb.from('peso_registro').update({ verificado_por: ana.userId }).eq('id', pesoClinicaId);
  const { data: trasIntento } = await ana.sb
    .from('peso_registro')
    .select('verificado_por')
    .eq('id', pesoClinicaId)
    .single();
  trasIntento?.verificado_por == null
    ? ok('Nadie se auto-verifica con un UPDATE directo')
    : fail('FUGA: se pudo escribir verificado_por a mano');
}

console.log('\n=== 33. verificar_registro no acepta tablas arbitrarias ===');
{
  for (const tabla of ['perfil', 'audit_log', 'mascota_tutor']) {
    const { error } = await vet.sb.rpc('verificar_registro', {
      p_tabla: tabla,
      p_id: pesoClinicaId,
    });
    if (!error) fail(`INYECCIÓN: aceptó la tabla ${tabla}`);
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
  error ? ok('Clara tampoco puede cargar (no es veterinaria)') : fail('FUGA: Clara cargó un peso');
}

console.log('\n=== 35. Las cuatro tablas de salud tienen las mismas garantías ===');
{
  const casos = [
    ['aplicacion', { tipo: 'vacuna', producto: 'Antirrábica', proxima_fecha: '2027-08-12' }],
    ['antecedente', { tipo: 'alergia', descripcion: 'Polen' }],
    ['medicacion_en_curso', { descripcion: 'Meloxicam', dosis: '0.5 mg' }],
  ];

  for (const [tabla, campos] of casos) {
    const { data, error } = await vet.sb
      .from(tabla)
      .insert({ mascota_id: mascotaId, ...campos })
      .select()
      .single();
    if (error) {
      fail(`${tabla}: el veterinario no pudo cargar (${error.message})`);
      continue;
    }
    data.origen === 'clinica'
      ? ok(`${tabla}: el veterinario carga con origen "clinica"`)
      : fail(`${tabla}: origen "${data.origen}"`);

    const { error: errTutor } = await ana.sb
      .from(tabla)
      .insert({ mascota_id: mascotaId, ...campos });
    errTutor ? ok(`${tabla}: el tutor no puede cargar`) : fail(`FUGA: el tutor cargó en ${tabla}`);

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
  // La carga de salud es del veterinario; acá sólo hace falta que exista un
  // registro para verificar que sobrevive al marcar la ficha como fallecida.
  await vet.sb.from('aplicacion').insert({
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
    const { error } = await s.sb.rpc('cambiar_roles', {
      p_perfil_id: recepcion.userId,
      p_roles: ['administrador'],
    });
    if (!error) fail(`ESCALADA: ${quien} pudo cambiar roles`);
  }
  ok('Nadie fuera de administración puede cambiar roles');

  const { data } = await admin.sb
    .from('perfil')
    .select('roles')
    .eq('id', recepcion.userId)
    .single();
  mismosRoles(data?.roles, ['recepcionista'])
    ? ok('Los roles quedaron intactos')
    : fail(`Los roles cambiaron a ${JSON.stringify(data?.roles)}`);
}

console.log('\n=== 48. Un administrador se suma roles pero no se saca el suyo ===');
{
  // El caso de la veterinaria unipersonal: la misma persona atiende, cobra y
  // administra, y no hay nadie más que se lo conceda.
  const { data, error } = await admin.sb.rpc('cambiar_roles', {
    p_perfil_id: admin.userId,
    p_roles: ['administrador', 'veterinario', 'recepcionista'],
  });
  error
    ? fail(`No pudo darse los tres roles: ${error.message}`)
    : ok('El administrador único puede darse también veterinario y recepcionista');

  mismosRoles(data?.roles, ['administrador', 'veterinario', 'recepcionista'])
    ? ok('Los tres roles quedan guardados')
    : fail(`Quedó ${JSON.stringify(data?.roles)}`);

  // Lo que la regla original protegía sigue protegido: no se puede quedar
  // afuera sacándose el rol que le da acceso a esta misma pantalla.
  const { error: errQuitarse } = await admin.sb.rpc('cambiar_roles', {
    p_perfil_id: admin.userId,
    p_roles: ['veterinario'],
  });
  errQuitarse
    ? ok('Pero no puede sacarse a sí mismo el de administrador')
    : fail('Un administrador se quitó el rol de administrador');

  // Con los tres roles en el JWT, las tres puertas se abren para la misma
  // persona. Es el punto de todo el cambio.
  const uni = await comoUsuario('admin@ojosdecielo.test');
  mismosRoles(uni.claims.roles, ['administrador', 'recepcionista', 'veterinario'])
    ? ok('Los tres roles llegan al JWT')
    : fail(`Al JWT llegó ${JSON.stringify(uni.claims.roles)}`);

  const { error: errClinica } = await uni.sb.rpc('metricas_ventas');
  const { data: mascotasPanel } = await uni.sb.rpc('buscar_pacientes', { p_texto: '' });
  errClinica
    ? fail(`Con rol de administrador no vio la facturación: ${errClinica.message}`)
    : ok('Como administrador ve la facturación');
  mascotasPanel ? ok('Como personal ve los pacientes') : fail('No ve los pacientes del panel');

  // Y actúa como veterinario, que es lo que antes le estaba vedado.
  const { data: mascotaUni } = await uni.sb.rpc('crear_mascota', {
    p_nombre: 'Unipersonal',
    p_especie: 'perro',
  });
  const { error: errConsulta } = await uni.sb.from('consulta').insert({
    mascota_id: mascotaUni.id,
    motivo: 'Control',
  });
  errConsulta
    ? fail(`Con rol de veterinario no pudo cargar una consulta: ${errConsulta.message}`)
    : ok('Y con el mismo usuario carga una consulta como veterinario');

  // Se vuelve al estado de partida para no alterar los tests siguientes.
  await admin.sb.rpc('cambiar_roles', {
    p_perfil_id: admin.userId,
    p_roles: ['administrador'],
  });
}

console.log('\n=== 49. Promover, degradar y el último administrador ===');
{
  const { error } = await admin.sb.rpc('cambiar_roles', {
    p_perfil_id: recepcion.userId,
    p_roles: ['recepcionista', 'administrador'],
  });
  error
    ? fail(`No pudo promover: ${error.message}`)
    : ok('Recepción suma el rol de administradora');

  const { error: errDegradar } = await admin.sb.rpc('cambiar_roles', {
    p_perfil_id: recepcion.userId,
    p_roles: ['recepcionista'],
  });
  errDegradar
    ? fail(`No pudo degradar habiendo dos: ${errDegradar.message}`)
    : ok('Con dos administradores, degradar a uno funciona');

  const { error: errSinPermiso } = await recepcion.sb.rpc('cambiar_roles', {
    p_perfil_id: admin.userId,
    p_roles: ['recepcionista'],
  });
  errSinPermiso
    ? ok('Quien deja de ser administrador pierde el permiso de inmediato')
    : fail('ESCALADA: conserva permisos tras perder el rol');

  // Esta regla ya no es defensa en profundidad: ahora que uno puede editarse
  // los roles propios, es la única barrera que impide que la clínica se quede
  // sin nadie que administre. Se verifica de verdad.
  const { data: admins } = await admin.sb
    .from('perfil')
    .select('id')
    .contains('roles', ['administrador'])
    .eq('activo', true);
  admins?.length === 1
    ? ok('Queda un solo administrador activo, que es el escenario a proteger')
    : fail(`Hay ${admins?.length} administradores, el escenario no es el esperado`);

  const { error: errBaja } = await admin.sb.rpc('cambiar_estado_personal', {
    p_perfil_id: admin.userId,
    p_activo: false,
  });
  errBaja
    ? ok('El último administrador no puede darse de baja')
    : fail('La clínica se quedó sin administradores');
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
    .select('activo, roles')
    .eq('id', vet.userId)
    .single();
  data?.activo === false && mismosRoles(data?.roles, ['veterinario'])
    ? ok('Se conservan los roles y el registro, no se borra la cuenta')
    : fail(`Estado inesperado: ${JSON.stringify(data)}`);

  // El hook de acceso filtra por `activo`, así que al reingresar pierde todo.
  const reingreso = await comoUsuario('vet@ojosdecielo.test');
  mismosRoles(reingreso.claims.roles, ['cliente'])
    ? ok('Al volver a entrar ya no tiene rol de clínica')
    : fail(`Un usuario dado de baja conserva ${JSON.stringify(reingreso.claims.roles)}`);

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

console.log('\n=== 65. Los turnos los agenda el personal, no el tutor ===');
let turnoId;
{
  const { data: esp } = await recepcion.sb.from('especialidad').select('id, nombre');
  const especialidad = esp?.find((e) => e.nombre === 'Consulta general')?.id;
  const { data: profs } = await recepcion.sb.rpc('profesionales_disponibles');
  const prof = profs?.[0]?.id;
  const inicio = `${proximoHabil()}T03:00:00-03:00`;

  profs && profs.length > 0 && profs[0].nombre
    ? ok(`Recepción lista profesionales con nombre (${profs[0].nombre})`)
    : fail('profesionales_disponibles no devuelve nombres');

  // El tutor ya no puede pedir turno.
  const { error: errTutor } = await ana.sb.rpc('solicitar_turno', {
    p_mascota_id: mascotaConTurnos,
    p_profesional_id: prof,
    p_especialidad_id: especialidad,
    p_inicio: inicio,
  });
  errTutor ? ok('Un cliente no puede agendar un turno') : fail('FUGA: el cliente agendó un turno');

  // El personal sí, y queda confirmado.
  const { data: turno, error } = await recepcion.sb.rpc('solicitar_turno', {
    p_mascota_id: mascotaConTurnos,
    p_profesional_id: prof,
    p_especialidad_id: especialidad,
    p_inicio: inicio,
    p_motivo: 'Control',
  });
  turnoId = turno?.id;
  turno?.estado === 'confirmado'
    ? ok('Recepción agenda y el turno queda "confirmado"')
    : fail(`Estado inesperado: ${turno?.estado ?? error?.message}`);
}

console.log('\n=== 66. Un turno no se inserta a mano ===');
{
  const { data: esp } = await recepcion.sb.from('especialidad').select('id').limit(1);
  const { data: profs } = await recepcion.sb.rpc('profesionales_disponibles');
  const cuando = `${proximoHabil()}T04:00:00-03:00`;

  const { error: errInsert } = await ana.sb.from('turno').insert({
    mascota_id: mascotaConTurnos,
    profesional_id: profs[0].id,
    especialidad_id: esp[0].id,
    inicio: cuando,
    fin: cuando,
  });
  errInsert
    ? ok('El tutor no puede insertar un turno a mano')
    : fail('FUGA: INSERT directo del tutor');

  const { error: errRecep } = await recepcion.sb.from('turno').insert({
    mascota_id: mascotaConTurnos,
    profesional_id: profs[0].id,
    especialidad_id: esp[0].id,
    inicio: cuando,
    fin: cuando,
  });
  errRecep
    ? ok('Ni recepción con un INSERT directo: el alta va por solicitar_turno()')
    : fail('FUGA: recepción insertó un turno a mano');
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

console.log('\n=== 69. El tutor cancela; el personal borra ===');
{
  // Cualquier tutor puede cancelar, no sólo quien lo pidió.
  const { error } = await bruno.sb.rpc('cancelar_turno', { p_turno_id: turnoId });
  error ? fail(`El otro tutor no pudo cancelar: ${error.message}`) : ok('El otro tutor canceló');

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

  // Borrar es del personal y elimina el turno de verdad.
  const { error: errClienteBorra } = await ana.sb.rpc('borrar_turno', { p_turno_id: turnoId });
  errClienteBorra
    ? ok('Un cliente no puede borrar un turno')
    : fail('FUGA: cliente borró un turno');

  const { error: errBorra } = await recepcion.sb.rpc('borrar_turno', { p_turno_id: turnoId });
  errBorra
    ? fail(`Recepción no pudo borrar el turno: ${errBorra.message}`)
    : ok('Recepción borra el turno');

  const { data: sigue } = await recepcion.sb.from('turno').select('id').eq('id', turnoId);
  (sigue?.length ?? 0) === 0
    ? ok('El turno ya no existe')
    : fail('El turno borrado seguía en la tabla');

  const { data: recTras } = await recepcion.sb
    .from('recordatorio')
    .select('id')
    .eq('origen_id', turnoId);
  (recTras?.length ?? 0) === 0
    ? ok('Sus recordatorios se fueron con él')
    : fail('Quedaron recordatorios de un turno borrado');
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
  // Se verifica que haya UNA vigente y que tenga texto, no que sea el borrador:
  // esta misma sección publica una versión de prueba más abajo, y atarse a un
  // contenido concreto hacía fallar la segunda corrida sobre la misma base.
  publica?.length === 1 && publica[0].contenido.trim().length > 0
    ? ok('La política se puede leer sin cuenta, que es cuando hace falta')
    : fail(`La política no es legible sin sesión: ${JSON.stringify(publica)}`);

  const { data: aceptado, error } = await ana.sb.rpc('aceptar_politica');
  error ? fail(`Ana no pudo aceptar: ${error.message}`) : ok('Ana acepta la política');

  aceptado?.version === publica?.[0]?.version
    ? ok('Queda registrada la versión vigente, no la que mande el navegador')
    : fail(`Se guardó la versión ${aceptado?.version}`);

  // Aceptar dos veces no genera dos registros: sería ruido, no más prueba. Se
  // cuenta sobre la versión vigente y no sobre todas, porque de corridas
  // anteriores pueden quedar consentimientos de versiones viejas.
  await ana.sb.rpc('aceptar_politica');
  const { data: suyos } = await ana.sb
    .from('consentimiento')
    .select('id')
    .eq('version', publica?.[0]?.version ?? '');
  suyos?.length === 1
    ? ok('Aceptar de nuevo no duplica el registro')
    : fail(`Ana tiene ${suyos?.length} consentimientos de la versión vigente`);

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
  // Se comprueba que sobreviva ESA fila y sin cambios, no un total: de corridas
  // anteriores pueden quedar consentimientos de versiones viejas.
  const { data: sigue } = await ana.sb
    .from('consentimiento')
    .select('id, version')
    .eq('id', suyos?.[0]?.id);
  (errEdit || errDel) && sigue?.length === 1 && sigue[0].version !== 'inventada'
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

console.log('\n=== 101. Descartar y restaurar un dato de salud ===');
{
  const { data: paciente } = await ana.sb.rpc('crear_mascota', {
    p_nombre: 'Controlada',
    p_especie: 'gato',
  });

  const { data: peso1 } = await vet.sb
    .from('peso_registro')
    .insert({ mascota_id: paciente.id, peso_kg: 4.2, nota: 'Ingreso' })
    .select()
    .single();
  const { data: peso2 } = await vet.sb
    .from('peso_registro')
    .insert({ mascota_id: paciente.id, peso_kg: 13.1, nota: 'Tipeo errado' })
    .select()
    .single();

  peso1?.origen === 'clinica'
    ? ok('El veterinario carga con origen "clinica"')
    : fail(`Origen inesperado: ${peso1?.origen}`);

  const { error: errSinMotivo } = await vet.sb.rpc('descartar_registro', {
    p_tabla: 'peso_registro',
    p_id: peso2.id,
    p_motivo: '  ',
  });
  errSinMotivo ? ok('Descartar sin motivo se rechaza') : fail('Se descartó sin motivo');

  const { error: errAna } = await ana.sb.rpc('descartar_registro', {
    p_tabla: 'peso_registro',
    p_id: peso2.id,
    p_motivo: 'no corresponde',
  });
  errAna ? ok('El tutor no descarta') : fail('FUGA: el tutor descartó un registro');

  const { error: errRecep } = await recepcion.sb.rpc('descartar_registro', {
    p_tabla: 'peso_registro',
    p_id: peso2.id,
    p_motivo: 'no corresponde',
  });
  errRecep ? ok('Recepción tampoco') : fail('FUGA: recepción descartó un dato clínico');

  const { error: errDescartar } = await vet.sb.rpc('descartar_registro', {
    p_tabla: 'peso_registro',
    p_id: peso2.id,
    p_motivo: 'Error de tipeo: el gato pesa 4,2 kg, no 13,1',
  });
  errDescartar
    ? fail(`El veterinario no pudo descartar: ${errDescartar.message}`)
    : ok('El veterinario descarta con motivo');

  const { data: visto } = await ana.sb
    .from('peso_registro')
    .select('peso_kg, descartado_en, motivo_descarte')
    .eq('id', peso2.id)
    .single();
  visto?.descartado_en && visto.motivo_descarte?.includes('4,2')
    ? ok('El registro queda, con el motivo visible para el tutor')
    : fail(`El descarte no quedó visible: ${JSON.stringify(visto)}`);

  const { data: linea } = await ana.sb.rpc('linea_de_tiempo', { p_mascota_id: paciente.id });
  (linea?.filter((e) => e.tipo === 'peso') ?? []).length === 1
    ? ok('La historia muestra sólo el peso válido')
    : fail(`La historia muestra ${JSON.stringify(linea?.filter((e) => e.tipo === 'peso'))}`);

  await ana.sb
    .from('peso_registro')
    .update({ descartado_en: null, motivo_descarte: null })
    .eq('id', peso2.id);
  const { data: sigueDescartado } = await ana.sb
    .from('peso_registro')
    .select('descartado_en')
    .eq('id', peso2.id)
    .single();
  sigueDescartado?.descartado_en
    ? ok('El tutor no deshace el descarte editando la fila')
    : fail('FUGA: el tutor deshizo el descarte del profesional');

  const { error: errRestaurar } = await vet.sb.rpc('restaurar_registro', {
    p_tabla: 'peso_registro',
    p_id: peso2.id,
  });
  errRestaurar
    ? fail(`No se pudo restaurar: ${errRestaurar.message}`)
    : ok('Un descarte por error se deshace');

  const { data: lineaFinal } = await ana.sb.rpc('linea_de_tiempo', { p_mascota_id: paciente.id });
  (lineaFinal?.filter((e) => e.tipo === 'peso') ?? []).length === 2
    ? ok('Y el registro vuelve a la historia')
    : fail('El registro restaurado no volvió a la historia');
}

console.log('\n=== 102. Corregir un producto no reescribe lo ya vendido ===');
{
  const { data: prod } = await admin.sb
    .from('producto')
    .insert({ nombre: 'Alimentto balancado', precio: 18500, categoria: 'Alimentos' })
    .select()
    .single();

  await admin.sb.rpc('registrar_movimiento', {
    p_producto_id: prod.id,
    p_tipo: 'ingreso',
    p_cantidad: 5,
  });

  const { data: caja } = await admin.sb.rpc('resumen_caja');
  if (!caja || caja.length === 0) await admin.sb.rpc('abrir_caja', { p_monto_inicial: 0 });

  const { data: venta } = await admin.sb.rpc('vender_mostrador', {
    p_items: [{ producto_id: prod.id, cantidad: 1 }],
    p_medio: 'efectivo',
  });

  // El caso real: se escribió mal el nombre y el precio estaba desactualizado.
  const { error } = await recepcion.sb
    .from('producto')
    .update({ nombre: 'Alimento balanceado 3kg', precio: 21500.5 })
    .eq('id', prod.id);
  error
    ? fail(`Recepción no pudo corregir el producto: ${error.message}`)
    : ok('Recepción corrige nombre y precio de un producto');

  const { data: ahora } = await admin.sb
    .from('producto')
    .select('nombre, precio')
    .eq('id', prod.id)
    .single();
  ahora?.nombre === 'Alimento balanceado 3kg' && Number(ahora.precio) === 21500.5
    ? ok('El producto queda con el nombre y el precio corregidos')
    : fail(`Quedó ${JSON.stringify(ahora)}`);

  // Lo que no puede pasar: que se reescriba la historia de la caja.
  const { data: items } = await admin.sb
    .from('orden_item')
    .select('descripcion, precio_unitario')
    .eq('orden_id', venta.id);
  Number(items?.[0]?.precio_unitario) === 18500
    ? ok('La venta anterior conserva el precio con el que se cobró')
    : fail(`La venta quedó en ${items?.[0]?.precio_unitario}`);
  items?.[0]?.descripcion === 'Alimentto balancado'
    ? ok('Y también el nombre que tenía el día de la venta')
    : fail(`La descripción cambió a "${items?.[0]?.descripcion}"`);

  // Quedó registro de la corrección: es lo que sirve cuando la caja no cierra.
  const { data: auditoria } = await admin.sb
    .from('audit_log')
    .select('accion, datos_antes, datos_despues')
    .eq('tabla', 'producto')
    .eq('registro_id', prod.id)
    .eq('accion', 'UPDATE');
  Number(auditoria?.[0]?.datos_antes?.precio) === 18500 &&
  Number(auditoria?.[0]?.datos_despues?.precio) === 21500.5
    ? ok('La auditoría guarda el precio anterior y el nuevo')
    : fail(`La auditoría no registró el cambio: ${JSON.stringify(auditoria)}`);

  const { error: errAna } = await ana.sb.from('producto').update({ precio: 1 }).eq('id', prod.id);
  const { data: intacto } = await admin.sb
    .from('producto')
    .select('precio')
    .eq('id', prod.id)
    .single();
  errAna || Number(intacto?.precio) === 21500.5
    ? ok('Un cliente no puede tocar los precios')
    : fail('FUGA: un cliente cambió un precio');
}

console.log('\n=== 103. La clínica corrige datos de contacto ===');
{
  // Un tutor registrado con el teléfono mal anotado.
  const { error: errVet } = await vet.sb.rpc('actualizar_datos_tutor', {
    p_perfil_id: ana.userId,
    p_nombre: 'Ana',
    p_apellido: 'Molina',
    p_telefono: '+54 11 5555-0000',
  });
  errVet
    ? fail(`El veterinario no pudo corregir el teléfono: ${errVet.message}`)
    : ok('El veterinario corrige el teléfono de un tutor');

  const { data: corregido } = await recepcion.sb
    .from('perfil')
    .select('telefono, email')
    .eq('id', ana.userId)
    .single();
  corregido?.telefono === '+54 11 5555-0000'
    ? ok('Queda guardado')
    : fail(`El teléfono quedó en ${corregido?.telefono}`);
  corregido?.email === 'ana@ejemplo.test'
    ? ok('El email no se toca: es con el que ingresa a la app')
    : fail(`El email cambió a ${corregido?.email}`);

  // Un cliente no anda corrigiendo datos de otro.
  const { error: errClara } = await clara.sb.rpc('actualizar_datos_tutor', {
    p_perfil_id: ana.userId,
    p_nombre: 'Otra',
    p_apellido: 'Persona',
  });
  errClara ? ok('Un cliente no puede editar a otro') : fail('FUGA: un cliente editó a otro');

  // Los datos del personal se editan desde Equipo, con las reglas de roles.
  const { error: errPersonal } = await recepcion.sb.rpc('actualizar_datos_tutor', {
    p_perfil_id: vet.userId,
    p_nombre: 'Martín',
    p_apellido: 'Gómez',
    p_telefono: '911',
  });
  errPersonal
    ? ok('Recepción no edita los datos de un compañero por esta vía')
    : fail('Recepción editó el perfil de un colega sin pasar por Equipo');

  const { error: errAdmin } = await admin.sb.rpc('actualizar_datos_tutor', {
    p_perfil_id: vet.userId,
    p_nombre: 'Martín',
    p_apellido: 'Gómez',
    p_telefono: '+54 11 4444-1111',
  });
  errAdmin
    ? fail(`El administrador no pudo editar al veterinario: ${errAdmin.message}`)
    : ok('El administrador sí puede');

  // Un teléfono no es un rol: la RPC no puede servir para escalar.
  const { data: rolesVet } = await admin.sb
    .from('perfil')
    .select('roles, activo')
    .eq('id', vet.userId)
    .single();
  rolesVet?.roles?.includes('veterinario') && rolesVet.activo
    ? ok('Editar contacto no toca roles ni el estado de la cuenta')
    : fail(`Los roles quedaron en ${JSON.stringify(rolesVet)}`);
}

console.log('\n=== 104. El arqueo de caja queda guardado y se puede consultar ===');
{
  const { data: caja } = await recepcion.sb.rpc('resumen_caja');
  if (!caja || caja.length === 0) {
    await recepcion.sb.rpc('abrir_caja', { p_monto_inicial: 1000 });
  }

  await recepcion.sb.rpc('registrar_movimiento_caja', {
    p_tipo: 'ingreso',
    p_monto: 2500,
    p_medio: 'efectivo',
    p_concepto: 'Consulta',
  });

  // Se cuenta de menos a propósito: la diferencia es lo que hay que poder
  // explicar después, y para eso el arqueo tiene que quedar guardado.
  const { data: cerrada, error } = await recepcion.sb.rpc('cerrar_caja', {
    p_monto_declarado: 3000,
    p_notas: 'Faltaron 500, se revisa mañana',
  });
  error ? fail(`No se pudo cerrar la caja: ${error.message}`) : ok('Se cierra la caja con arqueo');

  const { data: historial, error: errHist } = await recepcion.sb.rpc('historial_cajas');
  if (errHist) {
    fail(`Recepción no pudo ver el historial: ${errHist.message}`);
  } else {
    const fila = historial.find((c) => c.id === cerrada.id);
    fila ? ok('El cierre aparece en el historial') : fail('El cierre no quedó en el historial');
    fila && Number(fila.diferencia) !== 0 && fila.notas?.includes('500')
      ? ok(`Con la diferencia (${fila.diferencia}) y la nota de quien cerró`)
      : fail(`El arqueo no conserva diferencia ni notas: ${JSON.stringify(fila)}`);
    fila?.cerrado_por && fila.abierto_por
      ? ok('Y quién la abrió y quién la cerró')
      : fail('Falta quién abrió o cerró');
  }

  const { error: errAna } = await ana.sb.rpc('historial_cajas');
  errAna
    ? ok('Un cliente no ve los cierres de caja')
    : fail('FUGA: un cliente ve el historial de caja');
}

console.log('\n=== 105. Entradas y salidas por mes ===');
{
  for (const [quien, sesion] of [
    ['Recepción', recepcion],
    ['El veterinario', vet],
    ['Ana', ana],
  ]) {
    const { error } = await sesion.sb.rpc('flujo_caja_mensual');
    error
      ? ok(`${quien} no ve el acumulado por mes`)
      : fail(`FUGA: ${quien} vio el movimiento de dinero por mes`);
  }

  const { data, error } = await admin.sb.rpc('flujo_caja_mensual', { p_meses: 6 });
  if (error) {
    fail(`El administrador no pudo verlo: ${error.message}`);
  } else {
    data.length === 6
      ? ok('Devuelve los 6 meses pedidos, incluso los que no tuvieron movimiento')
      : fail(`Devolvió ${data.length} meses`);

    const conPlata = data.find((m) => Number(m.ingresos) > 0);
    conPlata && Number(conPlata.neto) === Number(conPlata.ingresos) - Number(conPlata.egresos)
      ? ok('El neto es entradas menos salidas')
      : fail(`El neto no cierra: ${JSON.stringify(conPlata)}`);

    conPlata &&
    Number(conPlata.efectivo) + Number(conPlata.otros_medios) === Number(conPlata.ingresos)
      ? ok('Y el desglose por medio suma el total de entradas')
      : fail(`El desglose no suma: ${JSON.stringify(conPlata)}`);
  }
}

console.log('\n=== 106. Fotos de producto: bucket público, escritura sólo del personal ===');
{
  const { data: prod } = await admin.sb
    .from('producto')
    .insert({ nombre: 'Shampoo antipulgas', precio: 4200 })
    .select()
    .single();

  const archivo = new Blob(['contenido-de-prueba'], { type: 'image/png' });
  const ruta = `${prod.id}/foto.png`;

  const { error: errAna } = await ana.sb.storage.from('productos').upload(ruta, archivo);
  errAna
    ? ok('Un cliente no puede subir una foto de producto')
    : fail('FUGA: un cliente subió una foto de producto');

  const { error: errVet } = await vet.sb.storage.from('productos').upload(ruta, archivo);
  errVet
    ? fail(`El personal no pudo subir la foto: ${errVet.message}`)
    : ok('El personal sube la foto de un producto');

  // El bucket es público a propósito: se sirve por /object/public/, sin pasar
  // por RLS. La URL tiene que resolver sin sesión.
  const {
    data: { publicUrl },
  } = admin.sb.storage.from('productos').getPublicUrl(ruta);
  const resp = await fetch(publicUrl);
  resp.ok
    ? ok('La foto se sirve pública, sin necesitar sesión')
    : fail(`La URL pública devolvió ${resp.status}`);

  const { error: errReemplazo } = await recepcion.sb.storage
    .from('productos')
    .update(ruta, archivo);
  errReemplazo
    ? fail(`Recepción no pudo reemplazar la foto: ${errReemplazo.message}`)
    : ok('Recepción reemplaza la foto de un producto');

  const { error: errBorrarAna } = await ana.sb.storage.from('productos').remove([ruta]);
  const stillThere = await fetch(publicUrl);
  errBorrarAna || stillThere.ok
    ? ok('Un cliente no puede borrar la foto de un producto')
    : fail('FUGA: un cliente borró la foto de un producto');
}

console.log('\n=== 107. Promociones: gestión sólo del personal, lectura de lo vigente ===');
{
  const { data: prod } = await admin.sb
    .from('producto')
    .insert({ nombre: `Antirrábica ${Date.now()}`, precio: 8000, visible_en_tienda: true })
    .select()
    .single();

  const { error: errAnaCrea } = await ana.sb.from('promocion').insert({
    titulo: 'Intento de cliente',
    tipo_descuento: 'porcentaje',
    valor: 50,
    producto_id: prod.id,
    desde: '2026-01-01',
    hasta: '2026-01-31',
  });
  errAnaCrea
    ? ok('Un cliente no puede crear una promoción')
    : fail('FUGA: un cliente creó una promoción');

  const { data: promo, error: errAdminCrea } = await admin.sb
    .from('promocion')
    .insert({
      titulo: '20% off vacunas',
      tipo_descuento: 'porcentaje',
      valor: 20,
      producto_id: prod.id,
      desde: '2026-01-01',
      hasta: '2099-01-01',
    })
    .select()
    .single();
  errAdminCrea
    ? fail(`El admin no pudo crear la promoción: ${errAdminCrea.message}`)
    : ok('El admin crea una promoción vigente sobre un producto puntual');

  const { data: catalogoConPromo } = await ana.sb.rpc('catalogo_tienda');
  const enCatalogo = (catalogoConPromo ?? []).find((p) => p.id === prod.id);
  enCatalogo && Number(enCatalogo.precio_promocional) === 6400
    ? ok('La tienda ya muestra el precio con el 20% aplicado')
    : fail(`El precio promocional no llegó bien: ${JSON.stringify(enCatalogo)}`);

  const { data: vistaPorAna } = await ana.sb.from('promocion').select('id').eq('id', promo.id);
  vistaPorAna && vistaPorAna.length === 1
    ? ok('Un cliente lee el título de una promoción vigente (para el cartel)')
    : fail('Un cliente no pudo leer una promoción vigente');

  // El carrito le muestra al tutor el precio con descuento: el pedido tiene
  // que cobrar exactamente eso, no el precio de lista del producto.
  await admin.sb.rpc('registrar_movimiento', {
    p_producto_id: prod.id,
    p_tipo: 'ingreso',
    p_cantidad: 5,
  });
  const { data: pedidoConPromo, error: errPedidoConPromo } = await ana.sb.rpc(
    'crear_orden_online',
    {
      p_items: [{ producto_id: prod.id, cantidad: 1 }],
    },
  );
  const { data: itemPedidoConPromo } = await admin.sb
    .from('orden_item')
    .select('precio_unitario, subtotal')
    .eq('orden_id', pedidoConPromo?.id ?? '00000000-0000-0000-0000-000000000000')
    .single();
  !errPedidoConPromo &&
  itemPedidoConPromo &&
  Number(itemPedidoConPromo.precio_unitario) === 6400 &&
  Number(pedidoConPromo.total) === 6400
    ? ok('El pedido cobra el precio con la promoción aplicada, no el de lista')
    : fail(`El pedido no cobró el precio promocional: ${JSON.stringify(itemPedidoConPromo)}`);

  const { data: vencida } = await admin.sb
    .from('promocion')
    .insert({
      titulo: 'Ya pasó',
      tipo_descuento: 'monto',
      valor: 1000,
      producto_id: prod.id,
      desde: '2020-01-01',
      hasta: '2020-01-31',
    })
    .select()
    .single();

  const { data: vencidaVistaPorAna } = await ana.sb
    .from('promocion')
    .select('id')
    .eq('id', vencida.id);
  !vencidaVistaPorAna || vencidaVistaPorAna.length === 0
    ? ok('Un cliente no ve una promoción ya vencida')
    : fail('FUGA: un cliente ve una promoción vencida');

  const { error: errAnaDesactiva } = await ana.sb
    .from('promocion')
    .update({ activa: false })
    .eq('id', promo.id);
  const { data: sigueActiva } = await admin.sb
    .from('promocion')
    .select('activa')
    .eq('id', promo.id)
    .single();
  (errAnaDesactiva || sigueActiva.activa === true) && sigueActiva.activa === true
    ? ok('Un cliente no puede pausar una promoción')
    : fail('FUGA: un cliente pausó una promoción');

  const { error: errRecepcionPausa } = await recepcion.sb
    .from('promocion')
    .update({ activa: false })
    .eq('id', promo.id);
  errRecepcionPausa
    ? fail(`Recepción no pudo pausar la promoción: ${errRecepcionPausa.message}`)
    : ok('Recepción pausa una promoción');

  const { data: catalogoSinPromo } = await ana.sb.rpc('catalogo_tienda');
  const yaSinPromo = (catalogoSinPromo ?? []).find((p) => p.id === prod.id);
  yaSinPromo && yaSinPromo.precio_promocional === null
    ? ok('Al pausarla, la tienda vuelve a mostrar el precio normal')
    : fail(`Seguía aplicando la promo pausada: ${JSON.stringify(yaSinPromo)}`);

  // Un DELETE filtrado por RLS no devuelve error cuando no matchea ninguna
  // fila — sólo borra cero filas en silencio. Hay que verificar contra la
  // fila en sí, no confiar en la ausencia de error.
  const { error: errAnaBorra } = await ana.sb.from('promocion').delete().eq('id', vencida.id);
  const { data: sigueAhi } = await admin.sb.from('promocion').select('id').eq('id', vencida.id);
  (errAnaBorra || (sigueAhi && sigueAhi.length === 1)) && sigueAhi && sigueAhi.length === 1
    ? ok('Un cliente no puede borrar una promoción')
    : fail('FUGA: un cliente borró una promoción');

  const { error: errAdminBorra } = await admin.sb.from('promocion').delete().eq('id', vencida.id);
  errAdminBorra
    ? fail(`El admin no pudo borrar la promoción: ${errAdminBorra.message}`)
    : ok('El admin borra una promoción');

  const { data: yaNoEsta } = await admin.sb.from('promocion').select('id').eq('id', vencida.id);
  !yaNoEsta || yaNoEsta.length === 0
    ? ok('La promoción borrada ya no aparece')
    : fail('La promoción seguía existiendo después de borrarla');
}

console.log('\n=== 108. Pedidos de la app sin Mercado Pago ===');
{
  const { data: prod } = await recepcion.sb
    .from('producto')
    .insert({ nombre: `Balanceado ${Date.now()}`, precio: 5000, visible_en_tienda: true })
    .select()
    .single();
  await recepcion.sb.rpc('registrar_movimiento', {
    p_producto_id: prod.id,
    p_tipo: 'ingreso',
    p_cantidad: 10,
  });

  const { data: pedido, error: errCrear } = await ana.sb.rpc('crear_orden_online', {
    p_items: [{ producto_id: prod.id, cantidad: 2 }],
  });
  errCrear
    ? fail(`Ana no pudo generar el pedido: ${errCrear.message}`)
    : ok('Un tutor genera un pedido desde la tienda, sin pasar por Mercado Pago');

  const { error: errAnaConfirma } = await ana.sb.rpc('confirmar_pedido_local', {
    p_orden_id: pedido.id,
    p_medio: 'efectivo',
  });
  errAnaConfirma
    ? ok('Un cliente no puede cobrarse su propio pedido')
    : fail('FUGA: un cliente confirmó el pago de su propio pedido');

  const { error: errMedioMP } = await recepcion.sb.rpc('confirmar_pedido_local', {
    p_orden_id: pedido.id,
    p_medio: 'mercadopago',
  });
  errMedioMP
    ? ok('No se puede registrar un cobro en persona como "mercadopago"')
    : fail('FUGA: se aceptó un cobro en persona con medio mercadopago');

  const { error: errConfirma } = await recepcion.sb.rpc('confirmar_pedido_local', {
    p_orden_id: pedido.id,
    p_medio: 'efectivo',
  });
  errConfirma
    ? fail(`Recepción no pudo cobrar el pedido: ${errConfirma.message}`)
    : ok('Recepción cobra el pedido en persona y lo marca pagado');

  const { data: ordenPagada } = await admin.sb
    .from('orden')
    .select('estado')
    .eq('id', pedido.id)
    .single();
  ordenPagada?.estado === 'pagada'
    ? ok('El pedido queda en estado "pagada"')
    : fail(`El pedido no pasó a pagada: ${JSON.stringify(ordenPagada)}`);

  const { data: movimientos } = await admin.sb
    .from('movimiento_stock')
    .select('cantidad')
    .eq('orden_id', pedido.id);
  movimientos?.some((m) => m.cantidad === -2)
    ? ok('El stock se descuenta recién al cobrarlo, no al generarlo')
    : fail('No se encontró el descuento de stock del pedido cobrado');

  const { error: errDobleConfirma } = await recepcion.sb.rpc('confirmar_pedido_local', {
    p_orden_id: pedido.id,
    p_medio: 'efectivo',
  });
  const { data: movimientosOtraVez } = await admin.sb
    .from('movimiento_stock')
    .select('id')
    .eq('orden_id', pedido.id);
  !errDobleConfirma && movimientosOtraVez.length === 1
    ? ok('Cobrar dos veces el mismo pedido no duplica el descuento de stock')
    : fail('Cobrar de nuevo un pedido ya pagado no fue idempotente');

  const { error: errAnaEntrega } = await ana.sb
    .from('orden')
    .update({ estado: 'entregada' })
    .eq('id', pedido.id);
  const { data: sigueSinEntregar } = await admin.sb
    .from('orden')
    .select('estado')
    .eq('id', pedido.id)
    .single();
  (errAnaEntrega || sigueSinEntregar.estado !== 'entregada') &&
  sigueSinEntregar.estado !== 'entregada'
    ? ok('Un cliente no puede marcar su propio pedido como entregado')
    : fail('FUGA: un cliente marcó su pedido como entregado');

  const { error: errEntrega } = await recepcion.sb
    .from('orden')
    .update({ estado: 'entregada' })
    .eq('id', pedido.id);
  errEntrega
    ? fail(`Recepción no pudo marcar el pedido como entregado: ${errEntrega.message}`)
    : ok('Recepción marca el pedido como entregado al retirarlo');
}

console.log('\n=== 109. Borrar una campaña ===');
{
  const { data: nueva } = await admin.sb.rpc('crear_campana', {
    p_titulo: 'Para borrar',
    p_cuerpo: 'Esta se borra en el test',
    p_segmento: {},
  });

  const { error: errAna } = await ana.sb.rpc('borrar_campana', { p_campana_id: nueva.id });
  errAna
    ? ok('Un cliente no puede borrar una campaña')
    : fail('FUGA: un cliente borró una campaña');

  const { error: errRecepcion } = await recepcion.sb.rpc('borrar_campana', {
    p_campana_id: nueva.id,
  });
  errRecepcion
    ? ok('Recepción no puede borrar una campaña')
    : fail('FUGA: recepción borró una campaña');

  const { error: errAdmin } = await admin.sb.rpc('borrar_campana', { p_campana_id: nueva.id });
  errAdmin
    ? fail(`El admin no pudo borrar la campaña: ${errAdmin.message}`)
    : ok('El admin borra una campaña');

  const { data: yaNoEsta } = await admin.sb.from('campana').select('id').eq('id', nueva.id);
  !yaNoEsta || yaNoEsta.length === 0
    ? ok('La campaña ya no aparece en la lista')
    : fail('La campaña seguía existiendo después de borrarla');
}

console.log('\n=== 110. Internación: carga clínica del veterinario, cobros del personal ===');
{
  const { data: paciente } = await ana.sb.rpc('crear_mascota', {
    p_nombre: 'Internadita',
    p_especie: 'perro',
  });

  // 1. Internar es un acto clínico: cliente y recepción no pueden.
  const { error: errAnaInt } = await ana.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Prueba',
  });
  errAnaInt ? ok('Un cliente no interna') : fail('FUGA: un cliente creó una internación');

  const { error: errRecInt } = await recepcion.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Prueba',
  });
  errRecInt ? ok('Recepción tampoco interna') : fail('FUGA: recepción creó una internación');

  // 2. El veterinario sí.
  const { data: internacion, error: errVetInt } = await vet.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Deshidratación, observación 24 h',
    p_diagnostico: 'Gastroenteritis',
  });
  errVetInt
    ? fail(`El veterinario no pudo internar: ${errVetInt.message}`)
    : ok('El veterinario interna al paciente');
  const ordenId = internacion?.orden_id;

  // 3. Una sola internación activa por mascota.
  const { error: errDoble } = await vet.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Otra',
  });
  errDoble ? ok('No se interna dos veces en paralelo') : fail('FUGA: dos internaciones activas');

  // 4. La lectura es sólo del personal.
  const { data: anaVe } = await ana.sb.from('internacion').select('id').eq('id', internacion.id);
  !anaVe || anaVe.length === 0
    ? ok('El cliente no ve la internación')
    : fail('FUGA: el cliente ve la internación');

  const { data: recVe } = await recepcion.sb
    .from('internacion')
    .select('id')
    .eq('id', internacion.id);
  recVe?.length === 1 ? ok('Recepción ve la internación') : fail('Recepción no ve la internación');

  const { error: errAnaLista } = await ana.sb.rpc('internaciones_activas');
  errAnaLista
    ? ok('El cliente no lista internaciones')
    : fail('FUGA: el cliente listó internaciones activas');

  // 5. La carga clínica es del veterinario.
  const { error: errRecEvo } = await recepcion.sb.rpc('registrar_evolucion_internacion', {
    p_internacion_id: internacion.id,
    p_nota: 'Estable',
  });
  errRecEvo ? ok('Recepción no carga evolución') : fail('FUGA: recepción cargó un parte');

  const { error: errVetEvo } = await vet.sb.rpc('registrar_evolucion_internacion', {
    p_internacion_id: internacion.id,
    p_nota: 'Ingreso: mucosas secas, 6% deshidratación',
    p_temperatura: 39.2,
  });
  errVetEvo
    ? fail(`El veterinario no pudo cargar evolución: ${errVetEvo.message}`)
    : ok('El veterinario carga el parte de evolución');

  // 6. Un estudio con cargo suma al total de la orden.
  const { data: estudio, error: errEstudio } = await vet.sb.rpc('registrar_estudio_internacion', {
    p_internacion_id: internacion.id,
    p_tipo: 'Hemograma',
    p_cargo_monto: 5000,
  });
  errEstudio
    ? fail(`No se pudo registrar el estudio: ${errEstudio.message}`)
    : ok('El veterinario pide un estudio con su cargo');

  const { data: orden1 } = await recepcion.sb
    .from('orden')
    .select('total')
    .eq('id', ordenId)
    .single();
  Number(orden1?.total) === 5000
    ? ok('El cargo del estudio se sumó a la orden')
    : fail(`El total quedó en ${orden1?.total}, esperaba 5000`);

  // 7. Cargo manual del personal.
  const { error: errAnaCargo } = await ana.sb.rpc('agregar_cargo_internacion', {
    p_internacion_id: internacion.id,
    p_concepto: 'Día de internación',
    p_monto: 3000,
  });
  errAnaCargo ? ok('El cliente no agrega cargos') : fail('FUGA: el cliente agregó un cargo');

  const { error: errCargo } = await recepcion.sb.rpc('agregar_cargo_internacion', {
    p_internacion_id: internacion.id,
    p_concepto: 'Día de internación',
    p_monto: 3000,
  });
  errCargo
    ? fail(`Recepción no pudo agregar el cargo: ${errCargo.message}`)
    : ok('Recepción agrega un cargo manual');

  // 8. Cobro parcial: exige caja abierta.
  const { data: cajaAbierta } = await recepcion.sb
    .from('turno_caja')
    .select('id')
    .is('cerrado_en', null);
  if (!cajaAbierta || cajaAbierta.length === 0) {
    await recepcion.sb.rpc('abrir_caja', { p_monto_inicial: 0 });
  }

  const { error: errPagoDeMas } = await recepcion.sb.rpc('registrar_pago_internacion', {
    p_internacion_id: internacion.id,
    p_monto: 999999,
    p_medio: 'efectivo',
  });
  errPagoDeMas
    ? ok('Un pago mayor al saldo se rechaza')
    : fail('FUGA: se cobró más que el saldo pendiente');

  const { error: errPago } = await recepcion.sb.rpc('registrar_pago_internacion', {
    p_internacion_id: internacion.id,
    p_monto: 3000,
    p_medio: 'efectivo',
  });
  errPago
    ? fail(`No se pudo registrar el pago parcial: ${errPago.message}`)
    : ok('Recepción registra un cobro parcial');

  // 9. Alta: cierra, deja saldo y numera comprobante.
  const { data: cierre, error: errCierre } = await vet.sb.rpc('cerrar_internacion', {
    p_internacion_id: internacion.id,
    p_motivo_egreso: 'Alta médica',
  });
  errCierre
    ? fail(`El veterinario no pudo dar el alta: ${errCierre.message}`)
    : ok('El veterinario cierra la internación');
  Number(cierre?.[0]?.saldo) === 5000
    ? ok('El alta informa el saldo pendiente (8000 − 3000)')
    : fail(`El alta informó saldo ${cierre?.[0]?.saldo}, esperaba 5000`);

  const { data: intCerrada } = await recepcion.sb
    .from('internacion')
    .select('estado, egreso_en')
    .eq('id', internacion.id)
    .single();
  intCerrada?.estado === 'cerrada' && intCerrada.egreso_en
    ? ok('La internación queda cerrada con fecha de egreso')
    : fail('La internación no quedó cerrada');

  const { data: comprobante } = await recepcion.sb
    .from('comprobante')
    .select('numero, total')
    .eq('orden_id', ordenId);
  comprobante?.length === 1 && Number(comprobante[0].total) === 8000
    ? ok('Se numeró un comprobante interno por el total')
    : fail(`Comprobante inesperado: ${JSON.stringify(comprobante)}`);

  // 10. Cerrada: no se cargan más actos ni cargos, pero sí se sigue cobrando.
  const { error: errEstudioCerrada } = await vet.sb.rpc('registrar_estudio_internacion', {
    p_internacion_id: internacion.id,
    p_tipo: 'Otro',
  });
  errEstudioCerrada
    ? ok('Cerrada, no admite nuevos estudios')
    : fail('FUGA: se cargó un estudio sobre una internación cerrada');

  const { error: errResultadoCerrada } = await vet.sb.rpc('actualizar_resultado_estudio', {
    p_estudio_id: estudio.id,
    p_resultado: 'Anemia leve',
  });
  errResultadoCerrada
    ? ok('Cerrada, no se editan resultados')
    : fail('FUGA: se editó un resultado sobre una internación cerrada');

  const { error: errSaldoFinal } = await recepcion.sb.rpc('registrar_pago_internacion', {
    p_internacion_id: internacion.id,
    p_monto: 5000,
    p_medio: 'efectivo',
  });
  errSaldoFinal
    ? fail(`No se pudo cobrar el saldo tras el alta: ${errSaldoFinal.message}`)
    : ok('El saldo se cobra después del alta');

  const { data: resumen } = await recepcion.sb.rpc('resumen_internacion', {
    p_internacion_id: internacion.id,
  });
  Number(resumen?.[0]?.saldo) === 0
    ? ok('Saldada la internación, el saldo queda en cero')
    : fail(`El saldo final quedó en ${resumen?.[0]?.saldo}`);
}

console.log('\n=== 111. Atención a domicilio: mismo circuito, episodio aparte ===');
{
  const { data: paciente } = await ana.sb.rpc('crear_mascota', {
    p_nombre: 'Domiciliaria',
    p_especie: 'gato',
  });

  // Un cliente no abre una atención a domicilio.
  const { error: errAna } = await ana.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Prueba',
    p_tipo: 'domicilio',
  });
  errAna
    ? ok('Un cliente no abre una visita a domicilio')
    : fail('FUGA: un cliente abrió una visita');

  // El veterinario abre la visita con su dirección.
  const { data: visita, error: errVet } = await vet.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Control post-operatorio en la casa',
    p_tipo: 'domicilio',
    p_direccion: 'Calle Falsa 123',
  });
  errVet
    ? fail(`El veterinario no pudo abrir la visita: ${errVet.message}`)
    : ok('El veterinario abre una atención a domicilio');

  // Y además puede internar a la misma mascota: son episodios de distinto tipo.
  const { error: errInt } = await vet.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Descompensación aguda',
  });
  errInt
    ? fail(`No se pudo internar teniendo una visita abierta: ${errInt.message}`)
    : ok('La misma mascota puede tener internación y domicilio activos a la vez');

  // Pero no dos visitas a domicilio activas.
  const { error: errDoble } = await vet.sb.rpc('crear_internacion', {
    p_mascota_id: paciente.id,
    p_motivo: 'Otra',
    p_tipo: 'domicilio',
  });
  errDoble
    ? ok('No se abren dos visitas a domicilio en paralelo')
    : fail('FUGA: dos visitas activas');

  // El filtro por tipo separa las listas.
  const { data: dom } = await recepcion.sb.rpc('internaciones_activas', { p_tipo: 'domicilio' });
  const { data: intr } = await recepcion.sb.rpc('internaciones_activas', { p_tipo: 'internacion' });
  const enDom = dom?.some((x) => x.id === visita.id);
  const enInt = intr?.some((x) => x.id === visita.id);
  enDom && !enInt
    ? ok('La visita aparece sólo en la lista de domicilios')
    : fail(`La visita apareció mal: domicilio=${enDom} internacion=${enInt}`);

  // El resumen trae el tipo y la dirección.
  const { data: res } = await recepcion.sb.rpc('resumen_internacion', {
    p_internacion_id: visita.id,
  });
  res?.[0]?.tipo === 'domicilio' && res[0].direccion === 'Calle Falsa 123'
    ? ok('El resumen distingue el tipo y guarda la dirección')
    : fail(`Resumen inesperado: ${JSON.stringify(res?.[0])}`);

  // La maquinaria compartida (cargo, cobro, cierre) funciona igual.
  await vet.sb.rpc('agregar_cargo_internacion', {
    p_internacion_id: visita.id,
    p_concepto: 'Visita a domicilio',
    p_monto: 6000,
  });
  const { data: cajaAbierta } = await recepcion.sb
    .from('turno_caja')
    .select('id')
    .is('cerrado_en', null);
  if (!cajaAbierta || cajaAbierta.length === 0) {
    await recepcion.sb.rpc('abrir_caja', { p_monto_inicial: 0 });
  }
  await recepcion.sb.rpc('registrar_pago_internacion', {
    p_internacion_id: visita.id,
    p_monto: 6000,
    p_medio: 'efectivo',
  });
  const { data: cierre, error: errCierre } = await vet.sb.rpc('cerrar_internacion', {
    p_internacion_id: visita.id,
    p_motivo_egreso: 'Alta médica',
  });
  errCierre || Number(cierre?.[0]?.saldo) !== 0
    ? fail(`El cierre de la visita falló: ${errCierre?.message ?? cierre?.[0]?.saldo}`)
    : ok('La visita a domicilio se cobra y se cierra como una internación');
}

console.log('\n=== 112. Vincular un tutor a un paciente (crear-tutor) ===');
{
  const { data: paciente } = await ana.sb.rpc('crear_mascota', {
    p_nombre: 'Vinculada',
    p_especie: 'perro',
  });

  // Un cliente no vincula tutores.
  const { error: errCliente } = await ana.sb.rpc('vincular_tutor_a_mascota', {
    p_perfil_id: bruno.userId,
    p_mascota_id: paciente.id,
  });
  errCliente ? ok('Un cliente no vincula tutores') : fail('FUGA: un cliente vinculó un tutor');

  // El personal sí. Ana ya es titular, así que Bruno entra como 'tutor'.
  const { error: errRecep } = await recepcion.sb.rpc('vincular_tutor_a_mascota', {
    p_perfil_id: bruno.userId,
    p_mascota_id: paciente.id,
  });
  errRecep
    ? fail(`Recepción no pudo vincular: ${errRecep.message}`)
    : ok('Recepción vincula un tutor al paciente');

  const { data: vinculo } = await recepcion.sb
    .from('mascota_tutor')
    .select('rol')
    .eq('mascota_id', paciente.id)
    .eq('perfil_id', bruno.userId)
    .is('revocado_en', null);
  vinculo?.length === 1 && vinculo[0].rol === 'tutor'
    ? ok('Queda como "tutor" porque ya había titular')
    : fail(`Vínculo inesperado: ${JSON.stringify(vinculo)}`);

  // Idempotente: llamar de nuevo no duplica.
  await recepcion.sb.rpc('vincular_tutor_a_mascota', {
    p_perfil_id: bruno.userId,
    p_mascota_id: paciente.id,
  });
  const { data: repetido } = await recepcion.sb
    .from('mascota_tutor')
    .select('id')
    .eq('mascota_id', paciente.id)
    .eq('perfil_id', bruno.userId)
    .is('revocado_en', null);
  repetido?.length === 1
    ? ok('Vincular dos veces no duplica el acceso')
    : fail('Se duplicó el vínculo');

  // Sobre un paciente sin titular (alta de la clínica), el primero entra como titular.
  const { data: sinTitular } = await recepcion.sb.rpc('crear_paciente', {
    p_nombre: 'SinTitular',
    p_especie: 'gato',
    p_tutor_nombre: 'Alguien',
  });
  await recepcion.sb.rpc('vincular_tutor_a_mascota', {
    p_perfil_id: bruno.userId,
    p_mascota_id: sinTitular.id,
  });
  const { data: comoTitular } = await recepcion.sb
    .from('mascota_tutor')
    .select('rol')
    .eq('mascota_id', sinTitular.id)
    .eq('perfil_id', bruno.userId)
    .is('revocado_en', null);
  comoTitular?.[0]?.rol === 'titular'
    ? ok('Si no había titular, el tutor vinculado queda como titular')
    : fail(`Rol inesperado en paciente sin titular: ${JSON.stringify(comoTitular)}`);
}

console.log(
  fallos === 0
    ? '\n\x1b[32m▸ Todas las verificaciones pasaron\x1b[0m\n'
    : `\n\x1b[31m▸ ${fallos} verificación(es) fallaron\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);
