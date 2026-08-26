-- Migration 009: Adicionar campos de parcelamento em receitas e despesas
-- Data: 2025-11-03
-- Descrição: Adicionar controle de parcelas diretamente nas tabelas de receitas e despesas

-- ============================================
-- 1. ADICIONAR CAMPOS EM RECEITAS
-- ============================================

-- Adicionar campos de parcelamento
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS parcelado BOOLEAN DEFAULT false;
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS numero_parcelas INTEGER;
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS parcela_atual INTEGER;

-- Comentários
COMMENT ON COLUMN receitas.parcelado IS 'Indica se a receita é parcelada';
COMMENT ON COLUMN receitas.numero_parcelas IS 'Número total de parcelas (se parcelado = true)';
COMMENT ON COLUMN receitas.parcela_atual IS 'Número da parcela atual (ex: parcela 1 de 12)';

-- ============================================
-- 2. ADICIONAR CAMPOS EM DESPESAS
-- ============================================

-- Adicionar campos de parcelamento
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS parcelado BOOLEAN DEFAULT false;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS numero_parcelas INTEGER;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS parcela_atual INTEGER;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS recorrente BOOLEAN DEFAULT false;

-- Comentários
COMMENT ON COLUMN despesas.parcelado IS 'Indica se a despesa é parcelada';
COMMENT ON COLUMN despesas.numero_parcelas IS 'Número total de parcelas (se parcelado = true)';
COMMENT ON COLUMN despesas.parcela_atual IS 'Número da parcela atual (ex: parcela 1 de 12)';
COMMENT ON COLUMN despesas.recorrente IS 'Indica se a despesa é recorrente (mensal)';

-- ============================================
-- 3. ATUALIZAR DADOS EXISTENTES
-- ============================================

-- Receitas existentes não são parceladas por padrão
UPDATE receitas SET parcelado = false WHERE parcelado IS NULL;

-- Despesas existentes não são parceladas nem recorrentes por padrão
UPDATE despesas SET parcelado = false WHERE parcelado IS NULL;
UPDATE despesas SET recorrente = false WHERE recorrente IS NULL;

-- ============================================
-- 4. CONSTRAINTS (opcional - validação)
-- ============================================

-- Se parcelado = true, numero_parcelas deve ser >= 2
ALTER TABLE receitas ADD CONSTRAINT receitas_parcelas_minimo
  CHECK (
    (parcelado = false AND numero_parcelas IS NULL)
    OR
    (parcelado = true AND numero_parcelas >= 2 AND numero_parcelas <= 120)
  );

ALTER TABLE despesas ADD CONSTRAINT despesas_parcelas_minimo
  CHECK (
    (parcelado = false AND numero_parcelas IS NULL)
    OR
    (parcelado = true AND numero_parcelas >= 2 AND numero_parcelas <= 120)
  );

-- parcela_atual deve ser <= numero_parcelas
ALTER TABLE receitas ADD CONSTRAINT receitas_parcela_atual_valida
  CHECK (
    parcela_atual IS NULL
    OR
    (parcela_atual >= 1 AND parcela_atual <= numero_parcelas)
  );

ALTER TABLE despesas ADD CONSTRAINT despesas_parcela_atual_valida
  CHECK (
    parcela_atual IS NULL
    OR
    (parcela_atual >= 1 AND parcela_atual <= numero_parcelas)
  );

-- ============================================
-- 5. VERIFICAÇÃO
-- ============================================

DO $$
DECLARE
  receitas_total INTEGER;
  receitas_parceladas INTEGER;
  despesas_total INTEGER;
  despesas_parceladas INTEGER;
BEGIN
  SELECT COUNT(*) INTO receitas_total FROM receitas;
  SELECT COUNT(*) INTO receitas_parceladas FROM receitas WHERE parcelado = true;
  SELECT COUNT(*) INTO despesas_total FROM despesas;
  SELECT COUNT(*) INTO despesas_parceladas FROM despesas WHERE parcelado = true;

  RAISE NOTICE '=== RECEITAS ===';
  RAISE NOTICE 'Total: %', receitas_total;
  RAISE NOTICE 'Parceladas: %', receitas_parceladas;
  RAISE NOTICE 'À vista: %', (receitas_total - receitas_parceladas);

  RAISE NOTICE '=== DESPESAS ===';
  RAISE NOTICE 'Total: %', despesas_total;
  RAISE NOTICE 'Parceladas: %', despesas_parceladas;
  RAISE NOTICE 'À vista: %', (despesas_total - despesas_parceladas);
END $$;

-- ============================================
-- ROLLBACK (caso necessário)
-- ============================================

-- Para reverter esta migration:
-- ALTER TABLE receitas DROP CONSTRAINT IF EXISTS receitas_parcelas_minimo;
-- ALTER TABLE receitas DROP CONSTRAINT IF EXISTS receitas_parcela_atual_valida;
-- ALTER TABLE despesas DROP CONSTRAINT IF EXISTS despesas_parcelas_minimo;
-- ALTER TABLE despesas DROP CONSTRAINT IF EXISTS despesas_parcela_atual_valida;
-- ALTER TABLE receitas DROP COLUMN IF EXISTS parcelado;
-- ALTER TABLE receitas DROP COLUMN IF EXISTS numero_parcelas;
-- ALTER TABLE receitas DROP COLUMN IF EXISTS parcela_atual;
-- ALTER TABLE despesas DROP COLUMN IF EXISTS parcelado;
-- ALTER TABLE despesas DROP COLUMN IF EXISTS numero_parcelas;
-- ALTER TABLE despesas DROP COLUMN IF EXISTS parcela_atual;
-- ALTER TABLE despesas DROP COLUMN IF EXISTS recorrente;
