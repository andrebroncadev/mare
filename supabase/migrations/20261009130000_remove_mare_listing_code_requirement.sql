-- O campo de código interno não é mais usado pela aplicação.
-- Mantemos a coluna temporariamente para compatibilidade com versões antigas,
-- mas ela deixa de ser obrigatória e não pode bloquear cadastros por duplicidade.
ALTER TABLE public.mare_imoveis
  DROP CONSTRAINT IF EXISTS mare_imoveis_user_id_codigo_key;

ALTER TABLE public.mare_imoveis
  ALTER COLUMN codigo DROP NOT NULL;
