import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase.js';

const CLEAR = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

export const GET: APIRoute = async () => {
  await supabase.auth.signOut();

  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', `sb-access-token=; ${CLEAR}`);
  headers.append('Set-Cookie', `sb-refresh-token=; ${CLEAR}`);

  return new Response(null, { status: 302, headers });
};

export const POST: APIRoute = GET;
