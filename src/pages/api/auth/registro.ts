import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const COOKIE_OPTS = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=604800';

export const POST: APIRoute = async ({ request }) => {
  // Cliente fresco por request — evita contaminación de sesión entre llamadas
  const supabase = createClient(
    import.meta.env.SUPABASE_URL     ?? import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  );

  const form = await request.formData();

  const email    = String(form.get('email')     ?? '').trim();
  const password = String(form.get('password')  ?? '');
  const nombre   = String(form.get('full_name') ?? '').trim();
  const telefono = String(form.get('telefono')  ?? '').trim();
  const rol      = String(form.get('role')      ?? 'cliente');

  if (!email || !password || !nombre) {
    return new Response(
      JSON.stringify({ error: 'Campos requeridos: email, contraseña y nombre.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (password.length < 6) {
    return new Response(
      JSON.stringify({ error: 'La contraseña debe tener mínimo 6 caracteres.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!['cliente', 'experto', 'soporte'].includes(rol)) {
    return new Response(
      JSON.stringify({ error: 'Rol inválido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Registrar en Supabase Auth — el trigger crea el perfil base automáticamente
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: nombre, role: rol } },
  });

  if (authError || !authData.user) {
    console.error('[registro] authError:', authError?.status, authError?.message);
    return new Response(
      JSON.stringify({ error: authError?.message ?? 'Error al crear la cuenta.' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // UPSERT del perfil (el trigger puede haberlo creado ya — ON CONFLICT actualiza)
  const { error: profileError } = await supabase
    .from('perfiles')
    .upsert({
      id:        authData.user.id,
      full_name: nombre,
      telefono:  telefono || null,
      role:      rol,
    }, { onConflict: 'id' });

  if (profileError) {
    console.error('[registro] perfil upsert error:', profileError.message);
  }

  // Si Supabase devuelve sesión inmediata (email confirm desactivado) → auto-login
  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (authData.session) {
    headers.append('Set-Cookie', `sb-access-token=${authData.session.access_token}; ${COOKIE_OPTS}`);
    headers.append('Set-Cookie', `sb-refresh-token=${authData.session.refresh_token}; ${COOKIE_OPTS}`);
    const redirectTo = rol === 'soporte'
      ? '/app/soporte/escritorio'
      : (rol === 'experto' ? '/app/experto/agenda' : '/app/cliente/buscar');
    return new Response(
      JSON.stringify({ ok: true, autoLogin: true, redirectTo }),
      { status: 201, headers }
    );
  }

  // Email confirmation activado → pedir al usuario que confirme
  return new Response(
    JSON.stringify({ ok: true, autoLogin: false, message: 'Cuenta creada. Revisa tu email para confirmar.' }),
    { status: 201, headers }
  );
};
