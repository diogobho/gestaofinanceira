-- 086 — Reagir e responder citando no chat do card (#188, 25/09/2026)
--
-- O chat do CRM só tinha texto solto: não mostrava a reação do lead (a instância
-- descartava — 1.081 só no chip da Alcione), não mostrava qual mensagem o lead
-- citou ao responder, e não deixava o operador fazer nenhuma das duas coisas. A
-- conversa ia para o celular, e com ela o registro.
--
-- A reação NÃO vira linha: ela é um atributo da mensagem reagida. Uma linha por
-- reação era exatamente o que poluía a conversa antes (emoji solto como fala do
-- lead). Por isso duas colunas na própria mensagem — a última reação de cada
-- lado vale; reação removida zera.
--
-- `resposta_a_message_id` guarda o id do WhatsApp da mensagem citada, e a leitura
-- acha o texto dela pelo mesmo id. Id em vez de FK porque a citada pode ser
-- anterior ao CRM (ou ter sido apagada) — nesse caso o balão mostra só a resposta.
--
-- Roda como postgres (dono da tabela).

ALTER TABLE historico_mensagens
  ADD COLUMN IF NOT EXISTS resposta_a_message_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reacao_contato        VARCHAR(16),
  ADD COLUMN IF NOT EXISTS reacao_minha          VARCHAR(16);

-- Reação e citação procuram a mensagem pelo id do WhatsApp dentro da empresa.
CREATE INDEX IF NOT EXISTS idx_historico_wa_message_id
  ON historico_mensagens (empresa_id, whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
