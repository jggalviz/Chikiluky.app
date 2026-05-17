/**
 * src/lib/session.ts
 * Helper SSR: extrae y valida la sesión desde cookies del request.
 * Uso: const { user, perfil } = await getSession(Astro.request);
 */
import { createClient } from '@supabase/supabase-js';

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

  // Crear cliente fresco y seguro para este request con el token de autorización
  const supabaseClient = createClient(
    import.meta.env.SUPABASE_URL     ?? import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
      },
    }
  );

  const { data: { user }, error } = await supabaseClient.auth.getUser(token);
  if (error || !user) {
    console.error("[getSession] auth getUser error:", error?.message);
    return { user: null, perfil: null };
  }

  // Consultar perfil usando el cliente autenticado para cumplir con las políticas RLS
  const { data: perfil, error: pError } = await supabaseClient
    .from('perfiles')
    .select('full_name, role, telefono')
    .eq('id', user.id)
    .single();

  if (pError) {
    console.error("[getSession] perfiles select error under user context:", pError.message);
  }

  return { user: { id: user.id, email: user.email }, perfil: perfil ?? null };
}
