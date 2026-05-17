-- ══════════════════════════════════════════════════════════
-- CHIKILUKY.app - Migración: Agregar Categoría a Servicios
-- Ejecutar este comando en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════

ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS categoria TEXT;
