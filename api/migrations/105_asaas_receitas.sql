-- 105: receitas do Asaas (06/10/2026). Cada empresa conecta a PRÓPRIA conta do Asaas com a
-- chave de API (o Asaas não tem login OAuth para sistemas de terceiros). Cobrança vira receita
-- na hora, por webhook que a conexão registra sozinha na conta; um job de 6 em 6 horas cobre o
-- que o webhook perder. A chave que o sistema usa para cobrar as assinaturas (ASAAS_API_KEY)
-- não entra aqui: nenhuma conta usa credencial de outra.
-- Sem FK para empresas/usuarios/receitas: o usuário da app não tem REFERENCES nelas (donas: postgres).
CREATE TABLE IF NOT EXISTS asaas_conexoes (
  id                 SERIAL PRIMARY KEY,
  empresa_id         INTEGER NOT NULL UNIQUE,            -- uma conta do Asaas por empresa
  usuario_id         INTEGER NOT NULL,                   -- quem conectou; dono das receitas importadas
  api_key_enc        TEXT NOT NULL,
  conta_nome         VARCHAR(255),
  conta_cnpj         VARCHAR(20),
  webhook_id         VARCHAR(64),
  webhook_token_hash VARCHAR(64) NOT NULL,               -- sha256 do authToken que o Asaas manda de volta
  importar_desde     DATE NOT NULL,                      -- vencimento a partir do qual as cobranças entram
  ultima_sync_em     TIMESTAMPTZ,
  erro               TEXT,                               -- ex.: chave revogada; a tela pede reconectar
  conectado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cobrança do Asaas ↔ receita. Mora fora de `receitas` para não exigir migration como postgres.
-- Receita apagada à mão continua aqui (receita sem linha em `receitas`): não volta a ser importada.
CREATE TABLE IF NOT EXISTS asaas_cobrancas (
  conexao_id     INTEGER NOT NULL,
  payment_id     VARCHAR(40) NOT NULL,
  receita_id     UUID NOT NULL,
  status_asaas   VARCHAR(40) NOT NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conexao_id, payment_id)
);
CREATE INDEX IF NOT EXISTS asaas_cobrancas_receita ON asaas_cobrancas (receita_id);
