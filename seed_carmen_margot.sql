-- ══════════════════════════════════════════════════════════
-- CHIKILUKY.app - Script de Prueba: Carmen y Margot en Glam Nails
-- Ejecutar este script en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════

-- 1. Actualizar los perfiles de prueba en la tabla 'public.perfiles'
-- Carmen
UPDATE public.perfiles
SET full_name = 'Carmen', 
    role = 'experto',
    avatar_url = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'
WHERE id = 'a1000000-0000-0000-0000-000000000002';

-- Margot
UPDATE public.perfiles
SET full_name = 'Margot', 
    role = 'experto',
    avatar_url = 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150'
WHERE id = 'a1000000-0000-0000-0000-000000000003';

-- 2. Asegurar que estén en 'public.perfiles_profesionales' con pagos activos
INSERT INTO public.perfiles_profesionales (id, pago_movil_activo, pago_movil_banco, pago_movil_telefono, pago_movil_cedula, zelle_activo, zelle_correo, zelle_titular, efectivo_activo)
VALUES 
('a1000000-0000-0000-0000-000000000002', true, 'Banesco', '04121112233', 'V-11122233', true, 'carmen.pagos@nails.com', 'Carmen Manicura', true),
('a1000000-0000-0000-0000-000000000003', true, 'Banesco', '04124445566', 'V-44455566', true, 'margot.pagos@nails.com', 'Margot Pedicura', true)
ON CONFLICT (id) DO UPDATE 
SET pago_movil_activo = EXCLUDED.pago_movil_activo,
    pago_movil_banco = EXCLUDED.pago_movil_banco,
    pago_movil_telefono = EXCLUDED.pago_movil_telefono,
    pago_movil_cedula = EXCLUDED.pago_movil_cedula,
    zelle_activo = EXCLUDED.zelle_activo,
    zelle_correo = EXCLUDED.zelle_correo,
    zelle_titular = EXCLUDED.zelle_titular,
    efectivo_activo = EXCLUDED.efectivo_activo;

-- 3. Vincular a ambas como especialistas en el config de Glam Nails & Brow Altamira (b2000000-0000-0000-0000-000000000003)
UPDATE public.negocios
SET config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{specialists}',
    '[
        {
            "id": "a1000000-0000-0000-0000-000000000002",
            "full_name": "Carmen",
            "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
            "descripcion": "Especialista en manicura rusa, acrílicas y nail art premium con más de 6 años de experiencia."
        },
        {
            "id": "a1000000-0000-0000-0000-000000000003",
            "full_name": "Margot",
            "avatar_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150",
            "descripcion": "Experta en pedicura spa, reconstrucción de uñas y tratamientos hidratantes."
        }
    ]'::jsonb
)
WHERE id = 'b2000000-0000-0000-0000-000000000003';
