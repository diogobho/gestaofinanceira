-- 095 — Coexistência: o número continua no app WhatsApp Business do celular e também
-- fala pela Cloud API (02/10/2026).
--
-- O número entra pelo Embedded Signup com featureType 'whatsapp_business_app_onboarding'.
-- Ele já está registrado (é o do app), então não há /register nem PIN. Depois da
-- conexão a Meta dá 24h e UMA chamada para pedir os contatos e o histórico de até
-- 180 dias. As colunas abaixo guardam se pedimos, quando e como a importação está —
-- pedir de novo exige desconectar e refazer a janela inteira.
-- Rodar como postgres (dono da tabela).

ALTER TABLE whatsapp_cloud_contas
  ADD COLUMN IF NOT EXISTS coexistencia        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_pedido_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_erro           TEXT,
  -- importando | concluido | recusado (a pessoa não liberou o histórico no app)
  ADD COLUMN IF NOT EXISTS historico_status    VARCHAR(12),
  ADD COLUMN IF NOT EXISTS historico_progresso SMALLINT,
  ADD COLUMN IF NOT EXISTS historico_mensagens INTEGER NOT NULL DEFAULT 0;
