/**
 * src/lib/session.ts
 * Helper SSR: extrae y valida la sesión desde cookies del request.
 * Uso: const { user, perfil } = await getSession(Astro.request);
 */
import { supabase } from './supabase.js';

export interface Perfil {
  full_name: string;
  role: 'cliente' | 'experto' | 'administrador';
  telefono?: string | null;
}

export interface Session {
  user: { id: string; email?: string } | null;
  perfil: Perfil | null;
}

export async function getSession(request: Request): Promise<Session> {
  const cookies = request.headers.get('cookie') ?? '';
  const token   = cookies.match(/sb-access-token=([^;]+)/)?.[1];

  if (!token) return { user: null, perfil: null };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null, perfil: null };

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('full_name, role, telefono')
    .eq('id', user.id)
    .single();

  return { user: { id: user.id, email: user.email }, perfil: perfil ?? null };
}
