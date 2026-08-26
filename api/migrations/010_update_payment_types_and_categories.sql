-- Migration 010: Atualizar tipos de pagamento e adicionar categorias dinâmicas
-- Data: 2025-11-03

-- ============================================================================
-- 1. CRIAR TABELA DE CATEGORIAS DINÂMICAS
-- ============================================================================

-- Categorias para Receitas (fontes)
CREATE TABLE IF NOT EXISTS categorias_receitas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(nome, usuario_id) -- Cada usuário pode ter uma categoria com mesmo nome
);

CREATE INDEX idx_categorias_receitas_usuario_id ON categorias_receitas(usuario_id);
CREATE INDEX idx_categorias_receitas_ativo ON categorias_receitas(ativo);

-- Categorias para Despesas
CREATE TABLE IF NOT EXISTS categorias_despesas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(nome, usuario_id)
);

CREATE INDEX idx_categorias_despesas_usuario_id ON categorias_despesas(usuario_id);
CREATE INDEX idx_categorias_despesas_ativo ON categorias_despesas(ativo);

-- Triggers para updated_at
CREATE TRIGGER update_categorias_receitas_updated_at
  BEFORE UPDATE ON categorias_receitas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categorias_despesas_updated_at
  BEFORE UPDATE ON categorias_despesas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. ATUALIZAR TABELA DE RECEITAS
-- ============================================================================

-- Adicionar campo tipo_pagamento (substitui lógica de parcelado)
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS tipo_pagamento VARCHAR(20) DEFAULT 'a_vista';
ALTER TABLE receitas ADD CONSTRAINT receitas_tipo_pagamento_check
  CHECK (tipo_pagamento IN ('a_vista', 'parcelado'));

-- Adicionar campo status com opções completas
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente';
ALTER TABLE receitas ADD CONSTRAINT receitas_status_check
  CHECK (status IN ('pendente', 'pago', 'cancelado', 'estornado', 'atrasado'));

-- Adicionar campos de auditoria de fatura/contrato (gerados automaticamente)
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS id_fatura VARCHAR(50);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS id_contrato VARCHAR(50);

-- Atualizar dados existentes: mapear parcelado para tipo_pagamento
UPDATE receitas SET tipo_pagamento = 'parcelado' WHERE parcelado = true;
UPDATE receitas SET tipo_pagamento = 'a_vista' WHERE parcelado = false OR parcelado IS NULL;

-- Atualizar status baseado no campo recebido
UPDATE receitas SET status = 'pago' WHERE recebido = true;
UPDATE receitas SET status = 'pendente' WHERE recebido = false OR recebido IS NULL;

-- ============================================================================
-- 3. ATUALIZAR TABELA DE DESPESAS
-- ============================================================================

-- Adicionar campo tipo_pagamento
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS tipo_pagamento VARCHAR(20) DEFAULT 'a_vista';
ALTER TABLE despesas ADD CONSTRAINT despesas_tipo_pagamento_check
  CHECK (tipo_pagamento IN ('a_vista', 'parcelado'));

-- Adicionar campo status com opções completas
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente';
ALTER TABLE despesas ADD CONSTRAINT despesas_status_check
  CHECK (status IN ('pendente', 'pago', 'cancelado', 'estornado', 'atrasado'));

-- Adicionar campo id_fatura (gerado automaticamente)
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS id_fatura VARCHAR(50);

-- Atualizar dados existentes
UPDATE despesas SET tipo_pagamento = 'parcelado' WHERE parcelado = true;
UPDATE despesas SET tipo_pagamento = 'a_vista' WHERE parcelado = false OR parcelado IS NULL;

-- Atualizar status baseado no campo pago
UPDATE despesas SET status = 'pago' WHERE pago = true;
UPDATE despesas SET status = 'pendente' WHERE pago = false OR pago IS NULL;

-- ============================================================================
-- 4. POPULAR CATEGORIAS PADRÃO
-- ============================================================================

-- Função para inserir categorias padrão para cada usuário
DO $$
DECLARE
  usuario_record RECORD;
BEGIN
  FOR usuario_record IN SELECT id FROM usuarios LOOP
    -- Categorias de Receitas
    INSERT INTO categorias_receitas (nome, usuario_id) VALUES
      ('Consultoria', usuario_record.id),
      ('Mentoria', usuario_record.id),
      ('Venda de Produto', usuario_record.id),
      ('Prestação de Serviço', usuario_record.id),
      ('Outros', usuario_record.id)
    ON CONFLICT (nome, usuario_id) DO NOTHING;

    -- Categorias de Despesas
    INSERT INTO categorias_despesas (nome, usuario_id) VALUES
      ('Marketing', usuario_record.id),
      ('Software', usuario_record.id),
      ('Infraestrutura', usuario_record.id),
      ('Salários', usuario_record.id),
      ('Impostos', usuario_record.id),
      ('Fornecedores', usuario_record.id),
      ('Outros', usuario_record.id)
    ON CONFLICT (nome, usuario_id) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================================
