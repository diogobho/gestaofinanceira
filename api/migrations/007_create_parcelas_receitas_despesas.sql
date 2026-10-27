-- Migration 007: Criar tabelas parcelas_receitas e parcelas_despesas
-- Data: 2025-11-03
-- Descrição: Tabelas para controle de parcelas de receitas e despesas

-- Tabela: parcelas_receitas
CREATE TABLE IF NOT EXISTS parcelas_receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL REFERENCES receitas(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status VARCHAR(20) DEFAULT 'PENDENTE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para parcelas_receitas
CREATE INDEX IF NOT EXISTS idx_parcelas_receitas_receita_id ON parcelas_receitas(receita_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_receitas_status ON parcelas_receitas(status);
CREATE INDEX IF NOT EXISTS idx_parcelas_receitas_vencimento ON parcelas_receitas(data_vencimento);

-- Trigger para atualizar updated_at em parcelas_receitas
CREATE OR REPLACE FUNCTION update_parcelas_receitas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_parcelas_receitas_updated_at
BEFORE UPDATE ON parcelas_receitas
FOR EACH ROW
EXECUTE FUNCTION update_parcelas_receitas_updated_at();

-- Tabela: parcelas_despesas
CREATE TABLE IF NOT EXISTS parcelas_despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despesa_id UUID NOT NULL REFERENCES despesas(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status VARCHAR(20) DEFAULT 'PENDENTE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para parcelas_despesas
CREATE INDEX IF NOT EXISTS idx_parcelas_despesas_despesa_id ON parcelas_despesas(despesa_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_despesas_status ON parcelas_despesas(status);
CREATE INDEX IF NOT EXISTS idx_parcelas_despesas_vencimento ON parcelas_despesas(data_vencimento);

-- Trigger para atualizar updated_at em parcelas_despesas
CREATE OR REPLACE FUNCTION update_parcelas_despesas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_parcelas_despesas_updated_at
BEFORE UPDATE ON parcelas_despesas
FOR EACH ROW
EXECUTE FUNCTION update_parcelas_despesas_updated_at();

-- Comentários
COMMENT ON TABLE parcelas_receitas IS 'Parcelas de receitas parceladas';
COMMENT ON TABLE parcelas_despesas IS 'Parcelas de despesas parceladas';

COMMENT ON COLUMN parcelas_receitas.status IS 'Status: PENDENTE, PAGO, ATRASADO, CANCELADO';
COMMENT ON COLUMN parcelas_despesas.status IS 'Status: PENDENTE, PAGO, ATRASADO, CANCELADO';
