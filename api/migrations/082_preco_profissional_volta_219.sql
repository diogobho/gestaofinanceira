-- 082 — O Profissional volta a R$ 219 (decisão do dono, 20/09/2026)
--
-- A 080 baixou o Profissional de 219 para 199 ao alinhar o banco com a landing
-- nova. A decisão foi desfazer só o PREÇO: a separação de produto continua de pé
-- (QR Code responde × API Oficial prospecta), agora com trava de verdade nas
-- capacidades da 081. O plano não perdeu valor para quem já o tem — perdeu uma
-- capacidade que nunca deveria ter estado num número comum, e ganhou o caminho
-- de upgrade que antes não existia.
--
-- ── O motivo prático de voltar ──────────────────────────────────────────────
-- O Asaas **não deixa** baixar o valor de assinatura de cartão que já tem fatura
-- paga ("invalid_value"), nem o da cobrança pendente onde o cliente já informou o
-- cartão. A única cliente pagante (Instituto Anchor, empresa 38) está em 219 e
-- assim fica. Com o banco em 199 e a fatura em 219, a tela dela passava a
-- anunciar um preço que o cartão não cobrava — e `assinaturas` não guarda preço,
-- então a divergência valeria para todo cliente antigo no próximo reajuste.
--
-- Voltar a 219 resolve isso sem coluna nova e sem tocar na conta dela.
--
-- As FEATURES e a DESCRIÇÃO ficam como a 080 deixou: elas descrevem o produto,
-- não o preço, e é o produto que mudou.
--
-- `planos` pertence ao `postgres`: rode como ele (pegadinha da 067).

BEGIN;

UPDATE planos_ciclos SET preco_mensal = 219.00 WHERE plano_id = 2 AND ciclo = 'mensal';
UPDATE planos_ciclos SET preco_mensal = 199.00 WHERE plano_id = 2 AND ciclo = 'trimestral';
UPDATE planos_ciclos SET preco_mensal = 189.00 WHERE plano_id = 2 AND ciclo = 'semestral';
UPDATE planos_ciclos SET preco_mensal = 169.00 WHERE plano_id = 2 AND ciclo = 'anual';

UPDATE planos SET preco_mensal = 219.00 WHERE id = 2;

-- Os selos de desconto da landing saem deste plano (o em destaque): 219 → 199/189/169
-- é −9% / −14% / −23%, que é o que `gestao-financeira.html` voltou a mostrar.

COMMIT;
