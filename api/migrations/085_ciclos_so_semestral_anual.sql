-- 085 — Mensal e trimestral saem de venda (21/09/2026)
--
-- Novas assinaturas só entram no semestral ou no anual. As linhas NÃO são
-- apagadas: `ativo = false` tira o ciclo da vitrine e do cadastro, mas a
-- assinatura que já está nele continua lendo o próprio preço daqui — a tela
-- recalcula de `planos_ciclos` a cada abertura, e a Anchor (empresa 38) paga
-- no mensal. Apagar a linha faria a Minha Conta dela cair no preço de tabela.
--
-- O `getCiclo` separa os dois usos: para contratar, ciclo inativo é erro; para
-- mexer numa assinatura existente (`{ contratado: true }`), vale do jeito que está.
--
-- Voltar atrás: UPDATE planos_ciclos SET ativo = true WHERE ciclo IN ('mensal','trimestral');

UPDATE planos_ciclos
   SET ativo = false
 WHERE ciclo IN ('mensal', 'trimestral');
