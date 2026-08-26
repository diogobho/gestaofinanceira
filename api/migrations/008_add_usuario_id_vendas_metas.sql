-- Migration 008: Adicionar usuario_id em vendas e metas_mensais
-- Data: 2025-11-03
-- Descrição: Garantir isolamento completo de dados por usuário em todas as tabelas relevantes

-- ============================================
-- 1. ADICIONAR usuario_id EM VENDAS
-- ============================================

-- Adicionar coluna usuario_id em vendas (nullable inicialmente)
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS usuario_id INTEGER;

-- Adicionar foreign key
ALTER TABLE vendas ADD CONSTRAINT vendas_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_vendas_usuario_id ON vendas(usuario_id);

-- Atualizar vendas existentes (associar ao primeiro admin da empresa ou super_admin)
UPDATE vendas v
SET usuario_id = (
  SELECT u.id
  FROM usuarios u
  WHERE u.empresa_id = v.empresa_id
    AND u.nivel IN ('super_admin', 'admin_empresa')
    AND u.ativo = true
  ORDER BY
    CASE
      WHEN u.nivel = 'super_admin' THEN 1
      WHEN u.nivel = 'admin_empresa' THEN 2
      ELSE 3
    END,
    u.id
  LIMIT 1
)
WHERE usuario_id IS NULL;

-- Se ainda houver vendas sem usuario_id (empresa sem admin), associar ao super_admin global
UPDATE vendas
SET usuario_id = (
  SELECT id FROM usuarios WHERE nivel = 'super_admin' AND ativo = true LIMIT 1
)
WHERE usuario_id IS NULL;

-- ============================================
-- 2. ADICIONAR usuario_id EM METAS_MENSAIS
-- ============================================

-- Adicionar coluna usuario_id em metas_mensais (nullable - NULL = meta da empresa)
ALTER TABLE metas_mensais ADD COLUMN IF NOT EXISTS usuario_id INTEGER;

-- Adicionar foreign key
ALTER TABLE metas_mensais ADD CONSTRAINT metas_mensais_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_metas_mensais_usuario_id ON metas_mensais(usuario_id);

-- Comentários
COMMENT ON COLUMN vendas.usuario_id IS 'Usuário responsável pela venda (vendedor). NULL = venda sem responsável definido.';
COMMENT ON COLUMN metas_mensais.usuario_id IS 'Usuário dono da meta. NULL = meta é da empresa (definida pelo admin).';

-- ============================================
-- 3. VERIFICAÇÃO
-- ============================================

-- Verificar vendas com usuario_id
DO $$
DECLARE
  total_vendas INTEGER;
  vendas_com_usuario INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_vendas FROM vendas;
  SELECT COUNT(*) INTO vendas_com_usuario FROM vendas WHERE usuario_id IS NOT NULL;

  RAISE NOTICE 'Total de vendas: %', total_vendas;
  RAISE NOTICE 'Vendas com usuario_id: %', vendas_com_usuario;
  RAISE NOTICE 'Vendas sem usuario_id: %', (total_vendas - vendas_com_usuario);
END $$;

-- Verificar metas
DO $$
DECLARE
  total_metas INTEGER;
  metas_pessoais INTEGER;
  metas_empresa INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_metas FROM metas_mensais;
  SELECT COUNT(*) INTO metas_pessoais FROM metas_mensais WHERE usuario_id IS NOT NULL;
  SELECT COUNT(*) INTO metas_empresa FROM metas_mensais WHERE usuario_id IS NULL;

  RAISE NOTICE 'Total de metas: %', total_metas;
  RAISE NOTICE 'Metas pessoais: %', metas_pessoais;
  RAISE NOTICE 'Metas da empresa: %', metas_empresa;
END $$;

-- ============================================
-- ROLLBACK (caso necessário)
-- ============================================

-- Para reverter esta migration:
-- DROP INDEX IF EXISTS idx_vendas_usuario_id;
-- DROP INDEX IF EXISTS idx_metas_mensais_usuario_id;
-- ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_usuario_id_fkey;
-- ALTER TABLE metas_mensais DROP CONSTRAINT IF EXISTS metas_mensais_usuario_id_fkey;
-- ALTER TABLE vendas DROP COLUMN IF EXISTS usuario_id;
-- ALTER TABLE metas_mensais DROP COLUMN IF EXISTS usuario_id;
