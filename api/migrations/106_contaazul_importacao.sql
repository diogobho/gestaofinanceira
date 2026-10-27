-- 106: lançamentos do Conta Azul entram em Receitas e Despesas (09/10/2026), como os do Asaas
-- (105). Contas a receber viram receitas; contas a pagar, despesas. Cada parcela do Conta Azul
-- vira um lançamento à vista com a parcela 1 de 1, pago no dia da baixa. O Conta Azul não tem
-- webhook: um job de 15 em 15 minutos busca o que mudou (data_alteracao) e um de 6 em 6 horas
-- repassa tudo desde `importar_desde` (pega exclusões, que não aparecem na busca).
-- As conexões continuam em contaazul_conexoes (dona: postgres) — a configuração da importação
-- mora numa tabela própria para não exigir migration como postgres.

CREATE TABLE IF NOT EXISTS contaazul_importacao (
  conexao_id          INTEGER PRIMARY KEY,               -- contaazul_conexoes.id
  empresa_id          INTEGER NOT NULL,
  usuario_id          INTEGER NOT NULL,                  -- dono dos lançamentos importados
  importar_desde      DATE NOT NULL,                     -- vencimento a partir do qual entram
  importar_ate        DATE,                              -- e até qual (NULL = sem limite)
  ativo               BOOLEAN NOT NULL DEFAULT true,
  ultima_sync_em      TIMESTAMPTZ,                       -- última passada completa
  ultima_alteracao_em TIMESTAMPTZ,                       -- marco da busca incremental
  erro                TEXT,
  conta_id            VARCHAR(40),                       -- id_empresa do Conta Azul (/v1/pessoas/conta-conectada)
  conta_nome          VARCHAR(255),
  conta_documento     VARCHAR(20),
  -- Conectando pela tela (ativo = false até o Conta Azul devolver a pessoa): a conexão que esta
  -- substitui (reconectar uma que caiu) e a página para onde voltar.
  substitui_conexao_id INTEGER,
  voltar_para         VARCHAR(20),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contaazul_importacao_empresa ON contaazul_importacao (empresa_id);

-- Parcela do Conta Azul ↔ receita ou despesa. Lançamento apagado à mão no Duo continua aqui
-- (id sem linha na tabela de destino): não volta a ser importado.
CREATE TABLE IF NOT EXISTS contaazul_lancamentos (
  conexao_id     INTEGER NOT NULL,
  parcela_id     VARCHAR(40) NOT NULL,
  tipo           VARCHAR(10) NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  receita_id     UUID,
  despesa_id     UUID,
  status_ca      VARCHAR(30) NOT NULL,
  data_alteracao TIMESTAMP,                              -- como o Conta Azul devolve (GMT-3, sem fuso)
  parte_nome     VARCHAR(255),                           -- cliente/fornecedor no Conta Azul (casa com o Asaas)
  -- A mesma conta a receber também está no Asaas: a receita é a do Asaas, que manda nela
  -- (webhook, taxa). A parcela do Conta Azul só fica registrada, sem mexer na receita.
  espelho_asaas  BOOLEAN NOT NULL DEFAULT false,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conexao_id, parcela_id)
);
CREATE INDEX IF NOT EXISTS contaazul_lancamentos_receita ON contaazul_lancamentos (receita_id) WHERE receita_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contaazul_lancamentos_despesa ON contaazul_lancamentos (despesa_id) WHERE despesa_id IS NOT NULL;

-- Limite de vencimento (dono, 09/10/2026: "do início ao fim do ano, sem lançamentos futuros").
ALTER TABLE contaazul_importacao ADD COLUMN IF NOT EXISTS importar_ate DATE;
