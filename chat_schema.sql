-- ══════════════════════════════════════════════════════════
-- CHIKILUKY.app - Esquema del Sistema de Chat Realtime
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════

-- Limpieza inicial para recrear de forma limpia y aplicar los nuevos FK
DROP TABLE IF EXISTS public.mensajes_chat CASCADE;
DROP TABLE IF EXISTS public.salas_chat CASCADE;

-- Habilitar extensión UUID si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Salas de Chat
CREATE TABLE IF NOT EXISTS public.salas_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sala_type VARCHAR(50) NOT NULL, -- 'cliente_profesional', 'soporte', 'soporte_anonimo'
    cliente_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    profesional_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    anonimo_session_id VARCHAR(255) UNIQUE,
    CONSTRAINT chk_sala_type CHECK (sala_type IN ('cliente_profesional', 'soporte', 'soporte_anonimo'))
);

-- 2. Tabla de Mensajes de Chat
CREATE TABLE IF NOT EXISTS public.mensajes_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sala_id UUID NOT NULL REFERENCES public.salas_chat(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    sender_type VARCHAR(50) NOT NULL, -- 'cliente', 'profesional', 'anonimo', 'soporte'
    contenido TEXT NOT NULL,
    CONSTRAINT chk_sender_type CHECK (sender_type IN ('cliente', 'profesional', 'anonimo', 'soporte'))
);

-- 3. Trigger de Validación de Negocio
-- Restringe al profesional enviar mensajes si la sala de chat no fue creada previamente por el cliente
CREATE OR REPLACE FUNCTION public.check_profesional_message_restriction()
RETURNS TRIGGER AS $$
DECLARE
    v_sala_type VARCHAR(50);
    v_cliente_id UUID;
BEGIN
    -- Obtener información de la sala relacionada
    SELECT sala_type, cliente_id INTO v_sala_type, v_cliente_id
    FROM public.salas_chat
    WHERE id = NEW.sala_id;

    -- Validación para el flujo Cliente-Profesional
    IF NEW.sender_type = 'profesional' AND v_sala_type = 'cliente_profesional' THEN
        -- Si no existe cliente_id o la sala no existía en el registro del cliente
        IF v_cliente_id IS NULL THEN
            RAISE EXCEPTION 'Restricción de Negocio: Un profesional no puede enviar un mensaje si no existe una sala creada previamente por el cliente.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_check_profesional_message
    BEFORE INSERT ON public.mensajes_chat
    FOR EACH ROW
    EXECUTE FUNCTION public.check_profesional_message_restriction();

-- 4. Activar Row Level Security (RLS)
ALTER TABLE public.salas_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_chat ENABLE ROW LEVEL SECURITY;

-- 5. Declarar Políticas RLS Seguras
-- Políticas para salas_chat
CREATE POLICY "Permitir lectura de salas" ON public.salas_chat
    FOR SELECT USING (
        auth.uid() = cliente_id OR 
        auth.uid() = profesional_id OR 
        anonimo_session_id IS NOT NULL OR
        EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('soporte', 'administrador')
        )
    );

CREATE POLICY "Permitir inserción de salas" ON public.salas_chat
    FOR INSERT WITH CHECK (
        (sala_type = 'cliente_profesional' AND auth.uid() = cliente_id) OR
        (sala_type = 'soporte' AND (auth.uid() = cliente_id OR auth.uid() = profesional_id OR EXISTS (
            SELECT 1 FROM public.perfiles 
            WHERE perfiles.id = auth.uid() AND perfiles.role IN ('soporte', 'administrador')
        ))) OR
        (sala_type = 'soporte_anonimo' AND anonimo_session_id IS NOT NULL)
    );

-- Políticas para mensajes_chat
CREATE POLICY "Permitir lectura de mensajes" ON public.mensajes_chat
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.salas_chat s 
            WHERE s.id = mensajes_chat.sala_id AND (
                s.cliente_id = auth.uid() OR 
                s.profesional_id = auth.uid() OR
                s.anonimo_session_id IS NOT NULL OR
                EXISTS (
                    SELECT 1 FROM public.perfiles 
                    WHERE perfiles.id = auth.uid() AND perfiles.role IN ('soporte', 'administrador')
                )
            )
        )
    );

CREATE POLICY "Permitir inserción de mensajes" ON public.mensajes_chat
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.salas_chat s 
            WHERE s.id = mensajes_chat.sala_id AND (
                s.cliente_id = auth.uid() OR 
                s.profesional_id = auth.uid() OR
                s.anonimo_session_id IS NOT NULL OR
                sender_type = 'soporte' OR
                EXISTS (
                    SELECT 1 FROM public.perfiles 
                    WHERE perfiles.id = auth.uid() AND perfiles.role IN ('soporte', 'administrador')
                )
            )
        )
    );

-- 6. Habilitar Tiempo Real por WebSockets en Supabase Realtime
-- Habilita Replica Identity FULL para que los clientes reciban los payloads completos
ALTER TABLE public.salas_chat REPLICA IDENTITY FULL;
ALTER TABLE public.mensajes_chat REPLICA IDENTITY FULL;

-- Agregar tablas a la publicación de tiempo real de Supabase de manera segura
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr 
        JOIN pg_publication p ON p.oid = pr.prpubid 
        JOIN pg_class c ON c.oid = pr.prrelid 
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'salas_chat'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.salas_chat;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr 
        JOIN pg_publication p ON p.oid = pr.prpubid 
        JOIN pg_class c ON c.oid = pr.prrelid 
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'mensajes_chat'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat;
    END IF;
END $$;
