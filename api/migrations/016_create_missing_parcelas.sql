-- ============================================================================
-- Migration 016: Criar parcelas para registros à vista sem parcelas
-- Data: 22/12/2025
-- Descrição:
-- Garantir que TODAS as receitas e despesas tenham pelo menos 1 parcela
-- Isso assegura que o dashboard possa usar parcelas.status como fonte única
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CRIAR PARCELAS PARA RECEITAS À VISTA SEM PARCELAS
-- ============================================================================

INSERT INTO parcelas_receitas (
  receita_id,
  numero_parcela,
  total_parcelas,
  valor,
  data_vencimento,
  data_pagamento,
  status
)
SELECT
  r.id,
  1,  -- Sempre parcela 1 de 1 para à vista
  1,  -- Total de 1 parcela
  r.valor,
  r.data,  -- Data de vencimento = data da receita
  CASE
    WHEN r.recebido = true THEN r.data  -- Se recebido, data de pagamento = data da receita
    ELSE NULL  -- Se não recebido, sem data de pagamento
  END,
  CASE
    WHEN r.recebido = true THEN 'PAGO'
    WHEN r.data < CURRENT_DATE THEN 'ATRASADO'  -- Vencimento no passado = atrasado
    ELSE 'PENDENTE'
  END
FROM receitas r
WHERE r.tipo_pagamento = 'a_vista'
  AND NOT EXISTS (
    SELECT 1 FROM parcelas_receitas pr WHERE pr.receita_id = r.id
  );

-- ============================================================================
-- 2. CRIAR PARCELAS PARA DESPESAS À VISTA SEM PARCELAS
-- ============================================================================

INSERT INTO parcelas_despesas (
  despesa_id,
  numero_parcela,
  total_parcelas,
  valor,
  data_vencimento,
  data_pagamento,
  status
)
SELECT
  d.id,
  1,  -- Sempre parcela 1 de 1 para à vista
  1,  -- Total de 1 parcela
  d.valor,
  d.data,  -- Data de vencimento = data da despesa
  CASE
    WHEN d.pago = true THEN d.data  -- Se pago, data de pagamento = data da despesa
    ELSE NULL  -- Se não pago, sem data de pagamento
  END,
  CASE
    WHEN d.pago = true THEN 'PAGO'
    WHEN d.data < CURRENT_DATE THEN 'ATRASADO'  -- Vencimento no passado = atrasado
    ELSE 'PENDENTE'
  END
FROM despesas d
WHERE d.tipo_pagamento = 'a_vista'
  AND NOT EXISTS (
    SELECT 1 FROM parcelas_despesas pd WHERE pd.despesa_id = d.id
  );

-- ============================================================================
-- 3. VERIFICAÇÃO E VALIDAÇÃO
-- ============================================================================

DO $$
DECLARE
  receitas_sem_parcelas INTEGER;
  despesas_sem_parcelas INTEGER;
  parcelas_receitas_criadas INTEGER;
  parcelas_despesas_criadas INTEGER;
  total_receitas INTEGER;
  total_despesas INTEGER;
BEGIN
  -- Contar receitas sem parcelas (deve ser 0 após migration)
  SELECT COUNT(*) INTO receitas_sem_parcelas
  FROM receitas r
  WHERE NOT EXISTS (
    SELECT 1 FROM parcelas_receitas pr WHERE pr.receita_id = r.id
  );

  -- Contar despesas sem parcelas (deve ser 0 após migration)
  SELECT COUNT(*) INTO despesas_sem_parcelas
  FROM despesas d
  WHERE NOT EXISTS (
    SELECT 1 FROM parcelas_despesas pd WHERE pd.despesa_id = d.id
  );

  -- Contar total de parcelas criadas
  SELECT COUNT(*) INTO parcelas_receitas_criadas FROM parcelas_receitas;
  SELECT COUNT(*) INTO parcelas_despesas_criadas FROM parcelas_despesas;

  -- Contar total de registros
  SELECT COUNT(*) INTO total_receitas FROM receitas;
  SELECT COUNT(*) INTO total_despesas FROM despesas;

  RAISE NOTICE '=== MIGRATION 016 RESULTS ===';
  RAISE NOTICE 'Total de receitas: %', total_receitas;
  RAISE NOTICE 'Total de despesas: %', total_despesas;
  RAISE NOTICE 'Receitas sem parcelas após migração: %', receitas_sem_parcelas;
  RAISE NOTICE 'Despesas sem parcelas após migração: %', despesas_sem_parcelas;
  RAISE NOTICE 'Total de parcelas_receitas: %', parcelas_receitas_criadas;
  RAISE NOTICE 'Total de parcelas_despesas: %', parcelas_despesas_criadas;

  IF receitas_sem_parcelas > 0 OR despesas_sem_parcelas > 0 THEN
    RAISE WARNING 'ATENÇÃO: Ainda existem registros sem parcelas! Revisar manualmente.';
    RAISE WARNING 'Receitas sem parcelas: %', receitas_sem_parcelas;
    RAISE WARNING 'Despesas sem parcelas: %', despesas_sem_parcelas;
  ELSE
    RAISE NOTICE 'SUCESSO! Todos os registros agora têm parcelas.';
    RAISE NOTICE 'Sistema pronto para usar parcelas.status como fonte única de verdade.';
  END IF;
END $$;

COMMIT;
