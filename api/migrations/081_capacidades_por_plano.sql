-- 081 — Capacidades por plano: o que cada plano PODE fazer
--
-- Até aqui o plano não restringia módulo nenhum: não havia guard por plano na API
-- nem no menu, e `checkSubscription` está montado antes do `authRequired`, então
-- `req.user` chega vazio e ele libera todo mundo. Quem assinou o Starter usava o
-- CRM inteiro. A landing de 19/09/2026 passou a vender três produtos diferentes —
-- e um produto que não se distingue do outro na tela não é um produto.
--
-- ── O modelo ────────────────────────────────────────────────────────────────
-- `planos.capacidades` é uma LISTA DE CHAVES, não um mapa de booleanos: capacidade
-- ausente é capacidade negada, e ler a lista responde "o que este plano é" numa
-- linha. O catálogo com rótulo, motivo e plano mínimo vive em
-- `api/src/shared/capacidades.ts` — aqui ficam só as chaves, porque quem valida a
-- grafia é o código, uma vez, e não um CHECK que exigiria migration a cada
-- capacidade nova.
--
-- `empresas.capacidades_extras` é a cortesia, o mesmo mecanismo que a 067 usou em
-- `usuarios_cortesia` quando a base de usuários inclusos baixou: ninguém perde o que
-- já estava usando por causa de uma regra que nasceu depois. A diferença é que aqui
-- a cortesia é nomeada — dá para ver quem tem o quê e por quê.
--
-- Precedência (em `capacidadesDaEmpresa`): plano ∪ extras. Não existe subtração:
-- tirar algo de uma empresa é mudar o plano dela, que é uma conversa comercial.
--
-- `planos` pertence ao `postgres`: rode como ele e mantenha os GRANT (pegadinha 067).

BEGIN;

ALTER TABLE planos     ADD COLUMN IF NOT EXISTS capacidades       jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE empresas   ADD COLUMN IF NOT EXISTS capacidades_extras jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN planos.capacidades IS
  'Chaves de capacidade que o plano inclui (catálogo em api/src/shared/capacidades.ts). Ausente = negada.';
COMMENT ON COLUMN empresas.capacidades_extras IS
  'Cortesia: capacidades liberadas para ESTA empresa além do plano. Mesmo papel do usuarios_cortesia da 067.';

-- ── Starter: o financeiro, e só ─────────────────────────────────────────────
UPDATE planos SET capacidades = '[
  "financeiro", "relatorios", "duo_chat"
]'::jsonb WHERE id = 1;

-- ── Profissional: CRM + WhatsApp por QR, tudo que é REATIVO ─────────────────
-- Não tem `conversa_fria` nem `disparo_whatsapp`: é exatamente a linha que a
-- landing desenha — quem inicia conversa com desconhecido precisa do canal oficial.
UPDATE planos SET capacidades = '[
  "financeiro", "relatorios", "duo_chat",
  "crm", "whatsapp_qr", "agente_reativo", "followup_morno",
  "disparo_email", "grupos_whatsapp"
]'::jsonb WHERE id = 2;

-- ── Enterprise: o canal oficial e o que só ele torna seguro ─────────────────
UPDATE planos SET capacidades = '[
  "financeiro", "relatorios", "duo_chat",
  "crm", "whatsapp_qr", "agente_reativo", "followup_morno",
  "disparo_email", "grupos_whatsapp",
  "whatsapp_oficial", "disparo_whatsapp", "conversa_fria",
  "agente_proativo", "modelos_meta", "smtp_proprio"
]'::jsonb WHERE id = 3;

-- ── Cortesia para quem JÁ usa o que o plano dele não inclui ─────────────────
-- Medido em 20/09/2026, não estimado: só entram empresas com uso real. Tirar uma
-- tela que a pessoa já usa é pior do que tê-la vendido barato demais.
--
--   33 · Loja Maçônica  (Starter) — CRM em uso
--   45 · Instituto Hera (Starter) — CRM em uso, 1 estágio com cadência
--
-- A regra é a mesma para os dois: mantêm o CRM e o WhatsApp por QR que já tinham.
-- Não ganham conversa fria nem disparo — isso nunca existiu para eles.
UPDATE empresas
   SET capacidades_extras = '["crm", "whatsapp_qr", "agente_reativo", "followup_morno", "disparo_email", "grupos_whatsapp"]'::jsonb
 WHERE id IN (33, 45)
   AND capacidades_extras = '[]'::jsonb;

GRANT SELECT, INSERT, UPDATE, DELETE ON planos, empresas TO gestao_user;

COMMIT;
