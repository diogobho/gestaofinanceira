-- 063: assinatura de e-mail por usuário
--
-- Antes disso a assinatura do disparo de e-mail era um HTML chumbado no frontend
-- (DisparoEmailModal) com a marca de UMA empresa — Instituto Totem / Panteras —
-- e o que o usuário editava ficava só no localStorage do navegador. Resultado:
-- qualquer empresa via a assinatura da Panteras como "padrão do sistema", e a
-- assinatura sumia ao trocar de navegador.
--
-- Agora cada usuário tem a sua, editável em /gestao/perfil. Quem não preencher
-- recebe um padrão montado com os dados da PRÓPRIA empresa (empresas.nome,
-- email, telefone, endereco, logo_url, cor_primaria) — ver
-- frontend/src/utils/assinaturaEmail.ts.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS assinatura_email TEXT;

COMMENT ON COLUMN usuarios.assinatura_email IS
  'HTML da assinatura anexada aos e-mails do CRM. NULL = usa o padrão gerado com os dados da empresa.';
