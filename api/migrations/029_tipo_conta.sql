-- Migration 029: Tipo de conta PF/PJ nas empresas
-- Data: 2026-03-01
-- Adiciona suporte a contas Pessoa Física (PF) e Pessoa Jurídica (PJ)
-- Todos os clientes existentes são marcados como PJ

-- ============================================================================
-- 1. ADICIONAR COLUNA tipo_conta NA TABELA empresas
-- ============================================================================

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS tipo_conta VARCHAR(2) DEFAULT 'PJ'
    CONSTRAINT empresas_tipo_conta_check CHECK (tipo_conta IN ('PJ', 'PF'));

-- Marcar todos os registros existentes como PJ
UPDATE empresas SET tipo_conta = 'PJ' WHERE tipo_conta IS NULL;

COMMENT ON COLUMN empresas.tipo_conta IS 'Tipo de conta: PJ (Pessoa Jurídica) ou PF (Pessoa Física)';

-- ============================================================================
-- 2. FUNÇÃO seed_categorias_pj — categorias padrão para Pessoa Jurídica
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_categorias_pj(p_usuario_id INTEGER)
RETURNS VOID AS $$
BEGIN
  -- Receitas PJ
  INSERT INTO categorias_receitas (nome, usuario_id) VALUES
    ('Consultoria', p_usuario_id),
    ('Mentoria', p_usuario_id),
    ('Venda de Produto', p_usuario_id),
    ('Prestação de Serviço', p_usuario_id),
    ('Outros', p_usuario_id)
  ON CONFLICT (nome, usuario_id) DO NOTHING;

  -- Despesas PJ
  INSERT INTO categorias_despesas (nome, usuario_id) VALUES
    ('Marketing', p_usuario_id),
    ('Software', p_usuario_id),
    ('Infraestrutura', p_usuario_id),
    ('Salários', p_usuario_id),
    ('Impostos', p_usuario_id),
    ('Fornecedores', p_usuario_id),
    ('Outros', p_usuario_id)
  ON CONFLICT (nome, usuario_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION seed_categorias_pj(INTEGER) IS
  'Insere categorias padrão PJ (Pessoa Jurídica) para o usuário informado';

-- ============================================================================
-- 3. FUNÇÃO seed_categorias_pf — categorias padrão para Pessoa Física
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_categorias_pf(p_usuario_id INTEGER)
RETURNS VOID AS $$
BEGIN
  -- Receitas PF
  INSERT INTO categorias_receitas (nome, usuario_id) VALUES
    ('Salário CLT', p_usuario_id),
    ('Pró-labore', p_usuario_id),
    ('Aposentadoria/Pensão', p_usuario_id),
    ('Aluguel Recebido', p_usuario_id),
    ('Dividendos', p_usuario_id),
    ('Freelance/Serviços', p_usuario_id),
    ('Bonificação/PLR', p_usuario_id),
    ('Venda de Ativos', p_usuario_id),
    ('Renda Extra', p_usuario_id),
    ('Outros', p_usuario_id)
  ON CONFLICT (nome, usuario_id) DO NOTHING;

  -- Despesas PF — Essenciais Fixas
  INSERT INTO categorias_despesas (nome, usuario_id) VALUES
    ('Aluguel/Financiamento', p_usuario_id),
    ('Condomínio', p_usuario_id),
    ('Água', p_usuario_id),
    ('Luz/Energia', p_usuario_id),
    ('Internet', p_usuario_id),
    ('Telefone', p_usuario_id),
    ('Plano de Saúde', p_usuario_id),
    ('Escola/Faculdade', p_usuario_id),
    ('Transporte', p_usuario_id),
    -- Anuais
    ('IPTU', p_usuario_id),
    ('IPVA', p_usuario_id),
    ('Seguro Residencial', p_usuario_id),
    ('Seguro Veicular', p_usuario_id),
    -- Saúde
    ('Consultas Médicas', p_usuario_id),
    ('Exames', p_usuario_id),
    ('Remédios/Farmácia', p_usuario_id),
    ('Academia', p_usuario_id),
    -- Lazer
    ('Restaurante/Lanche', p_usuario_id),
    ('Streaming', p_usuario_id),
    ('Passeios', p_usuario_id),
    ('Hobbies', p_usuario_id),
    -- Desenvolvimento
    ('Cursos', p_usuario_id),
    ('Livros', p_usuario_id),
    ('Coaching', p_usuario_id),
    -- Viagens
    ('Passagens', p_usuario_id),
    ('Hospedagem', p_usuario_id),
    ('Alimentação Viagem', p_usuario_id),
    -- Investimentos (saída de caixa)
    ('Investimentos', p_usuario_id),
    ('Outros', p_usuario_id)
  ON CONFLICT (nome, usuario_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION seed_categorias_pf(INTEGER) IS
  'Insere categorias padrão PF (Pessoa Física) para o usuário informado';

-- ============================================================================
-- 4. FIM DA MIGRATION
-- ============================================================================
