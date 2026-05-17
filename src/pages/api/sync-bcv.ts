import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const GET: APIRoute = async (context) => {
  return handleSync(context);
};

export const POST: APIRoute = async (context) => {
  return handleSync(context);
};

async function handleSync({ request, url }: Parameters<APIRoute>[0]) {
  try {
    const supabaseUrl = import.meta.env.SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Faltan variables de entorno de Supabase.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Lógica de Autenticación
    let isAuthorized = false;
    let authMethod = '';

    // Método A: Validar por Token Secreto (Cron / Automatización)
    const secretParam = url.searchParams.get('secret');
    const cronSecret = import.meta.env.CRON_SECRET ?? 'chikiluky-sync-secret-123';
    
    if (secretParam && secretParam === cronSecret) {
      isAuthorized = true;
      authMethod = 'token_secreto';
    }

    // Método B: Validar por Sesión de Usuario (Cookie sb-access-token)
    const authHeader = request.headers.get('cookie') ?? '';
    const token = authHeader.match(/sb-access-token=([^;]+)/)?.[1];
    let userRole = '';
    let userId = '';

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    });

    if (token) {
      await supabaseUser.auth.setSession({ access_token: token, refresh_token: '' });
      const { data: { user } } = await supabaseUser.auth.getUser();

      if (user) {
        userId = user.id;
        const { data: perfil } = await supabaseUser
          .from('perfiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (perfil && ['administrador', 'experto', 'soporte'].includes(perfil.role)) {
          isAuthorized = true;
          userRole = perfil.role;
          authMethod = `usuario_autenticado (${perfil.role})`;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'No autorizado para sincronizar la tasa.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch de datos desde DolarApi.com
    const res = await fetch('https://ve.dolarapi.com/v1/dolares');
    if (!res.ok) {
      throw new Error(`DolarApi devolvió estado HTTP ${res.status}`);
    }
    
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Formato de datos de DolarApi inválido (se esperaba un array).');
    }

    const dolarOficial = data.find((item: any) => item.fuente === 'oficial');
    if (!dolarOficial || !dolarOficial.promedio) {
      throw new Error('No se encontró la cotización oficial en el feed de DolarApi.');
    }

    const nuevaTasa = parseFloat(dolarOficial.promedio);
    if (isNaN(nuevaTasa) || nuevaTasa <= 0) {
      throw new Error(`Valor de tasa obtenido inválido: ${dolarOficial.promedio}`);
    }

    // 3. Inicializar Cliente Supabase con privilegios adecuados para escribir
    // Si el rol es experto y no es admin, o si es un cron, requerimos service_role
    // para sobrepasar RLS si el usuario no tiene permisos directos de escritura.
    let supabaseEscritura = supabaseUser;
    let usingAdminClient = false;

    if (serviceRoleKey) {
      supabaseEscritura = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
      });
      usingAdminClient = true;
    }

    // Obtener tasa actual en base de datos para comparar
    const { data: configActual } = await supabaseUser
      .from('configuracion_sistema')
      .select('tasa_bcv')
      .eq('id', 1)
      .maybeSingle();
    
    const tasaAnterior = configActual?.tasa_bcv ? parseFloat(configActual.tasa_bcv) : null;

    // Actualizar la tasa en Supabase
    const { error: updateError } = await supabaseEscritura
      .from('configuracion_sistema')
      .update({
        tasa_bcv: nuevaTasa,
        ultima_actualizacion: new Date().toISOString()
      })
      .eq('id', 1);

    if (updateError) {
      // Si falló por políticas RLS y no se definió service_role, devolver una advertencia útil
      if (updateError.code === '42501' && !usingAdminClient) {
        return new Response(
          JSON.stringify({
            error: 'Error de permisos de base de datos (RLS). Para permitir que los expertos sincronicen la tasa, debes configurar la variable de entorno SUPABASE_SERVICE_ROLE_KEY en tu servidor.',
            detalles: updateError.message
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mensaje: 'Tasa BCV sincronizada con éxito.',
        fuente: 'DolarApi.com (Oficial)',
        tasa_anterior: tasaAnterior,
        tasa_nueva: nuevaTasa,
        metodo_autenticacion: authMethod,
        usó_cliente_admin: usingAdminClient,
        fecha_sincronizacion: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Error en /api/sync-bcv:', err);
    return new Response(
      JSON.stringify({
        error: 'Error interno al sincronizar la tasa BCV.',
        detalles: err?.message ?? String(err)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
