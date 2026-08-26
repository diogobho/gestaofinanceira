-- =====================================================
-- Migration 011: Adicionar TODOS os Campos Faltantes
-- Data: 2025-11-07
-- Descrição: Sistema completo de parcelamento e status
-- =====================================================

BEGIN;

-- =====================================================
-- 1. ATUALIZAR TABELA: receitas
-- =====================================================

-- Adicionar novos campos se não existirem
DO $$
BEGIN
  -- tipo_pagamento: 'a_vista' ou 'parcelado'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receitas' AND column_name = 'tipo_pagamento'
  ) THEN
    ALTER TABLE receitas ADD COLUMN tipo_pagamento VARCHAR(20) DEFAULT 'a_vista';
  END IF;

  -- status: pendente, pago, cancelado, estornado, atrasado
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receitas' AND column_name = 'status'
  ) THEN
    ALTER TABLE receitas ADD COLUMN status VARCHAR(20) DEFAULT 'pendente';
  END IF;

  -- id_fatura: gerado automaticamente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receitas' AND column_name = 'id_fatura'
  ) THEN
    ALTER TABLE receitas ADD COLUMN id_fatura VARCHAR(50);
  END IF;

  -- id_contrato: gerado para parcelados
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receitas' AND column_name = 'id_contrato'
  ) THEN
    ALTER TABLE receitas ADD COLUMN id_contrato VARCHAR(50);
  END IF;

  -- numero_parcelas: quantidade de parcelas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receitas' AND column_name = 'numero_parcelas'
  ) THEN
    ALTER TABLE receitas ADD COLUMN numero_parcelas INTEGER;
  END IF;

  -- parcelado: backward compatibility
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receitas' AND column_name = 'parcelado'
  ) THEN
    ALTER TABLE receitas ADD COLUMN parcelado BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Adicionar constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receitas_tipo_pagamento_check'
  ) THEN
    ALTER TABLE receitas ADD CONSTRAINT receitas_tipo_pagamento_check
      CHECK (tipo_pagamento IN ('a_vista', 'parcelado'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receitas_status_check'
  ) THEN
    ALTER TABLE receitas ADD CONSTRAINT receitas_status_check
      CHECK (status IN ('pendente', 'pago', 'cancelado', 'estornado', 'atrasado'));
  END IF;
END $$;

-- =====================================================
-- 2. ATUALIZAR TABELA: despesas
-- =====================================================

-- Adicionar novos campos se não existirem
DO $$
BEGIN
  -- tipo_pagamento: 'a_vista' ou 'parcelado'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'despesas' AND column_name = 'tipo_pagamento'
  ) THEN
    ALTER TABLE despesas ADD COLUMN tipo_pagamento VARCHAR(20) DEFAULT 'a_vista';
  END IF;

  -- status: pendente, pago, cancelado, estornado, atrasado
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'despesas' AND column_name = 'status'
  ) THEN
    ALTER TABLE despesas ADD COLUMN status VARCHAR(20) DEFAULT 'pendente';
  END IF;

  -- id_fatura: gerado automaticamente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'despesas' AND column_name = 'id_fatura'
  ) THEN
    ALTER TABLE despesas ADD COLUMN id_fatura VARCHAR(50);
  END IF;

  -- numero_parcelas: quantidade de parcelas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'despesas' AND column_name = 'numero_parcelas'
  ) THEN
    ALTER TABLE despesas ADD COLUMN numero_parcelas INTEGER;
  END IF;

  -- parcelado: backward compatibility
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'despesas' AND column_name = 'parcelado'
  ) THEN
    ALTER TABLE despesas ADD COLUMN parcelado BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Adicionar constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'despesas_tipo_pagamento_check'
  ) THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_tipo_pagamento_check
      CHECK (tipo_pagamento IN ('a_vista', 'parcelado'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'despesas_status_check'
  ) THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_status_check
      CHECK (status IN ('pendente', 'pago', 'cancelado', 'estornado', 'atrasado'));
  END IF;
END $$;

-- =====================================================
-- 3. CRIAR SEQUÊNCIAS PARA IDs AUTOMÁTICOS
-- =====================================================

-- Sequência para id_fatura de receitas
CREATE SEQUENCE IF NOT EXISTS seq_fatura_receita START WITH 1000;

-- Sequência para id_fatura de despesas
CREATE SEQUENCE IF NOT EXISTS seq_fatura_despesa START WITH 2000;

-- Sequência para id_contrato de receitas
CREATE SEQUENCE IF NOT EXISTS seq_contrato_receita START WITH 100;

-- =====================================================
-- 4. CRIAR FUNÇÕES DE GERAÇÃO DE IDs
-- =====================================================

-- Função para gerar id_fatura de receita
CREATE OR REPLACE FUNCTION gerar_id_fatura_receita()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id_fatura IS NULL THEN
    NEW.id_fatura := 'REC-' ||
      TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' ||
      LPAD(NEXTVAL('seq_fatura_receita')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para gerar id_contrato de receita (apenas para parcelado)
CREATE OR REPLACE FUNCTION gerar_id_contrato_receita()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_pagamento = 'parcelado' AND NEW.id_contrato IS NULL THEN
    NEW.id_contrato := 'CONT-' ||
      TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' ||
      LPAD(NEXTVAL('seq_contrato_receita')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para gerar id_fatura de despesa
CREATE OR REPLACE FUNCTION gerar_id_fatura_despesa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id_fatura IS NULL THEN
    NEW.id_fatura := 'DESP-' ||
      TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' ||
      LPAD(NEXTVAL('seq_fatura_despesa')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. CRIAR TRIGGERS
-- =====================================================

-- Trigger para id_fatura de receita
DROP TRIGGER IF EXISTS trigger_gerar_id_fatura_receita ON receitas;
CREATE TRIGGER trigger_gerar_id_fatura_receita
  BEFORE INSERT ON receitas
  FOR EACH ROW
  EXECUTE FUNCTION gerar_id_fatura_receita();

-- Trigger para id_contrato de receita
DROP TRIGGER IF EXISTS trigger_gerar_id_contrato_receita ON receitas;
CREATE TRIGGER trigger_gerar_id_contrato_receita
  BEFORE INSERT ON receitas
  FOR EACH ROW
  EXECUTE FUNCTION gerar_id_contrato_receita();

-- Trigger para id_fatura de despesa
DROP TRIGGER IF EXISTS trigger_gerar_id_fatura_despesa ON despesas;
CREATE TRIGGER trigger_gerar_id_fatura_despesa
  BEFORE INSERT ON despesas
  FOR EACH ROW
  EXECUTE FUNCTION gerar_id_fatura_despesa();

-- =====================================================
-- 6. MIGRAR DADOS EXISTENTES
-- =====================================================

-- Sincronizar tipo_pagamento com parcelado (receitas)
UPDATE receitas
SET tipo_pagamento = CASE
  WHEN parcelado = true THEN 'parcelado'
  ELSE 'a_vista'
END
WHERE tipo_pagamento IS NULL OR tipo_pagamento = 'a_vista';

-- Sincronizar status com recebido (receitas)
UPDATE receitas
SET status = CASE
  WHEN recebido = true THEN 'pago'
  ELSE 'pendente'
END
WHERE status IS NULL OR status = 'pendente';

-- Sincronizar tipo_pagamento com parcelado (despesas)
UPDATE despesas
SET tipo_pagamento = CASE
  WHEN parcelado = true THEN 'parcelado'
  ELSE 'a_vista'
END
WHERE tipo_pagamento IS NULL OR tipo_pagamento = 'a_vista';

-- Sincronizar status com pago (despesas)
UPDATE despesas
SET status = CASE
  WHEN pago = true THEN 'pago'
  ELSE 'pendente'
END
WHERE status IS NULL OR status = 'pendente';

-- Gerar id_fatura para receitas existentes que não têm
UPDATE receitas
SET id_fatura = 'REC-' ||
  TO_CHAR(data, 'YYYYMM') || '-' ||
  LPAD(NEXTVAL('seq_fatura_receita')::TEXT, 6, '0')
WHERE id_fatura IS NULL;

-- Gerar id_fatura para despesas existentes que não têm
UPDATE despesas
SET id_fatura = 'DESP-' ||
  TO_CHAR(data, 'YYYYMM') || '-' ||
  LPAD(NEXTVAL('seq_fatura_despesa')::TEXT, 6, '0')
WHERE id_fatura IS NULL;

-- =====================================================
-- 7. CRIAR ÍNDICES PARA PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_receitas_tipo_pagamento ON receitas(tipo_pagamento);
CREATE INDEX IF NOT EXISTS idx_receitas_status ON receitas(status);
CREATE INDEX IF NOT EXISTS idx_receitas_id_fatura ON receitas(id_fatura);
CREATE INDEX IF NOT EXISTS idx_receitas_id_contrato ON receitas(id_contrato);

CREATE INDEX IF NOT EXISTS idx_despesas_tipo_pagamento ON despesas(tipo_pagamento);
CREATE INDEX IF NOT EXISTS idx_despesas_status ON despesas(status);
CREATE INDEX IF NOT EXISTS idx_despesas_id_fatura ON despesas(id_fatura);

COMMIT;

-- =====================================================
-- FIM DA MIGRATION 011
-- =====================================================
