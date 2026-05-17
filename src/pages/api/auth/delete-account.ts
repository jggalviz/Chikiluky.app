import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '../../../lib/session.ts';

const CLEAR = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

export const POST: APIRoute = async ({ request }) => {
  const { user } = await getSession(request);

  if (!user) {
    return new Response(
      JSON.stringify({ error: 'No autorizado.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Error de servidor: Llave administrativa de Supabase no configurada.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Inicializar cliente con privilegios Service Role para poder eliminar usuarios
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  // Eliminar usuario de Supabase Auth
  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error('[delete-account] Error de eliminación:', error.message);
    return new Response(
      JSON.stringify({ error: `No se pudo eliminar la cuenta: ${error.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Limpiar cookies de sesión para desloguear al usuario eliminado
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `sb-access-token=; ${CLEAR}`);
  headers.append('Set-Cookie', `sb-refresh-token=; ${CLEAR}`);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers }
  );
};
