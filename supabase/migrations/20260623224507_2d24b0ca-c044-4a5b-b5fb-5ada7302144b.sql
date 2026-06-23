-- Agregar nuevas categorías de inventario
ALTER TYPE public.inventario_categoria ADD VALUE IF NOT EXISTS 'equipo';
ALTER TYPE public.inventario_categoria ADD VALUE IF NOT EXISTS 'electrico';
ALTER TYPE public.inventario_categoria ADD VALUE IF NOT EXISTS 'quimico';