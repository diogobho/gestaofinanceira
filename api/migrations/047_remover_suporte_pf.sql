-- Migration 047: Remover suporte a contas Pessoa Física (PF)
-- Data: 2026-06-02
-- O sistema passa a ser exclusivamente PJ (gestão empresarial).
-- Reverte a migration 029: remove a coluna tipo_conta e a função seed_categorias_pf.
-- Pré-requisito: nenhuma empresa com tipo_conta='PF' deve existir (já removidas).

-- ============================================================================
-- 1. GARANTIR QUE NÃO HÁ CONTAS PF REMANESCENTES
-- ============================================================================

DO $$
DECLARE
  qtd INTEGER;
BEGIN
  SELECT count(*) INTO qtd FROM empresas WHERE tipo_conta = 'PF';
  IF qtd > 0 THEN
    RAISE EXCEPTION 'Ainda existem % conta(s) PF. Aborte e trate-as antes de rodar esta migration.', qtd;
  END IF;
END $$;

-- ============================================================================
-- 2. REMOVER FUNÇÃO seed_categorias_pf
-- ============================================================================

DROP FUNCTION IF EXISTS seed_categorias_pf(INTEGER);

-- ============================================================================
-- 3. REMOVER COLUNA tipo_conta (e seu CHECK constraint, dropado em cascata)
-- ============================================================================

ALTER TABLE empresas DROP COLUMN IF EXISTS tipo_conta;

-- ============================================================================
-- 4. FIM DA MIGRATION
-- ============================================================================
