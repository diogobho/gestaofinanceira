-- 058_reuniao_lembretes.sql
-- Lembretes automáticos de reunião agendada + gestão de no-show.
--
-- A data/hora da reunião vem da tarefa do lead (tarefas_lead.tipo='reuniao', data_vencimento).
-- Cada estágio pode ativar a régua via estagios_funil.reuniao_lembretes (JSONB), no mesmo
-- espírito de followup_config. O job src/jobs/reuniao-lembretes-scheduler.ts processa.
--
-- Shape do JSONB:
-- {
--   "ativo": true,
--   "marcos": [
--     { "marco": "lembrete_24h", "offset_min": -1440, "tolerancia_min": 180,
--       "grupo": "lembrete", "mensagem": "..." },
--     ...
--   ]
-- }
-- offset_min: minutos relativos ao INÍCIO da reunião (negativo = antes; >=0 = depois/no-show).
-- tolerancia_min: só dispara se agora ∈ [reuniao+offset, reuniao+offset+tolerancia).
--   (evita mandar "sua conversa é amanhã" quando já falta 1h, ou um no-show dias atrasado).

BEGIN;

ALTER TABLE estagios_funil
  ADD COLUMN IF NOT EXISTS reuniao_lembretes JSONB;

CREATE TABLE IF NOT EXISTS reuniao_lembretes_enviados (
  id          SERIAL PRIMARY KEY,
  tarefa_id   INTEGER NOT NULL REFERENCES tarefas_lead(id) ON DELETE CASCADE,
  lead_id     INTEGER NOT NULL,
  empresa_id  INTEGER NOT NULL,
  marco       VARCHAR(40) NOT NULL,
  enviado_em  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (tarefa_id, marco)
);

CREATE INDEX IF NOT EXISTS idx_reuniao_lembretes_lead ON reuniao_lembretes_enviados(lead_id);

-- Seed: estágio 211 "Reunião agendada" (funil 24 - Escola Empreendedorismo, empresa Panteras/5),
-- conforme o processo comercial desenhado (Instituto Bogiani).
UPDATE estagios_funil
SET reuniao_lembretes = '{
  "ativo": true,
  "marcos": [
    {"marco":"lembrete_24h","offset_min":-1440,"tolerancia_min":180,"grupo":"lembrete","mensagem":"Oi [PrimeiroNome]! Passando para lembrar que a nossa conversa é amanhã às [Horario] 😊 Confirma que está tudo certo? Se precisar ajustar algo, é só me falar!"},
    {"marco":"lembrete_1h","offset_min":-60,"tolerancia_min":55,"grupo":"lembrete","mensagem":"Oi [PrimeiroNome]! Faltando 1 hora para a nossa conversa 🙌 Estou por aqui, até já!"},
    {"marco":"noshow_d0","offset_min":60,"tolerancia_min":240,"grupo":"noshow","mensagem":"Oi [PrimeiroNome]! Tudo bem? Aguardei você hoje, mas sei que imprevistos acontecem 😊 Podemos remarcar? Me fala um horário que funcione melhor pra você."},
    {"marco":"noshow_d1","offset_min":1440,"tolerancia_min":240,"grupo":"noshow","mensagem":"Oi [PrimeiroNome]! Passando novamente por aqui. Se ainda fizer sentido a nossa conversa, me diz um horário que funcione melhor pra você que eu já reservo 🙂"},
    {"marco":"noshow_d3","offset_min":4320,"tolerancia_min":240,"grupo":"noshow","mensagem":"[PrimeiroNome], última tentativa por aqui. Se ainda fizer sentido a gente conversar, é só me chamar — fico à disposição. Vou seguir te enviando conteúdos que possam ser úteis de tempos em tempos 🙂"}
  ]
}'::jsonb
WHERE id = 211;

COMMIT;
