-- Migration 023: Adicionar campo cpf_cnpj na tabela leads
-- Data: 2026-02-10

ALTER TABLE leads ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(20);

-- Indice parcial para busca rapida
CREATE INDEX IF NOT EXISTS idx_leads_cpf_cnpj ON leads(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
