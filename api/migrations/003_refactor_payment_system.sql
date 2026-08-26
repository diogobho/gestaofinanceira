-- Migration 003: Refatoração do Sistema de Pagamentos
-- Data: 2025-11-02
-- Descrição: Adiciona tipo de pagamento (à vista/parcelado), novos status, categorias personalizadas e sistema de parcelas

-- =====================================================
-- 1. EXPANDIR ENUMs DE STATUS
-- =====================================================

-- Adicionar novos status para receitas
DO $$ BEGIN
  ALTER TYPE receita_status ADD VALUE IF NOT EXISTS 'PAGO';
  ALTER TYPE receita_status ADD VALUE IF NOT EXISTS 'CANCELADO';
  ALTER TYPE receita_status ADD VALUE IF NOT EXISTS 'ESTORNADO';
  ALTER TYPE receita_status ADD VALUE IF NOT EXISTS 'ATRASADO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Adicionar novos status para despesas
DO $$ BEGIN
  ALTER TYPE despesa_status ADD VALUE IF NOT EXISTS 'CANCELADO';
  ALTER TYPE despesa_status ADD VALUE IF NOT EXISTS 'ESTORNADO';
  ALTER TYPE despesa_status ADD VALUE IF NOT EXISTS 'ATRASADO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 2. CRIAR ENUM PARA TIPO DE PAGAMENTO
-- =====================================================

DO $$ BEGIN
  CREATE TYPE tipo_pagamento AS ENUM ('A_VISTA', 'PARCELADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 3. CRIAR ENUM PARA STATUS DE PARCELA
-- =====================================================

DO $$ BEGIN
  CREATE TYPE parcela_status AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 4. CRIAR TABELAS DE CATEGORIAS PERSONALIZADAS
-- =====================================================

CREATE TABLE IF NOT EXISTS categorias_receita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categorias_despesa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers para atualização automática
CREATE TRIGGER update_categorias_receita_updated_at
  BEFORE UPDATE ON categorias_receita
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categorias_despesa_updated_at
  BEFORE UPDATE ON categorias_despesa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. POPULAR CATEGORIAS COM VALORES PADRÃO
-- =====================================================

INSERT INTO categorias_receita (nome, descricao) VALUES
  ('CONSULTORIA', 'Serviços de consultoria'),
  ('MENTORIA', 'Sessões de mentoria'),
  ('COACHING', 'Sessões de coaching'),
  ('OUTROS', 'Outras receitas')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO categorias_despesa (nome, descricao) VALUES
  ('MARKETING', 'Despesas com marketing e publicidade'),
  ('SOFTWARE', 'Licenças e ferramentas de software'),
  ('ESCRITORIO', 'Despesas de escritório e infraestrutura'),
  ('OUTROS', 'Outras despesas')
ON CONFLICT (nome) DO NOTHING;

-- =====================================================
-- 6. CRIAR TABELA DE PARCELAS
-- =====================================================

CREATE TABLE IF NOT EXISTS parcelas_receita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL REFERENCES receitas(id) ON DELETE CASCADE,
  numero_parcela INT NOT NULL,
  total_parcelas INT NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status parcela_status NOT NULL DEFAULT 'PENDENTE',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parcelas_receita_numero_check CHECK (numero_parcela > 0 AND numero_parcela <= total_parcelas)
);

