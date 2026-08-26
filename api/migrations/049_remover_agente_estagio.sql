-- Migration 049: Aposentar o agente de IA reativo POR ESTÁGIO.
--
-- DECISÃO DO USUÁRIO: a configuração do agente por estágio (toggle + instruções)
-- ficava redundante com o follow-up de agendamento. O agente reativo passa a ser
-- controlado apenas POR LEAD (leads.agente_ia_ativo) e a instrução por estágio dá
-- lugar ao campo instrucao_ia do próprio follow-up.
--
-- Escopo desta migration (limpeza de dados/constraint):
--   1. Remove as automações do tipo 'ativar_agente_estagio' (viravam ruído na aba Automações).
--   2. Tira 'ativar_agente_estagio' do CHECK de tipos válidos.
-- As colunas estagios_funil.agente_ia_ativo / instrucoes_agente_ia ficam no banco
-- (inertes) — nada mais as escreve; leituras retornam o default (false/NULL).

BEGIN;

-- 1. Remove as automações espelho do agente por estágio.
DELETE FROM automacoes WHERE tipo_acao = 'ativar_agente_estagio';

-- 2. Garante que nenhum estágio permaneça marcado como ativo (não deveria haver).
UPDATE estagios_funil SET agente_ia_ativo = false WHERE agente_ia_ativo = true;

-- 3. Recria o CHECK de tipos válidos sem 'ativar_agente_estagio'.
ALTER TABLE automacoes DROP CONSTRAINT IF EXISTS automacoes_tipo_valido;
ALTER TABLE automacoes ADD CONSTRAINT automacoes_tipo_valido
  CHECK (tipo_acao::text = ANY (ARRAY[
    'envio_mensagem_grupo'::text,
    'followup'::text,
    'ativar_agente_lead'::text,
    'disparo_lote'::text
  ]));

COMMIT;
