-- Migration 037: Follow-ups agendados no CRM
-- Permite agendar mensagens manuais ou via agente IA para um lead em horário específico

CREATE TABLE IF NOT EXISTS followups_agendados (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL,
  agendado_para TIMESTAMPTZ NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (tipo IN ('manual', 'agente_ia')),
  mensagem TEXT,          -- para tipo=manual
  instrucao_ia TEXT,      -- para tipo=agente_ia: instrução extra ao agente
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou', 'cancelado')),
  erro TEXT,
  enviado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followups_lead ON followups_agendados(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_empresa ON followups_agendados(empresa_id);
CREATE INDEX IF NOT EXISTS idx_followups_pendentes ON followups_agendados(status, agendado_para) WHERE status = 'pendente';
