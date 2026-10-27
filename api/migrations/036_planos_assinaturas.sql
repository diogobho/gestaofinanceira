-- Migration 036: Planos e Assinaturas (integração Asaas)
-- Gerencia cobrança SaaS com trial de 3 dias e bloqueio total ao expirar

-- =====================================
-- TABELA: planos
-- =====================================
CREATE TABLE IF NOT EXISTS planos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  preco_mensal DECIMAL(10,2) NOT NULL,
  max_usuarios INTEGER,           -- NULL = ilimitado
  features JSONB DEFAULT '[]',
  destaque BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed dos 3 planos
INSERT INTO planos (id, nome, descricao, preco_mensal, max_usuarios, features, destaque) VALUES
(1, 'Starter',
 'Ideal para profissionais autônomos e pequenos escritórios',
 79.00,
 2,
 '["Dashboard financeiro","Receitas e despesas","Parcelas e cobranças","Relatórios básicos","Assistente IA","2 usuários"]',
 false),
(2, 'Profissional',
 'Perfeito para empresas em crescimento',
 189.00,
 5,
 '["Tudo do Starter","CRM / Funil de vendas","WhatsApp integrado","Sessões e agendamentos","5 usuários","Suporte prioritário"]',
 true),
(3, 'Enterprise',
 'Solução completa para grandes operações',
 349.00,
 NULL,
 '["Tudo do Profissional","Usuários ilimitados","Agente IA avançado","Relatórios avançados","API personalizada","Suporte dedicado"]',
 false)
ON CONFLICT (id) DO NOTHING;

-- Resetar sequence para não conflitar
SELECT setval('planos_id_seq', 10, false);

-- =====================================
-- TABELA: assinaturas
-- =====================================
CREATE TABLE IF NOT EXISTS assinaturas (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER UNIQUE NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plano_id INTEGER REFERENCES planos(id),
  status VARCHAR(50) NOT NULL DEFAULT 'trial',
  -- status: trial | ativa | suspensa | cancelada | expirada
  trial_expira_em TIMESTAMP,
  plano_ativo_ate TIMESTAMP,
  asaas_customer_id VARCHAR(100),
  asaas_subscription_id VARCHAR(100),
  asaas_next_due_date DATE,
  cancelamento_motivo TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_empresa ON assinaturas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON assinaturas(status);
CREATE INDEX IF NOT EXISTS idx_assinaturas_customer ON assinaturas(asaas_customer_id);

-- Criar assinaturas trial para todas as empresas existentes (que ainda não têm)
INSERT INTO assinaturas (empresa_id, status, trial_expira_em)
SELECT id, 'trial', CURRENT_TIMESTAMP + INTERVAL '3 days'
FROM empresas
WHERE id NOT IN (SELECT empresa_id FROM assinaturas)
ON CONFLICT (empresa_id) DO NOTHING;
