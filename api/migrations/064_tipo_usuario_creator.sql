-- 064 — Novo tipo de usuário: creator (dono da empresa)
--
-- Hierarquia por empresa: comum < master < creator.
--   comum   → operação, conforme as permissões que o master definir
--   master  → administra usuários e a operação
--   creator → tudo do master + ÚNICO que configura o agente de IA
--             (tela "Agente IA → Configurar Agente": prompt geral, tom, chave de
--             API e modelo). Normalmente é o dono da empresa.
--
-- `tipo_usuario` é o ENUM `tipo_usuario_crm`. O novo valor é adicionado aqui e só
-- pode ser USADO depois que esta transação commitar — por isso a promoção dos donos
-- fica na migration 065, que precisa rodar em seguida.

ALTER TYPE tipo_usuario_crm ADD VALUE IF NOT EXISTS 'creator';

COMMENT ON COLUMN usuarios.tipo_usuario IS
  'Tipo na empresa: creator (dono — administra e configura o agente de IA), master (administra usuários e a operação) ou comum (acesso limitado pelas permissões)';
