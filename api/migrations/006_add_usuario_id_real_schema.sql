-- Migration 006: Adicionar usuario_id para multi-tenancy (schema real)
-- Data: 2025-11-02
-- Objetivo: Isolar dados por usuário usando o schema INTEGER existente

-- Passo 1: Adicionar coluna usuario_id às tabelas principais
-- Nota: Usando INTEGER pois a tabela usuarios usa id INTEGER, não UUID

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE;

-- Passo 2: Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_clientes_usuario_id_real ON clientes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_receitas_usuario_id_real ON receitas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_despesas_usuario_id_real ON despesas(usuario_id);

-- Passo 3: Migrar dados existentes para um usuário super_admin
-- Todos os dados existentes serão atribuídos ao primeiro super_admin
DO $$
DECLARE
  master_user_id INTEGER;
BEGIN
  -- Buscar o primeiro usuário super_admin
  SELECT id INTO master_user_id FROM usuarios WHERE nivel = 'super_admin' ORDER BY created_at LIMIT 1;

  IF master_user_id IS NOT NULL THEN
    -- Atribuir todos os dados existentes (NULL) ao usuário master
    UPDATE clientes SET usuario_id = master_user_id WHERE usuario_id IS NULL;
    UPDATE receitas SET usuario_id = master_user_id WHERE usuario_id IS NULL;
    UPDATE despesas SET usuario_id = master_user_id WHERE usuario_id IS NULL;

    RAISE NOTICE 'Dados migrados para usuario_id = %', master_user_id;
  ELSE
    RAISE WARNING 'Nenhum usuário super_admin encontrado. Dados não foram migrados.';
  END IF;
END $$;

-- Passo 4: Tornar usuario_id obrigatório (NOT NULL)
-- Só depois de migrar os dados existentes
ALTER TABLE clientes ALTER COLUMN usuario_id SET NOT NULL;
ALTER TABLE receitas ALTER COLUMN usuario_id SET NOT NULL;
ALTER TABLE despesas ALTER COLUMN usuario_id SET NOT NULL;

-- Passo 5: Comentários para documentação
COMMENT ON COLUMN clientes.usuario_id IS 'ID do usuário proprietário (multi-tenancy)';
COMMENT ON COLUMN receitas.usuario_id IS 'ID do usuário proprietário (multi-tenancy)';
COMMENT ON COLUMN despesas.usuario_id IS 'ID do usuário proprietário (multi-tenancy)';

-- Sucesso
DO $$ BEGIN RAISE NOTICE 'Migration 006 aplicada com sucesso!'; END $$;
