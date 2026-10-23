-- 108 (13/10/2026): tarefas automáticas ao entrar no estágio. Pedido do dono da Panteras para o
-- funil 74 (Escola Oficial): cada etapa do fluxo cria as tarefas do vendedor. A lista mora no
-- estágio (`tarefas_entrada`: [{titulo, descricao, tipo, prioridade, prazo, unidade, hora}]).
-- `tarefas_lead.estagio_origem_id` marca a tarefa criada assim: quando o card sai do estágio, as
-- pendentes dele são canceladas (nunca as que a pessoa criou à mão).
-- Rodar como postgres (dono das tabelas):
--   sudo -u postgres psql -d gestao_financeira -v ON_ERROR_STOP=1 -f migrations/108_tarefas_ao_entrar_estagio.sql
ALTER TABLE estagios_funil ADD COLUMN IF NOT EXISTS tarefas_entrada jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tarefas_lead ADD COLUMN IF NOT EXISTS estagio_origem_id integer
  REFERENCES estagios_funil(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_estagio_origem_pendente
  ON tarefas_lead (lead_id) WHERE estagio_origem_id IS NOT NULL AND status = 'pendente';
