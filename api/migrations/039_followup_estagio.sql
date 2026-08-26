-- Migration 039: Follow-up automático por estágio
-- Permite configurar um follow-up automático para todos os leads que entram em um estágio.
-- followup_config JSONB: { ativo, tipo, mensagem, instrucao_ia, intervalo_horas }

ALTER TABLE estagios_funil
  ADD COLUMN IF NOT EXISTS followup_config JSONB DEFAULT NULL;

-- Adiciona coluna origem para distinguir follow-ups criados pelo estágio vs. pelo lead
ALTER TABLE followups_agendados
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'lead'
    CHECK (origem IN ('lead', 'estagio'));

-- Índice para cancelar follow-ups pendentes de estágio por lead
CREATE INDEX IF NOT EXISTS idx_followups_lead_origem ON followups_agendados(lead_id, origem, status)
  WHERE status = 'pendente';
