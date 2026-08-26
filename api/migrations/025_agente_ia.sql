-- Migration 025: Agente de IA para prospecção de leads no CRM

-- Config global do agente por empresa (super_admin controla)
CREATE TABLE IF NOT EXISTS agente_ia_config (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ativo BOOLEAN DEFAULT false,
  api_key TEXT,
  modelo VARCHAR(100) DEFAULT 'claude-sonnet-4-6',
  nome_agente VARCHAR(100) DEFAULT 'Assistente',
  tom VARCHAR(20) DEFAULT 'amigavel',
  area_negocio TEXT,
  system_prompt_extra TEXT,
  max_tokens INTEGER DEFAULT 1024,
  contexto_mensagens INTEGER DEFAULT 10,
  usuarios_habilitados INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id)
);

-- Contexto de conversa por lead (memória do Claude)
CREATE TABLE IF NOT EXISTS agente_ia_contexto (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  conteudo TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agente_ia_contexto_lead ON agente_ia_contexto(lead_id, created_at DESC);

-- Log de ações executadas pelo agente
CREATE TABLE IF NOT EXISTS agente_ia_acoes_log (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL,
  acao VARCHAR(50) NOT NULL,
  dados JSONB,
  sucesso BOOLEAN DEFAULT true,
  erro TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Toggle por estágio do funil
ALTER TABLE estagios_funil ADD COLUMN IF NOT EXISTS agente_ia_ativo BOOLEAN DEFAULT false;

-- Toggle individual por lead (NULL = herdar do estágio)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS agente_ia_ativo BOOLEAN DEFAULT NULL;
