-- 060 — Telemetria de conexão WhatsApp / detecção de ban
--
-- Log append-only dos eventos de desconexão de cada instância Baileys. Permite
-- diagnosticar QUANDO e POR QUÊ um número deixou de funcionar: logout do usuário
-- (401), BAN da Meta (403 forbidden), sessão corrompida, queda de rede etc.
-- Alimentado pelo webhook POST /api/crm/webhook/whatsapp-conexao, empurrado pela
-- instância (api-multi-baileys.js) a cada 'connection: close'.

CREATE TABLE IF NOT EXISTS whatsapp_conexao_eventos (
  id          SERIAL PRIMARY KEY,
  porta       INTEGER NOT NULL,
  usuario_id  INTEGER,        -- ref. lógica a usuarios(id); sem FK (log append-only)
  empresa_id  INTEGER,
  categoria   TEXT,           -- ban | logout | sessao | substituida | reinicio | rede | desconhecido
  motivo      TEXT,           -- descrição legível
  status_code INTEGER,        -- código bruto do DisconnectReason (401/403/408/...)
  registrado  BOOLEAN,        -- a sessão estava registrada quando caiu?
  criado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_conexao_eventos_usuario ON whatsapp_conexao_eventos (usuario_id, criado_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conexao_eventos_categoria ON whatsapp_conexao_eventos (categoria, criado_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conexao_eventos_porta ON whatsapp_conexao_eventos (porta, criado_at DESC);
