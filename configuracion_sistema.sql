-- ══════════════════════════════════════════════════════════
-- CHIKILUKY.app - Esquema de Configuración Global del Sistema (BCV)
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════

-- Limpieza inicial para recrear de forma limpia
DROP TABLE IF EXISTS public.configuracion_sistema CASCADE;

-- 1. Tabla de Configuración de Fila Única (Singleton Pattern en DB)
CREATE TABLE public.configuracion_sistema (
    id INT PRIMARY KEY DEFAULT 1,
    tasa_bcv NUMERIC(10, 4) NOT NULL DEFAULT 40.0000,
    ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Restricción para garantizar que NUNCA exista más de una fila de configuración
    CONSTRAINT chk_only_one_row CHECK (id = 1)
);

-- 2. Insertar semilla inicial (Tasa de referencia de prueba a 40.00 Bs/$)
INSERT INTO public.configuracion_sistema (id, tasa_bcv, ultima_actualizacion)
VALUES (1, 40.0000, timezone('utc'::text, now()))
ON CONFLICT (id) DO UPDATE 
SET tasa_bcv = EXCLUDED.tasa_bcv, 
    ultima_actualizacion = EXCLUDED.ultima_actualizacion;

-- 3. Activar Row Level Security (RLS)
ALTER TABLE public.configuracion_sistema ENABLE ROW LEVEL SECURITY;

-- 4. Definición de Políticas de RLS
-- Lectura pública para cualquier usuario (clientes, visitantes, expertos, etc.)
CREATE POLICY "Permitir lectura publica de la configuracion" 
    ON public.configuracion_sistema
    FOR SELECT 
    USING (true);

-- Escritura/Modificación restringida estrictamente a administradores del sistema
CREATE POLICY "Permitir modificacion solo a administradores" 
    ON public.configuracion_sistema
    FOR ALL 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE perfiles.id = auth.uid() 
              AND perfiles.role = 'administrador'
        )
    );
