-- Migration 050: Suporte a MÍDIA nas mensagens de follow-up.
--
-- Follow-ups do tipo 'manual' passam a poder anexar um arquivo (imagem, GIF,
-- vídeo, PDF, documento) — os mesmos formatos aceitos no chat manual. No envio,
-- o arquivo é mandado via /send-media e o campo `mensagem` vira a LEGENDA (caption).
-- Emojis já funcionavam (texto UTF-8); isto adiciona os demais formatos.
--
-- O arquivo é guardado em /uploads/whatsapp/{empresa_id}/ no momento da configuração;
-- estas colunas só referenciam o arquivo já armazenado (não guardam binário).

BEGIN;

ALTER TABLE followups_agendados
  ADD COLUMN IF NOT EXISTS media_url      text,
  ADD COLUMN IF NOT EXISTS media_mimetype varchar(120),
  ADD COLUMN IF NOT EXISTS media_filename text;

COMMIT;
