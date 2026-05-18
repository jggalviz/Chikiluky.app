import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const REDIRECT_BY_ROLE: Record<string, string> = {
  cliente:       '/app/cliente/escritorio',
  experto:       '/app/experto/escritorio',
  administrador: '/app/soporte/escritorio',
  soporte:       '/app/soporte/escritorio',
};

export const POST: APIRoute = async ({ request, cookies }) => {
  // Cliente fresco por request
  const supabase = createClient(
    import.meta.env.SUPABASE_URL     ?? import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  );

  const form     = await request.formData();
  const email    = String(form.get('email')    ?? '').trim();
  const password = String(form.get('password') ?? '');
  const role     = String(form.get('role')     ?? '').trim();

  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: 'Email y contraseña son requeridos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!role || !['cliente', 'experto'].includes(role)) {
    return new Response(
      JSON.stringify({ error: 'Debes seleccionar un rol (Cliente o Profesional).' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email, password,
  });

  if (authError || !authData.user || !authData.session) {
    return new Response(
      JSON.stringify({ error: authError?.message ?? 'Credenciales incorrectas.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  // Use the role selected by the user in the form to determine redirect,
  // falling back to the DB role if the submitted role is not recognized
  const redirectTo = REDIRECT_BY_ROLE[role] ?? REDIRECT_BY_ROLE[perfil?.role ?? 'cliente'] ?? '/app/cliente/buscar';
  const { access_token, refresh_token } = authData.session;

  cookies.set('sb-access-token', access_token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 604800,
  });
  cookies.set('sb-refresh-token', refresh_token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 604800,
  });

  return new Response(
    JSON.stringify({ ok: true, rol: role, redirectTo }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
