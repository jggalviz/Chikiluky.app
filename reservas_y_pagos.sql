-- ══════════════════════════════════════════════════════════
-- CHIKILUKY.app - Módulo 2: Reservas y Métodos de Pago
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════

-- Habilitar extensión UUID si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Perfiles Profesionales (Configuración de Métodos de Pago del Experto)
CREATE TABLE IF NOT EXISTS public.perfiles_profesionales (
    id UUID PRIMARY KEY REFERENCES public.perfiles(id) ON DELETE CASCADE,
    pago_movil_activo BOOLEAN DEFAULT false NOT NULL,
    pago_movil_banco TEXT,
    pago_movil_telefono TEXT,
    pago_movil_cedula TEXT,
    zelle_activo BOOLEAN DEFAULT false NOT NULL,
    zelle_correo TEXT,
    zelle_titular TEXT,
    efectivo_activo BOOLEAN DEFAULT true NOT NULL
);

-- Seed/Poblar con valores iniciales de prueba para los expertos existentes
INSERT INTO public.perfiles_profesionales (id, pago_movil_activo, pago_movil_banco, pago_movil_telefono, pago_movil_cedula, zelle_activo, zelle_correo, zelle_titular, efectivo_activo)
SELECT id, true, 'Banesco', '04121234567', 'V-12345678', true, 'pagos@chikiluky.app', 'Chikiluky Barbershop', true
FROM public.perfiles
WHERE role = 'experto'
ON CONFLICT (id) DO NOTHING;

-- 2. Tabla de Reservas Completa
CREATE TABLE IF NOT EXISTS public.reservas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    profesional_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    servicio_id UUID REFERENCES public.servicios(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    estado TEXT DEFAULT 'confirmada' NOT NULL,
    pago_metodo TEXT NOT NULL CHECK (pago_metodo IN ('pago_movil', 'zelle', 'efectivo')),
    pago_referencia TEXT,
    pago_banco_emisor TEXT,
    pago_estado TEXT DEFAULT 'pendiente_verificacion' NOT NULL CHECK (pago_estado IN ('pendiente_verificacion', 'verificado', 'rechazado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Habilitar RLS en ambas tablas
ALTER TABLE public.perfiles_profesionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para perfiles_profesionales
DROP POLICY IF EXISTS "Permitir lectura publica de perfiles profesionales" ON public.perfiles_profesionales;
CREATE POLICY "Permitir lectura publica de perfiles profesionales"
    ON public.perfiles_profesionales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir modificacion de propio perfil profesional" ON public.perfiles_profesionales;
CREATE POLICY "Permitir modificacion de propio perfil profesional"
    ON public.perfiles_profesionales FOR ALL USING (auth.uid() = id);

-- 5. Políticas RLS para reservas
DROP POLICY IF EXISTS "Permitir lectura de reservas a dueños de la cita" ON public.reservas;
CREATE POLICY "Permitir lectura de reservas a dueños de la cita"
    ON public.reservas FOR SELECT USING (
        auth.uid() = cliente_id OR 
        auth.uid() = profesional_id OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('soporte', 'administrador')
        )
    );

DROP POLICY IF EXISTS "Permitir insercion publica de reservas" ON public.reservas;
CREATE POLICY "Permitir insercion publica de reservas"
    ON public.reservas FOR INSERT WITH CHECK (
        auth.uid() = cliente_id
    );

DROP POLICY IF EXISTS "Permitir modificacion de reservas a autorizados" ON public.reservas;
CREATE POLICY "Permitir modificacion de reservas a autorizados"
    ON public.reservas FOR UPDATE USING (
        auth.uid() = profesional_id OR 
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('soporte', 'administrador')
        )
    );
