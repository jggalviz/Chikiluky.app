import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const REDIRECT_BY_ROLE: Record<string, string> = {
  cliente:       '/app/cliente/buscar',
  experto:       '/app/experto/escritorio',
  administrador: '/app/soporte/escritorio',
  soporte:       '/app/soporte/escritorio',
};

const COOKIE_OPTS = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=604800';

export const POST: APIRoute = async ({ request }) => {
  // Cliente fresco por request
  const supabase = createClient(
    import.meta.env.SUPABASE_URL     ?? import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  );

  const form     = await request.formData();
  const email    = String(form.get('email')    ?? '').trim();
  const password = String(form.get('password') ?? '');

  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: 'Email y contraseña son requeridos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email, password,
  });

  if (authError || !authData.user || !authData.session) {
    return new Response(
      JSON.stringify({ error: 'Credenciales incorrectas.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  const redirectTo = REDIRECT_BY_ROLE[perfil?.role ?? 'cliente'] ?? '/app/cliente/buscar';
  const { access_token, refresh_token } = authData.session;

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `sb-access-token=${access_token}; ${COOKIE_OPTS}`);
  headers.append('Set-Cookie', `sb-refresh-token=${refresh_token}; ${COOKIE_OPTS}`);

  return new Response(
    JSON.stringify({ ok: true, rol: perfil?.role, redirectTo }),
    { status: 200, headers }
  );
};
