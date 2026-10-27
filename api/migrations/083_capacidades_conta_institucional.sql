-- 083 — A conta institucional não tem plano, e por isso perdia o CRM
--
-- Achado pelo `scripts/verificar_capacidades.js` logo depois da 081, antes de
-- alguém esbarrar nisso em produção.
--
-- A empresa 1 (`master@gestao.com`) é a conta institucional da DuoFuturo: é dela
-- o número oficial da Meta (`whatsapp_cloud_contas` id 1, porta virtual 49000) e o
-- **funil Suporte (58)**, onde cai todo cliente que escreve para +55 11 94052-4435.
-- A assinatura dela está `cancelada` com `plano_id` NULO — ela não é cliente e
-- nunca vai ser.
--
-- Sem plano, `capacidadesDaEmpresa` cai no padrão conservador (financeiro apenas),
-- que é o certo para conta sem dado — mas aqui teria tirado o CRM e o WhatsApp de
-- quem atende o suporte. O usuário 12 é `super_admin` e passa por cima do guard; a
-- **Débora (usuário 20) não é**, e ficaria sem a fila de atendimento.
--
-- Deixar a conta com o canal oficial e sem a capacidade dele também era incoerente:
-- ela ESTÁ no oficial, ligada, recebendo.
--
-- Por que cortesia e não uma assinatura Enterprise de fachada: assinatura é
-- cobrança, e criar uma para a nossa própria conta sujaria relatório de receita,
-- aviso de trial e conciliação do Asaas para sempre. `capacidades_extras` diz a
-- verdade — esta empresa tem estas capacidades por decisão, não por contrato.

BEGIN;

UPDATE empresas
   SET capacidades_extras = '[
     "financeiro", "relatorios", "duo_chat",
     "crm", "whatsapp_qr", "agente_reativo", "followup_morno",
     "disparo_email", "grupos_whatsapp",
     "whatsapp_oficial", "disparo_whatsapp", "conversa_fria",
     "agente_proativo", "modelos_meta", "smtp_proprio"
   ]'::jsonb
 WHERE id = 1;

COMMIT;
