import { createClient } from '@supabase/supabase-js';

// Prioriza la sintaxis recomendada import.meta.env para variables del lado del cliente
const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL     ?? import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Alerta de compilación: Faltan variables de Supabase en este entorno (SUPABASE_URL / SUPABASE_ANON_KEY). Se usarán valores placeholder durante el build.");
}

// Inicialización blindada: si no existen variables en build-time, usa un cliente placeholder
// para evitar que Astro detenga la compilación del servidor SSR.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder');

