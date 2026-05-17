-- -------------------------------------------------------------
-- SOLUCIÓN DE RLS PARA REGISTRO MANUAL DE CITAS (OFFLINE)
-- -------------------------------------------------------------

-- 1. Habilitar inserción de reservas por parte de clientes, expertos y administradores
DROP POLICY IF EXISTS "Permitir insercion publica de reservas" ON public.reservas;
CREATE POLICY "Permitir insercion publica de reservas"
    ON public.reservas FOR INSERT WITH CHECK (
        auth.uid() = cliente_id OR 
        auth.uid() = profesional_id OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('experto', 'administrador', 'soporte')
        )
    );

-- Habilitar lectura/selección de reservas
DROP POLICY IF EXISTS "Permitir lectura de reservas" ON public.reservas;
CREATE POLICY "Permitir lectura de reservas"
    ON public.reservas FOR SELECT USING (
        auth.uid() = cliente_id OR 
        auth.uid() = profesional_id OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('experto', 'administrador', 'soporte')
        )
    );

-- Habilitar actualización de reservas
DROP POLICY IF EXISTS "Permitir actualizacion de reservas" ON public.reservas;
CREATE POLICY "Permitir actualizacion de reservas"
    ON public.reservas FOR UPDATE USING (
        auth.uid() = cliente_id OR 
        auth.uid() = profesional_id OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('experto', 'administrador', 'soporte')
        )
    );


-- 2. Habilitar inserción en la tabla legacy 'citas' por parte de expertos y administradores
DROP POLICY IF EXISTS "Permitir insercion de citas" ON public.citas;
CREATE POLICY "Permitir insercion de citas"
    ON public.citas FOR INSERT WITH CHECK (
        auth.uid() = expert_id OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('experto', 'administrador', 'soporte')
        )
    );

-- Habilitar lectura/selección de citas
DROP POLICY IF EXISTS "Permitir lectura de citas" ON public.citas;
CREATE POLICY "Permitir lectura de citas"
    ON public.citas FOR SELECT USING (
        auth.uid() = client_id OR 
        auth.uid() = expert_id OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('experto', 'administrador', 'soporte')
        )
    );

-- Habilitar actualización de citas
DROP POLICY IF EXISTS "Permitir actualizacion de citas" ON public.citas;
CREATE POLICY "Permitir actualizacion de citas"
    ON public.citas FOR UPDATE USING (
        auth.uid() = expert_id OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('experto', 'administrador', 'soporte')
        )
    );
