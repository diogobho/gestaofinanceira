CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN CREATE TYPE usuario_funcao AS ENUM ('ADMIN','MENTOR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE usuario_status AS ENUM ('ATIVO','INATIVO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cliente_status AS ENUM ('ATIVO','PAUSADO','CONCLUIDO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tipo_sessao AS ENUM ('MENTORIA','COACHING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE modalidade AS ENUM ('ONLINE','PRESENCIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE receita_tipo AS ENUM ('FIXO','VARIAVEL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE receita_status AS ENUM ('PENDENTE','CONFIRMADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE despesa_tipo AS ENUM ('FIXO','VARIAVEL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE despesa_status AS ENUM ('PAGO','PENDENTE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE metodo_pagamento AS ENUM ('BOLETO','CARTAO','TRANSFERENCIA','PIX'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE categoria_despesa AS ENUM ('MARKETING','SOFTWARE','ESCRITORIO','OUTROS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE categoria_receita AS ENUM ('CONSULTORIA','MENTORIA','COACHING','OUTROS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  telefone TEXT,
  funcao usuario_funcao NOT NULL,
  taxa_horaria NUMERIC(12,2),
  comissao_percentual NUMERIC(5,2),
  especialidades TEXT,
  biografia TEXT,
  status usuario_status NOT NULL DEFAULT 'ATIVO',
  ultimo_acesso_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_mentor_campos CHECK ((funcao <> 'MENTOR') OR (taxa_horaria IS NOT NULL AND comissao_percentual IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  cpf TEXT NOT NULL,
  empresa TEXT,
  cargo TEXT,
  como_conheceu TEXT,
  endereco_rua TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  cidade TEXT,
  estado CHAR(2),
  cep TEXT,
  data_nascimento DATE,
  mentor_id UUID NOT NULL REFERENCES usuarios(id),
  status cliente_status NOT NULL DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES usuarios(id),
  tipo_sessao tipo_sessao NOT NULL,
  data DATE NOT NULL,
  horario TIME NOT NULL,
  duracao_minutos INT NOT NULL,
  modalidade modalidade NOT NULL,
  plataforma TEXT,
  link_sessao TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  notas_internas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sessoes_link_if_online CHECK (modalidade <> 'ONLINE' OR link_sessao IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo receita_tipo NOT NULL,
  categoria categoria_receita NOT NULL,
  cliente_id UUID REFERENCES clientes(id),
  data DATE NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  metodo_pagamento metodo_pagamento NOT NULL,
  status receita_status NOT NULL DEFAULT 'PENDENTE',
  parcelado BOOLEAN NOT NULL DEFAULT false,
  parcelas TEXT,
  id_fatura TEXT NOT NULL,
  id_contrato TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT receitas_parcelas_check CHECK (parcelado = false OR (parcelas ~ '^[0-9]+/[0-9]+$'))
);

CREATE TABLE IF NOT EXISTS despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  tipo despesa_tipo NOT NULL,
  categoria categoria_despesa NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  metodo_pagamento metodo_pagamento NOT NULL,
  status despesa_status NOT NULL DEFAULT 'PENDENTE',
  parcelado BOOLEAN NOT NULL DEFAULT false,
  parcelas TEXT,
  recorrente BOOLEAN NOT NULL DEFAULT false,
  id_fatura TEXT NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT despesas_parcelas_check CHECK (parcelado = false OR (parcelas ~ '^[0-9]+/[0-9]+$'))
);

CREATE INDEX IF NOT EXISTS idx_clientes_mentor ON clientes(mentor_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_cliente ON sessoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_receitas_data ON receitas(data);
CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas(data);

CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ language 'plpgsql';

CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessoes_updated_at BEFORE UPDATE ON sessoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_receitas_updated_at BEFORE UPDATE ON receitas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_despesas_updated_at BEFORE UPDATE ON despesas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
