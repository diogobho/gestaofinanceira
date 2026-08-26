-- Migration 042: Adiciona tipo 'transferencia_automatica' ao CHECK de atividades_lead
-- Usado quando o lead muda de proprietário automaticamente após disparo (WhatsApp/e-mail)

ALTER TABLE atividades_lead DROP CONSTRAINT IF EXISTS atividades_tipo_check;

ALTER TABLE atividades_lead ADD CONSTRAINT atividades_tipo_check CHECK (
  tipo IN (
    'criacao',
    'mudanca_estagio',
    'mensagem_enviada',
    'mensagem_recebida',
    'nota',
    'ligacao',
    'email',
    'tarefa',
    'tag_adicionada',
    'tag_removida',
    'atualizacao',
    'arquivado',
    'reativado',
    'transferencia_funil',
    'transferencia_automatica'
  )
);
