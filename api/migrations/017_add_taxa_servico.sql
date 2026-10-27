-- ============================================================================
-- Migration 017: Adicionar Taxa de Serviço
-- Data: 22/12/2025
-- Descrição: Adicionar campo taxa_servico_percentual na tabela receitas
-- ============================================================================

BEGIN;

-- Adicionar campo taxa_servico_percentual em receitas
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS taxa_servico_percentual NUMERIC(5,2);

-- Adicionar comentário explicativo
COMMENT ON COLUMN receitas.taxa_servico_percentual IS 'Percentual da taxa de serviço (0-100). Quando informado, o valor da taxa é descontado e gera uma despesa automática';

-- Adicionar constraint de validação (0 a 100)
ALTER TABLE receitas ADD CONSTRAINT receitas_taxa_servico_check
  CHECK (taxa_servico_percentual IS NULL OR (taxa_servico_percentual >= 0 AND taxa_servico_percentual <= 100));

-- Log
DO $$
BEGIN
  RAISE NOTICE '=== MIGRATION 017 COMPLETED ===';
  RAISE NOTICE 'Campo taxa_servico_percentual adicionado em receitas';
  RAISE NOTICE 'Constraint de validação (0-100) adicionada';
END $$;

COMMIT;
