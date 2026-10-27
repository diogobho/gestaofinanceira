-- 080 — Alinha preço e features dos planos com a landing (canal como eixo)
--
-- A landing `gestao-financeira.html` foi republicada em 19/09/2026 com a nova
-- divisão: o que separa os planos com CRM não é "quantos recursos", é QUAL
-- CANAL de WhatsApp — QR Code (Profissional, só responde) × API Oficial da Meta
-- (Enterprise, pode prospectar). O banco continuou com o preço e as features
-- antigas, e a tela de cadastro passou a contradizer a página que trouxe o
-- visitante: R$ 219 contra R$ 199, e o Profissional ainda prometendo
-- "Disparos de WhatsApp para leads" logo abaixo de uma página dizendo que ele
-- não tem. Esta migration é só o alinhamento do texto e do preço.
--
-- `planos` e `planos_ciclos` pertencem ao `postgres`: rode como ele e mantenha
-- os GRANT, senão a API deixa de enxergar as tabelas (pegadinha da 067).
--
-- O que NÃO está aqui, de propósito:
--   * a trava de verdade (quem pode disparar) — isso é `planos.capacidades`,
--     em migration própria, porque mexe em comportamento e não em vitrine;
--   * o valor das assinaturas já ativas no Asaas — o valor foi congelado lá na
--     criação e não se altera por UPDATE nosso. Quem já paga R$ 219 continua
--     pagando R$ 219 até alguém mudar a subscription no Asaas.

BEGIN;

-- 1. Preço do Profissional: 219 → 199, com os compromissos em -10/-15/-25%
--    (os selos de desconto da landing saem do plano em destaque, que é este).
UPDATE planos_ciclos SET preco_mensal = 199.00 WHERE plano_id = 2 AND ciclo = 'mensal';
UPDATE planos_ciclos SET preco_mensal = 179.00 WHERE plano_id = 2 AND ciclo = 'trimestral';
UPDATE planos_ciclos SET preco_mensal = 169.00 WHERE plano_id = 2 AND ciclo = 'semestral';
UPDATE planos_ciclos SET preco_mensal = 149.00 WHERE plano_id = 2 AND ciclo = 'anual';

-- Preço de tabela do plano: é o que `getCiclo` usa de reserva quando o ciclo
-- não tem linha, e o que a tela risca ao lado do preço com desconto.
UPDATE planos SET preco_mensal = 199.00 WHERE id = 2;

-- Starter (79) e Enterprise (397) não mudaram de preço — a landing já os traz
-- com os mesmos valores em todos os ciclos.

-- 2. Features — mesma ordem e mesmo texto dos cards da landing.
--    A contagem de usuários saiu da lista: `Planos.tsx` e a landing já a
--    imprimem à parte, a partir de usuarios_base/usuarios_max, e ela aparecia
--    duas vezes no mesmo card.
UPDATE planos SET
  descricao = 'Para organizar a casa. Sem CRM e sem WhatsApp.',
  features  = '[
    "Dashboard financeiro com gráficos",
    "Receitas, despesas e parcelamentos",
    "Categorias personalizadas",
    "Assistente IA financeiro",
    "Notificações de cobrança",
    "Relatórios em PDF"
  ]'::jsonb
WHERE id = 1;

UPDATE planos SET
  descricao = 'Para atender e organizar o funil, com o seu número no WhatsApp.',
  features  = '[
    "Tudo do Starter",
    "CRM completo com funil Kanban",
    "WhatsApp por QR Code — seu próprio número",
    "Conversa e histórico dentro do card",
    "Agente de IA que responde seus clientes",
    "Follow-up de quem já respondeu",
    "Disparos de e-mail para leads",
    "Importação por CSV, sessões e agendamentos",
    "Suporte prioritário"
  ]'::jsonb
WHERE id = 2;

UPDATE planos SET
  descricao = 'Para prospectar sem risco, pela API Oficial da Meta.',
  features  = '[
    "Tudo do Profissional",
    "API Oficial do WhatsApp (Meta) — número verificado",
    "Disparo de WhatsApp em massa",
    "Modelos de mensagem aprovados pela Meta",
    "Agente de IA proativo",
    "Automações e cadências por estágio",
    "WhatsApp exclusivo por usuário",
    "SMTP personalizado (sua marca)",
    "Suporte dedicado",
    "Acesso a integrações sob medida (orçadas à parte)"
  ]'::jsonb
WHERE id = 3;

GRANT SELECT, INSERT, UPDATE, DELETE ON planos, planos_ciclos TO gestao_user;

COMMIT;
