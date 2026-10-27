-- 101: chip de QR Code só para os Grupos (06/10/2026).
-- Quem está no número oficial (whatsapp_porta = porta virtual da Cloud API) não tinha
-- como gerenciar grupos: a Groups API da Meta exige o selo verde e para em 8 pessoas.
-- O Enterprise passa a conectar um segundo WhatsApp, por QR, que serve SÓ aos grupos:
-- mensagens, boas-vindas, criar lead e campanhas. Conversa 1:1 continua no oficial —
-- o webhook dessa porta só processa eventos de grupo.
-- Tabela à parte (e não coluna em usuarios) para não precisar do dono de usuarios.
CREATE TABLE IF NOT EXISTS whatsapp_chip_grupos (
  usuario_id  INTEGER PRIMARY KEY, -- sem FK: o usuário da app não tem REFERENCES em usuarios
  porta       INTEGER NOT NULL UNIQUE CHECK (porta BETWEEN 3010 AND 3200),
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);
