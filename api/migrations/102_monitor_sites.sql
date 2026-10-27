-- 102: monitoramento de sites (06/10/2026). Pedido do dono: avisar no WhatsApp quando abrir
-- vaga na agenda do CadÚnico de Caucaia. Genérico: o site está "fechado" enquanto a página
-- contiver algum dos `textos_fechado`; sumiram todos = abriu. Só a conta master@gestao.com vê.
CREATE TABLE IF NOT EXISTS monitor_sites (
  id                 SERIAL PRIMARY KEY,
  nome               VARCHAR(120) NOT NULL,
  url                TEXT NOT NULL,
  textos_fechado     TEXT[] NOT NULL DEFAULT '{}',
  destino            VARCHAR(20) NOT NULL,          -- número que recebe o aviso
  remetente_id       INTEGER NOT NULL,              -- usuário cujo WhatsApp envia (12 = oficial 11 94052-4435)
  intervalo_min      INTEGER NOT NULL DEFAULT 3 CHECK (intervalo_min BETWEEN 1 AND 1440),
  avisar_fechamento  BOOLEAN NOT NULL DEFAULT true,
  ativo              BOOLEAN NOT NULL DEFAULT true,
  estado             VARCHAR(10),                   -- 'aberto' | 'fechado' | NULL (nunca leu)
  estado_desde       TIMESTAMP,
  ultimo_check_at    TIMESTAMP,
  ultimo_erro        TEXT,
  erros_seguidos     INTEGER NOT NULL DEFAULT 0,
  ultimo_aviso_at    TIMESTAMP,
  ultimo_aviso_erro  TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT now()
);
