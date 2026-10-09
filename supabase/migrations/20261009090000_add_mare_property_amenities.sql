alter table public.mare_imoveis add column if not exists comodidades jsonb not null default '[]'::jsonb;