-- 5. FUNÇÃO PARA GERAR ID_FATURA AUTOMÁTICO
-- ============================================================================

-- Sequência para faturas de receitas
CREATE SEQUENCE IF NOT EXISTS seq_fatura_receita START 1000;

-- Sequência para faturas de despesas
CREATE SEQUENCE IF NOT EXISTS seq_fatura_despesa START 2000;

-- Função para gerar ID de fatura para receitas
CREATE OR REPLACE FUNCTION gerar_id_fatura_receita()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id_fatura IS NULL THEN
    NEW.id_fatura := 'REC-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(nextval('seq_fatura_receita')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para gerar ID de fatura para despesas
CREATE OR REPLACE FUNCTION gerar_id_fatura_despesa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id_fatura IS NULL THEN
    NEW.id_fatura := 'DESP-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(nextval('seq_fatura_despesa')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para gerar IDs automaticamente
DROP TRIGGER IF EXISTS trigger_gerar_id_fatura_receita ON receitas;
CREATE TRIGGER trigger_gerar_id_fatura_receita
  BEFORE INSERT ON receitas
  FOR EACH ROW
  EXECUTE FUNCTION gerar_id_fatura_receita();

DROP TRIGGER IF EXISTS trigger_gerar_id_fatura_despesa ON despesas;
CREATE TRIGGER trigger_gerar_id_fatura_despesa
  BEFORE INSERT ON despesas
  FOR EACH ROW
  EXECUTE FUNCTION gerar_id_fatura_despesa();

-- ============================================================================
-- 6. FUNÇÃO PARA GERAR ID_CONTRATO AUTOMÁTICO (RECEITAS)
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS seq_contrato_receita START 100;

CREATE OR REPLACE FUNCTION gerar_id_contrato_receita()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id_contrato IS NULL AND NEW.tipo_pagamento = 'parcelado' THEN
    NEW.id_contrato := 'CONT-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(nextval('seq_contrato_receita')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_gerar_id_contrato_receita ON receitas;
CREATE TRIGGER trigger_gerar_id_contrato_receita
  BEFORE INSERT ON receitas
  FOR EACH ROW
  EXECUTE FUNCTION gerar_id_contrato_receita();

-- ============================================================================
-- 7. ATUALIZAR REGISTROS EXISTENTES COM IDs AUTOMÁTICOS
-- ============================================================================

-- Gerar id_fatura para receitas existentes
UPDATE receitas SET id_fatura = 'REC-' || TO_CHAR(created_at, 'YYYYMM') || '-' || LPAD((ROW_NUMBER() OVER (ORDER BY created_at))::TEXT, 6, '0')
WHERE id_fatura IS NULL;

-- Gerar id_fatura para despesas existentes
UPDATE despesas SET id_fatura = 'DESP-' || TO_CHAR(created_at, 'YYYYMM') || '-' || LPAD((ROW_NUMBER() OVER (ORDER BY created_at))::TEXT, 6, '0')
WHERE id_fatura IS NULL;

-- Gerar id_contrato para receitas parceladas existentes
UPDATE receitas SET id_contrato = 'CONT-' || TO_CHAR(created_at, 'YYYYMM') || '-' || LPAD((ROW_NUMBER() OVER (ORDER BY created_at))::TEXT, 6, '0')
WHERE id_contrato IS NULL AND tipo_pagamento = 'parcelado';

-- ============================================================================
-- 8. COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON TABLE categorias_receitas IS 'Categorias dinâmicas de receitas criadas pelos usuários';
COMMENT ON TABLE categorias_despesas IS 'Categorias dinâmicas de despesas criadas pelos usuários';
COMMENT ON COLUMN receitas.tipo_pagamento IS 'Tipo de pagamento: a_vista ou parcelado';
COMMENT ON COLUMN receitas.status IS 'Status da receita: pendente, pago, cancelado, estornado, atrasado';
COMMENT ON COLUMN receitas.id_fatura IS 'ID único da fatura gerado automaticamente (formato: REC-YYYYMM-NNNNNN)';
COMMENT ON COLUMN receitas.id_contrato IS 'ID único do contrato para receitas parceladas (formato: CONT-YYYYMM-NNNNNN)';
COMMENT ON COLUMN despesas.tipo_pagamento IS 'Tipo de pagamento: a_vista ou parcelado';
COMMENT ON COLUMN despesas.status IS 'Status da despesa: pendente, pago, cancelado, estornado, atrasado';
COMMENT ON COLUMN despesas.id_fatura IS 'ID único da fatura gerado automaticamente (formato: DESP-YYYYMM-NNNNNN)';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
