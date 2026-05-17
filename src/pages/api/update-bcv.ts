import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const GET: APIRoute = async (context) => {
  return handleUpdate(context);
};

export const POST: APIRoute = async (context) => {
  return handleUpdate(context);
};

async function handleUpdate({ request, url }: Parameters<APIRoute>[0]) {
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

    // 1. Lógica de Autenticación de Seguridad (Dual: Token y Sesión de Usuario)
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

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    });

    if (token) {
      await supabaseUser.auth.setSession({ access_token: token, refresh_token: '' });
      const { data: { user } } = await supabaseUser.auth.getUser();

      if (user) {
        const { data: perfil } = await supabaseUser
          .from('perfiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (perfil && ['administrador', 'experto', 'soporte'].includes(perfil.role)) {
          isAuthorized = true;
          authMethod = `usuario_autenticado (${perfil.role})`;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'No autorizado para actualizar la tasa.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. SCRAPER NATIVO DEL BCV (bcv.org.ve)
    let nuevaTasa = 0;
    try {
      // Evitar rechazo de certificados TLS auto-firmados o con problemas en el BCV
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

      const res = await fetch('https://www.bcv.org.ve/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!res.ok) {
        throw new Error(`El sitio del BCV devolvió estado HTTP ${res.status}`);
      }

      const html = await res.text();
      const index = html.indexOf('id="dolar"');
      
      if (index === -1) {
        throw new Error('No se encontró el contenedor id="dolar" en el HTML del BCV.');
      }

      // Tomamos un fragmento de HTML alrededor del bloque del dólar
      const slice = html.slice(index, index + 1000);
      const match = slice.match(/<strong[^>]*?>\s*([\d.,]+)\s*<\/strong>/i);

      if (!match) {
        throw new Error('No se encontró la etiqueta strong con el valor del dólar en el bloque del BCV.');
      }

      const rawVal = match[1].trim();
      nuevaTasa = parseFloat(rawVal.replace(',', '.'));

      if (isNaN(nuevaTasa) || nuevaTasa <= 0) {
        throw new Error(`El valor de la tasa obtenido del BCV es inválido: ${rawVal}`);
      }

    } catch (scraperErr: any) {
      // CONTROL DE ERRORES: Si la página del BCV está caída o bloquea la petición, se registra el error
      console.error('Error al ejecutar el Web Scraper de bcv.org.ve:', scraperErr);
      
      // Recuperar la última tasa de la base de datos como respaldo de seguridad
      const { data: configActual } = await supabaseUser
        .from('configuracion_sistema')
        .select('tasa_bcv')
        .eq('id', 1)
        .maybeSingle();

      if (configActual?.tasa_bcv) {
        nuevaTasa = parseFloat(configActual.tasa_bcv);
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'La web oficial del BCV no está respondiendo. Se mantuvo la última tasa guardada como respaldo de seguridad.',
            tasa_actual: nuevaTasa,
            detalles: scraperErr?.message ?? String(scraperErr)
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        throw new Error(`El scraper falló y no hay una tasa previa para respaldo: ${scraperErr?.message}`);
      }
    }

    // 3. Inicializar Cliente Supabase con privilegios adecuados para escribir
    let supabaseEscritura = supabaseUser;
    let usingAdminClient = false;

    if (serviceRoleKey) {
      supabaseEscritura = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
      });
      usingAdminClient = true;
    }

    // Obtener tasa actual para contrastar
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
      if (updateError.code === '42501' && !usingAdminClient) {
        return new Response(
          JSON.stringify({
            error: 'Error de permisos de base de datos (RLS). Para permitir escritura manual configura SUPABASE_SERVICE_ROLE_KEY.',
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
        mensaje: 'Tasa BCV actualizada directamente del sitio oficial con éxito.',
        fuente: 'Banco Central de Venezuela (bcv.org.ve)',
        tasa_anterior: tasaAnterior,
        tasa_nueva: nuevaTasa,
        metodo_autenticacion: authMethod,
        usó_cliente_admin: usingAdminClient,
        fecha_sincronizacion: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Error en /api/update-bcv:', err);
    return new Response(
      JSON.stringify({
        error: 'Error interno al procesar el scraper del BCV.',
        detalles: err?.message ?? String(err)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
