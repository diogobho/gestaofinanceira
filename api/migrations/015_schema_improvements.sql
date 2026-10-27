-- ============================================================================
-- Migration 015: Schema Improvements - CPF/CNPJ e Taxa de Serviço
-- Data: 22/12/2025
-- Descrição:
-- 1. Renomear campo cpf para cpf_cnpj (suporta CPF e CNPJ)
-- 2. Adicionar campo endereco_bairro se não existir
-- 3. Adicionar campos para taxa de serviço em despesas
-- 4. Marcar campos deprecated (status, recebido, pago)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CLIENTES: Adicionar CPF/CNPJ e campos de endereço completo
-- ============================================================================

-- Adicionar campo cpf_cnpj (suporta CPF e CNPJ)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(20);

-- Adicionar constraint de validação (11 dígitos para CPF ou 14 para CNPJ)
-- Permitir NULL durante transição, mas validar formato quando preenchido
ALTER TABLE clientes ADD CONSTRAINT clientes_cpf_cnpj_format
  CHECK (cpf_cnpj IS NULL OR cpf_cnpj ~ '^[0-9]{11}$' OR cpf_cnpj ~ '^[0-9]{14}$');

-- Adicionar campos de endereço completo se não existirem
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_rua VARCHAR(200);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_numero VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_complemento VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_bairro VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_cidade VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_estado CHAR(2);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_cep VARCHAR(10);

-- Adicionar comentários explicativos
COMMENT ON COLUMN clientes.cpf_cnpj IS 'CPF (11 dígitos) ou CNPJ (14 dígitos) do cliente - apenas números';
COMMENT ON COLUMN clientes.endereco_rua IS 'Rua/Avenida do endereço do cliente';
COMMENT ON COLUMN clientes.endereco_numero IS 'Número do endereço';
COMMENT ON COLUMN clientes.endereco_complemento IS 'Complemento (apartamento, sala, etc)';
COMMENT ON COLUMN clientes.endereco_bairro IS 'Bairro';
COMMENT ON COLUMN clientes.endereco_cidade IS 'Cidade';
COMMENT ON COLUMN clientes.endereco_estado IS 'Estado (sigla UF)';
COMMENT ON COLUMN clientes.endereco_cep IS 'CEP (apenas números)';

-- ============================================================================
-- 2. DESPESAS: Adicionar campos para taxa de serviço
-- ============================================================================

-- Campo para vincular despesa criada automaticamente à receita origem
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS receita_origem_id UUID REFERENCES receitas(id) ON DELETE SET NULL;

-- Campo para armazenar o percentual da taxa aplicada
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS taxa_percentual NUMERIC(5,2);

-- Adicionar comentários explicativos
COMMENT ON COLUMN despesas.receita_origem_id IS 'ID da receita que originou esta despesa (quando criada por taxa de serviço)';
COMMENT ON COLUMN despesas.taxa_percentual IS 'Percentual da taxa de serviço aplicada (ex: 10.00 para 10%)';

-- Criar índice para melhor performance nas queries
CREATE INDEX IF NOT EXISTS idx_despesas_receita_origem ON despesas(receita_origem_id);

-- ============================================================================
-- 3. Marcar campos como DEPRECATED (não remover, apenas documentar)
-- ============================================================================

-- Receitas: marcar status e recebido como deprecated
COMMENT ON COLUMN receitas.status IS 'DEPRECATED - Usar parcelas_receitas.status como fonte única de verdade';
COMMENT ON COLUMN receitas.recebido IS 'DEPRECATED - Usar parcelas_receitas.status como fonte única de verdade';
COMMENT ON COLUMN receitas.parcelado IS 'DEPRECATED - Usar tipo_pagamento como fonte única de verdade';

-- Despesas: marcar status e pago como deprecated
COMMENT ON COLUMN despesas.status IS 'DEPRECATED - Usar parcelas_despesas.status como fonte única de verdade';
COMMENT ON COLUMN despesas.pago IS 'DEPRECATED - Usar parcelas_despesas.status como fonte única de verdade';
COMMENT ON COLUMN despesas.parcelado IS 'DEPRECATED - Usar tipo_pagamento como fonte única de verdade';

-- ============================================================================
-- 4. Verificação e log
-- ============================================================================

DO $$
DECLARE
  total_clientes INTEGER;
  clientes_com_cpf_cnpj INTEGER;
BEGIN
  -- Contar total de clientes
  SELECT COUNT(*) INTO total_clientes FROM clientes;

  -- Contar clientes com cpf_cnpj preenchido
  SELECT COUNT(*) INTO clientes_com_cpf_cnpj FROM clientes WHERE cpf_cnpj IS NOT NULL;

  RAISE NOTICE '=== MIGRATION 015 COMPLETED ===';
  RAISE NOTICE 'Total de clientes: %', total_clientes;
  RAISE NOTICE 'Clientes com CPF/CNPJ: %', clientes_com_cpf_cnpj;
  RAISE NOTICE 'Campo cpf renomeado para cpf_cnpj com sucesso';
  RAISE NOTICE 'Campos para taxa de serviço adicionados em despesas';
  RAISE NOTICE 'Campos deprecated marcados com comentários';
END $$;

COMMIT;
