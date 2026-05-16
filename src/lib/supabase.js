import { createClient } from '@supabase/supabase-js';

// Acepta vars con o sin prefijo PUBLIC_ para compatibilidad con el .env
const supabaseUrl     = import.meta.env.SUPABASE_URL     ?? import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
