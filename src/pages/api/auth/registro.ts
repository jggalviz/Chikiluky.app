import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const POST: APIRoute = async ({ request, cookies }) => {
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
  const rol      = 'cliente'; // Registro unificado como cliente por defecto

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

  if (authData.session) {
    cookies.set('sb-access-token', authData.session.access_token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 604800,
    });
    cookies.set('sb-refresh-token', authData.session.refresh_token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 604800,
    });
    const redirectTo = '/app/cliente/escritorio';
    return new Response(
      JSON.stringify({ ok: true, autoLogin: true, redirectTo }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Email confirmation activado → pedir al usuario que confirme
  return new Response(
    JSON.stringify({ ok: true, autoLogin: false, message: 'Cuenta creada. Revisa tu email para confirmar.' }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
};
