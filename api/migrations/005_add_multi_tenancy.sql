-- Migration 005: Adicionar multi-tenancy com usuario_id
-- Data: 2025-11-02
-- Objetivo: Isolar dados por usuário (cada usuário vê apenas seus próprios dados)

-- Adicionar coluna usuario_id às tabelas principais
ALTER TABLE clientes ADD COLUMN usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE receitas ADD COLUMN usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE despesas ADD COLUMN usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE sessoes ADD COLUMN usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;

-- Criar índices para melhorar performance das queries filtradas por usuario_id
CREATE INDEX idx_clientes_usuario_id ON clientes(usuario_id);
CREATE INDEX idx_receitas_usuario_id ON receitas(usuario_id);
CREATE INDEX idx_despesas_usuario_id ON despesas(usuario_id);
CREATE INDEX idx_sessoes_usuario_id ON sessoes(usuario_id);

-- Migrar dados existentes para o usuário master (ADMIN)
-- Assumindo que o primeiro ADMIN criado é o dono dos dados existentes
DO $$
DECLARE
  master_user_id UUID;
BEGIN
  -- Buscar o primeiro usuário ADMIN
  SELECT id INTO master_user_id FROM usuarios WHERE funcao = 'ADMIN' ORDER BY created_at LIMIT 1;

  IF master_user_id IS NOT NULL THEN
    -- Atribuir todos os dados existentes ao usuário master
    UPDATE clientes SET usuario_id = master_user_id WHERE usuario_id IS NULL;
    UPDATE receitas SET usuario_id = master_user_id WHERE usuario_id IS NULL;
    UPDATE despesas SET usuario_id = master_user_id WHERE usuario_id IS NULL;
    UPDATE sessoes SET usuario_id = master_user_id WHERE usuario_id IS NULL;
  END IF;
END $$;

-- Tornar usuario_id obrigatório após migrar dados existentes
ALTER TABLE clientes ALTER COLUMN usuario_id SET NOT NULL;
ALTER TABLE receitas ALTER COLUMN usuario_id SET NOT NULL;
ALTER TABLE despesas ALTER COLUMN usuario_id SET NOT NULL;
ALTER TABLE sessoes ALTER COLUMN usuario_id SET NOT NULL;

-- Comentários explicativos
COMMENT ON COLUMN clientes.usuario_id IS 'Usuário proprietário do cliente (multi-tenancy)';
COMMENT ON COLUMN receitas.usuario_id IS 'Usuário proprietário da receita (multi-tenancy)';
COMMENT ON COLUMN despesas.usuario_id IS 'Usuário proprietário da despesa (multi-tenancy)';
COMMENT ON COLUMN sessoes.usuario_id IS 'Usuário proprietário da sessão (multi-tenancy)';
