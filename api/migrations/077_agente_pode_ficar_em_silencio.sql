-- 077 — O agente reativo pode decidir não responder.
--
-- A regra 8 do prompt base mandava SEMPRE responder, porque o modelo às vezes
-- encerrava o turno só com ferramenta e o lead ficava sem nada. No número pessoal do
-- Diogo (empresa 32) isso vira problema: a Ive escreveu "hoje tem encontro ao vivo…"
-- (assunto do Club) e, na simulação de 15/09/2026, o agente respondeu por ele
-- aceitando o convite. Tem mensagem que não pede resposta — "ok", "obrigada",
-- "vejo depois", figurinha — e tem assunto que só o dono do número responde.
--
-- Com a opção ligada, o agente pode devolver [SEM_RESPOSTA]: nada é enviado, a ação
-- fica no log e a mensagem continua como não lida para a pessoa ver. Desligada por
-- padrão: a Panteras segue exatamente como estava.

ALTER TABLE agente_ia_config
  ADD COLUMN IF NOT EXISTS pode_ficar_em_silencio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN agente_ia_config.pode_ficar_em_silencio IS
  'Agente reativo pode não responder quando a mensagem não pede resposta ou é assunto pessoal (migration 077).';