CREATE TABLE IF NOT EXISTS parcelas_despesa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despesa_id UUID NOT NULL REFERENCES despesas(id) ON DELETE CASCADE,
  numero_parcela INT NOT NULL,
  total_parcelas INT NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status parcela_status NOT NULL DEFAULT 'PENDENTE',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parcelas_despesa_numero_check CHECK (numero_parcela > 0 AND numero_parcela <= total_parcelas)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_parcelas_receita_receita_id ON parcelas_receita(receita_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_receita_status ON parcelas_receita(status);
CREATE INDEX IF NOT EXISTS idx_parcelas_receita_vencimento ON parcelas_receita(data_vencimento);

CREATE INDEX IF NOT EXISTS idx_parcelas_despesa_despesa_id ON parcelas_despesa(despesa_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_despesa_status ON parcelas_despesa(status);
CREATE INDEX IF NOT EXISTS idx_parcelas_despesa_vencimento ON parcelas_despesa(data_vencimento);

-- Triggers para atualização automática
CREATE TRIGGER update_parcelas_receita_updated_at
  BEFORE UPDATE ON parcelas_receita
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parcelas_despesa_updated_at
  BEFORE UPDATE ON parcelas_despesa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. ADICIONAR COLUNAS NAS TABELAS EXISTENTES
-- =====================================================

-- Adicionar coluna tipo_pagamento em receitas
DO $$ BEGIN
  ALTER TABLE receitas ADD COLUMN IF NOT EXISTS tipo_pagamento tipo_pagamento DEFAULT 'A_VISTA';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Adicionar coluna tipo_pagamento em despesas
DO $$ BEGIN
  ALTER TABLE despesas ADD COLUMN IF NOT EXISTS tipo_pagamento tipo_pagamento DEFAULT 'A_VISTA';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Adicionar coluna categoria_custom_id em receitas (para categorias personalizadas)
DO $$ BEGIN
  ALTER TABLE receitas ADD COLUMN IF NOT EXISTS categoria_custom_id UUID REFERENCES categorias_receita(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Adicionar coluna categoria_custom_id em despesas (para categorias personalizadas)
DO $$ BEGIN
  ALTER TABLE despesas ADD COLUMN IF NOT EXISTS categoria_custom_id UUID REFERENCES categorias_despesa(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================
-- 8. FUNÇÃO PARA ATUALIZAR STATUS BASEADO EM PARCELAS
-- =====================================================

-- Função para calcular status de receita baseado em parcelas
CREATE OR REPLACE FUNCTION atualizar_status_receita_por_parcelas()
RETURNS TRIGGER AS $$
DECLARE
  total_parcelas INT;
  parcelas_pagas INT;
  parcelas_atrasadas INT;
  receita_record RECORD;
BEGIN
  -- Buscar informações da receita
  SELECT * INTO receita_record FROM receitas WHERE id = NEW.receita_id;

  -- Contar parcelas
  SELECT COUNT(*) INTO total_parcelas FROM parcelas_receita WHERE receita_id = NEW.receita_id;
  SELECT COUNT(*) INTO parcelas_pagas FROM parcelas_receita WHERE receita_id = NEW.receita_id AND status = 'PAGO';
  SELECT COUNT(*) INTO parcelas_atrasadas FROM parcelas_receita WHERE receita_id = NEW.receita_id AND status = 'ATRASADO';

  -- Atualizar status da receita
  IF parcelas_pagas = total_parcelas THEN
    UPDATE receitas SET status = 'PAGO' WHERE id = NEW.receita_id;
  ELSIF parcelas_atrasadas > 0 THEN
    UPDATE receitas SET status = 'ATRASADO' WHERE id = NEW.receita_id;
  ELSE
    UPDATE receitas SET status = 'PENDENTE' WHERE id = NEW.receita_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para calcular status de despesa baseado em parcelas
CREATE OR REPLACE FUNCTION atualizar_status_despesa_por_parcelas()
RETURNS TRIGGER AS $$
DECLARE
  total_parcelas INT;
  parcelas_pagas INT;
  parcelas_atrasadas INT;
  despesa_record RECORD;
BEGIN
  -- Buscar informações da despesa
  SELECT * INTO despesa_record FROM despesas WHERE id = NEW.despesa_id;

  -- Contar parcelas
  SELECT COUNT(*) INTO total_parcelas FROM parcelas_despesa WHERE despesa_id = NEW.despesa_id;
  SELECT COUNT(*) INTO parcelas_pagas FROM parcelas_despesa WHERE despesa_id = NEW.despesa_id AND status = 'PAGO';
  SELECT COUNT(*) INTO parcelas_atrasadas FROM parcelas_despesa WHERE despesa_id = NEW.despesa_id AND status = 'ATRASADO';

  -- Atualizar status da despesa
  IF parcelas_pagas = total_parcelas THEN
    UPDATE despesas SET status = 'PAGO' WHERE id = NEW.despesa_id;
  ELSIF parcelas_atrasadas > 0 THEN
    UPDATE despesas SET status = 'ATRASADO' WHERE id = NEW.despesa_id;
  ELSE
    UPDATE despesas SET status = 'PENDENTE' WHERE id = NEW.despesa_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para atualizar status automaticamente
DROP TRIGGER IF EXISTS trigger_atualizar_status_receita ON parcelas_receita;
CREATE TRIGGER trigger_atualizar_status_receita
  AFTER INSERT OR UPDATE ON parcelas_receita
  FOR EACH ROW EXECUTE FUNCTION atualizar_status_receita_por_parcelas();

DROP TRIGGER IF EXISTS trigger_atualizar_status_despesa ON parcelas_despesa;
CREATE TRIGGER trigger_atualizar_status_despesa
  AFTER INSERT OR UPDATE ON parcelas_despesa
  FOR EACH ROW EXECUTE FUNCTION atualizar_status_despesa_por_parcelas();

-- =====================================================
-- 9. ATUALIZAR DADOS EXISTENTES
-- =====================================================

-- Atualizar receitas existentes parceladas para usar o novo sistema
UPDATE receitas
SET tipo_pagamento = 'PARCELADO'
WHERE parcelado = true;

-- Atualizar receitas existentes à vista
UPDATE receitas
SET tipo_pagamento = 'A_VISTA'
WHERE parcelado = false OR parcelado IS NULL;

-- Atualizar despesas existentes parceladas para usar o novo sistema
UPDATE despesas
SET tipo_pagamento = 'PARCELADO'
WHERE parcelado = true;

-- Atualizar despesas existentes à vista
UPDATE despesas
SET tipo_pagamento = 'A_VISTA'
WHERE parcelado = false OR parcelado IS NULL;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
