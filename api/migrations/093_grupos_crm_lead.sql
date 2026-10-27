-- 093 — Levar para o CRM quem entra no grupo (01/10/2026)
--
-- Regra por grupo e por chip (o dono da porta que está no grupo): quem entrar vira lead
-- no funil/etapa escolhidos, sem depender de boas-vindas. Substitui a
-- `grupos_boas_vindas_lead` (30/09), que amarrava o lead à boas-vindas ligada e nunca foi
-- usada (zero linhas em 01/10/2026).
-- Roda como o usuário da API, e o serviço também a cria sozinho (`garantirTabelaBotao`).

CREATE TABLE IF NOT EXISTS grupos_crm_lead (
  usuario_id     INTEGER      NOT NULL,
  grupo_id       VARCHAR(100) NOT NULL,
  empresa_id     INTEGER      NOT NULL,
  grupo_nome     VARCHAR(255),
  funil_id       INTEGER      NOT NULL,
  estagio_id     INTEGER,
  responsavel_id INTEGER,
  origem         VARCHAR(50),
  ativa          BOOLEAN      NOT NULL DEFAULT true,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, grupo_id)
);

-- Rodízio de responsável (01/10/2026): os leads se dividem por igual entre estes usuários;
-- `rodizio_pos` é o ponteiro, que anda num UPDATE atômico.
ALTER TABLE grupos_crm_lead ADD COLUMN IF NOT EXISTS distribuir_entre INTEGER[];
ALTER TABLE grupos_crm_lead ADD COLUMN IF NOT EXISTS rodizio_pos INTEGER NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS grupos_boas_vindas_lead;
