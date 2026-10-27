import crypto from 'crypto';
import { pool } from '../../config/database';
import { env } from '../../config/env';

/**
 * Conta Azul — OAuth2 (Amazon Cognito), com VÁRIAS contas por empresa.
 *
 * Particularidades confirmadas contra o servidor de autorização em 07/08/2026:
 *  - `client_credentials` responde `invalid_scope`: fluxo máquina-a-máquina NÃO
 *    está habilitado. O único caminho é authorization_code + refresh_token.
 *  - O access_token dura 60 minutos. O que sustenta a integração é o refresh_token.
 *  - A autenticação no /oauth2/token é HTTP Basic com client_id:client_secret.
 *
 * Desde a migration 066 a unidade de trabalho é a CONEXÃO (`contaazul_conexoes`),
 * não a empresa: a Panteras tem duas contas do Conta Azul, uma por produto, e o
 * dashboard soma as duas. Cada conexão tem o seu par client_id/client_secret
 * porque **o refresh_token só vale para o client que o emitiu** — usar o Basic
 * de uma conexão para renovar o token da outra devolve `invalid_client`.
 *
 * O que continua global no .env: CONTAAZUL_REDIRECT_URI (tem que ser idêntica em
 * todos os apps cadastrados no portal), CONTAAZUL_SETUP_SECRET e
 * CONTAAZUL_EMPRESA_ID.
 */

const AUTH_BASE = 'https://auth.contaazul.com';
const AUTHORIZE_URL = `${AUTH_BASE}/login`;
const TOKEN_URL = `${AUTH_BASE}/oauth2/token`;

// Escopos usados pelo portal do Conta Azul. `aws.cognito.signin.user.admin` é o
// que permite renovar sem novo consentimento.
const SCOPES = 'openid profile aws.cognito.signin.user.admin';

const STATE_TTL_MIN = 15;
// Renova com folga: se falta menos que isso, trata como vencido.
const MARGEM_RENOVACAO_SEG = 300;
const MAX_FALHAS_RENOVACAO = 5;

export interface ContaAzulTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
}

export interface Conexao {
  id: number;
  empresa_id: number;
  nome: string;
  client_id: string;
  client_secret: string;
  ativo: boolean;
  ordem: number;
}

/** Situação de uma conexão, sem expor token. */
export interface StatusConexao {
  conexao_id: number;
  nome: string;
  ativo: boolean;
  autorizado: boolean;
  expira_em: string | null;
  ultima_renovacao: string | null;
  renovacao_falhas: number;
  ultimo_erro: string | null;
  access_token_valido: boolean;
}

function basicAuth(conexao: Conexao): string {
  return Buffer.from(`${conexao.client_id}:${conexao.client_secret}`).toString('base64');
}

/** O que é comum a todas as conexões. Sem isso nenhuma delas funciona. */
function configurado(): boolean {
  return Boolean(env.CONTAAZUL_REDIRECT_URI);
}

async function obterConexao(conexaoId: number): Promise<Conexao> {
  const { rows } = await pool.query(
    `SELECT id, empresa_id, nome, client_id, client_secret, ativo, ordem
       FROM contaazul_conexoes WHERE id = $1`,
    [conexaoId]
  );
  if (!rows[0]) throw new Error(`Conexão ${conexaoId} do Conta Azul não existe`);
  return rows[0] as Conexao;
}

/** Conexões da empresa. `somenteAtivas` é o que o dashboard usa. */
async function listarConexoes(empresaId: number, somenteAtivas = false): Promise<Conexao[]> {
  const { rows } = await pool.query(
    `SELECT id, empresa_id, nome, client_id, client_secret, ativo, ordem
       FROM contaazul_conexoes
      WHERE empresa_id = $1 ${somenteAtivas ? 'AND ativo' : ''}
      ORDER BY ordem, id`,
    [empresaId]
  );
  return rows as Conexao[];
}

/** Conexões ativas QUE JÁ têm token — as que o dashboard consegue consultar. */
async function listarConexoesAutorizadas(empresaId: number): Promise<Conexao[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.empresa_id, c.nome, c.client_id, c.client_secret, c.ativo, c.ordem
       FROM contaazul_conexoes c
       JOIN contaazul_tokens t ON t.conexao_id = c.id
      WHERE c.empresa_id = $1 AND c.ativo
      ORDER BY c.ordem, c.id`,
    [empresaId]
  );
  return rows as Conexao[];
}

/** Monta a URL de consentimento e registra o state (uso único). */
async function iniciarAutorizacao(conexaoId: number, usuarioId?: number): Promise<string> {
  if (!configurado()) {
    throw new Error('Conta Azul não configurado: falta CONTAAZUL_REDIRECT_URI no .env');
  }
  const conexao = await obterConexao(conexaoId);

  const state = crypto.randomBytes(24).toString('hex');
  await pool.query(
    `INSERT INTO contaazul_oauth_states (state, empresa_id, conexao_id, usuario_id, expira_em)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)`,
    [state, conexao.empresa_id, conexao.id, usuarioId ?? null, String(STATE_TTL_MIN)]
  );

  const q = new URLSearchParams({
    response_type: 'code',
    client_id: conexao.client_id,
    redirect_uri: env.CONTAAZUL_REDIRECT_URI,
    state,
    scope: SCOPES,
  });
  return `${AUTHORIZE_URL}?${q.toString()}`;
}

/** Consome o state. Retorna null se inexistente/expirado (uso único). */
async function consumirState(
  state: string
): Promise<{ empresa_id: number; conexao_id: number | null; usuario_id: number | null } | null> {
  const { rows } = await pool.query(
    `DELETE FROM contaazul_oauth_states
      WHERE state = $1 AND expira_em > now()
      RETURNING empresa_id, conexao_id, usuario_id`,
    [state]
  );
  return rows[0] ?? null;
}

async function chamarToken(
  conexao: Conexao,
  body: Record<string, string>
): Promise<ContaAzulTokens> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(conexao)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  const texto = await resp.text();
  let dados: any;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error(
      `Conta Azul respondeu algo que não é JSON (HTTP ${resp.status}): ${texto.slice(0, 200)}`
    );
  }

  if (!resp.ok) {
    const erro = dados?.error || 'erro_desconhecido';
    const desc = dados?.error_description ? ` — ${dados.error_description}` : '';
    throw new Error(
      `Conta Azul recusou a conexão "${conexao.nome}" (HTTP ${resp.status}): ${erro}${desc}`
    );
  }
  return dados as ContaAzulTokens;
}

async function salvarTokens(
  conexao: Conexao,
  t: ContaAzulTokens,
  refreshAnterior?: string
): Promise<void> {
  // Numa renovação o Cognito costuma NÃO devolver refresh_token novo — preserva o atual.
  const refresh = t.refresh_token || refreshAnterior;
  if (!refresh) throw new Error('Resposta sem refresh_token e não havia um anterior para preservar');

  const expiraSeg = t.expires_in ?? 3600;
  await pool.query(
    `INSERT INTO contaazul_tokens
       (empresa_id, conexao_id, access_token, refresh_token, token_type, scope, expira_em,
        ultima_renovacao, renovacao_falhas, ultimo_erro, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval, now(), 0, NULL, now())
     ON CONFLICT (conexao_id) DO UPDATE SET
       empresa_id       = EXCLUDED.empresa_id,
       access_token     = EXCLUDED.access_token,
       refresh_token    = EXCLUDED.refresh_token,
       token_type       = EXCLUDED.token_type,
       scope            = EXCLUDED.scope,
       expira_em        = EXCLUDED.expira_em,
       ultima_renovacao = now(),
       renovacao_falhas = 0,
       ultimo_erro      = NULL,
       updated_at       = now()`,
    [
      conexao.empresa_id,
      conexao.id,
      t.access_token,
      refresh,
      t.token_type ?? null,
      t.scope ?? null,
      String(expiraSeg),
    ]
  );
}

/** Troca o `code` do callback por access_token + refresh_token. */
async function trocarCodePorTokens(code: string, conexaoId: number): Promise<ContaAzulTokens> {
  const conexao = await obterConexao(conexaoId);
  const t = await chamarToken(conexao, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.CONTAAZUL_REDIRECT_URI, // precisa ser idêntico ao do /authorize
  });
  await salvarTokens(conexao, t);
  return t;
}

/** Renova usando o refresh_token guardado desta conexão. */
async function renovar(conexaoId: number): Promise<string> {
  const conexao = await obterConexao(conexaoId);
  const { rows } = await pool.query(
    `SELECT refresh_token, renovacao_falhas FROM contaazul_tokens WHERE conexao_id = $1`,
    [conexaoId]
  );
  const reg = rows[0];
  if (!reg) throw new Error(`Conexão "${conexao.nome}" não autorizada no Conta Azul`);
  if (reg.renovacao_falhas >= MAX_FALHAS_RENOVACAO) {
    throw new Error(
      `Renovação da conexão "${conexao.nome}" desistiu após ${MAX_FALHAS_RENOVACAO} falhas — ` +
        `é preciso autorizar de novo em /api/gestao/contaazul/authorize?conexao=${conexaoId}`
    );
  }

  try {
    const t = await chamarToken(conexao, {
      grant_type: 'refresh_token',
      refresh_token: reg.refresh_token,
    });
    await salvarTokens(conexao, t, reg.refresh_token);
    return t.access_token;
  } catch (err: any) {
    await pool.query(
      `UPDATE contaazul_tokens
          SET renovacao_falhas = renovacao_falhas + 1, ultimo_erro = $2, updated_at = now()
        WHERE conexao_id = $1`,
      [conexaoId, String(err.message).slice(0, 500)]
    );
    throw err;
  }
}

/**
 * Token pronto para uso: devolve o atual se ainda tem folga, senão renova.
 * É esta a função que o resto do sistema deve chamar.
 */
async function getAccessToken(conexaoId: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT access_token, EXTRACT(EPOCH FROM (expira_em - now())) AS restam
       FROM contaazul_tokens WHERE conexao_id = $1`,
    [conexaoId]
  );
  const reg = rows[0];
  if (!reg) throw new Error(`Conexão ${conexaoId} não autorizada no Conta Azul`);
  if (reg.access_token && Number(reg.restam) > MARGEM_RENOVACAO_SEG) return reg.access_token;
  return renovar(conexaoId);
}

/** Situação de cada conexão da empresa, sem expor token. */
async function status(empresaId: number) {
  const { rows } = await pool.query(
    `SELECT c.id AS conexao_id, c.nome, c.ativo, c.ordem,
            (t.id IS NOT NULL)                          AS autorizado,
            t.expira_em, t.ultima_renovacao,
            COALESCE(t.renovacao_falhas, 0)             AS renovacao_falhas,
            t.ultimo_erro,
            COALESCE(t.expira_em > now(), false)        AS access_token_valido
       FROM contaazul_conexoes c
       LEFT JOIN contaazul_tokens t ON t.conexao_id = c.id
      WHERE c.empresa_id = $1
      ORDER BY c.ordem, c.id`,
    [empresaId]
  );
  return {
    configurado: configurado(),
    redirect_uri: env.CONTAAZUL_REDIRECT_URI || null,
    // Continua valendo a leitura antiga "a integração está de pé?": pelo menos uma
    // conexão ativa e autorizada.
    autorizado: rows.some((r) => r.autorizado && r.ativo),
    conexoes: rows as StatusConexao[],
  };
}

/** Chamada autenticada à API do Conta Azul, renovando o token se preciso. */
async function api(conexaoId: number, caminho: string, init: RequestInit = {}) {
  const token = await getAccessToken(conexaoId);
  const url = caminho.startsWith('http')
    ? caminho
    : `https://api-v2.contaazul.com${caminho.startsWith('/') ? '' : '/'}${caminho}`;

  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
}

/** Remove states vencidos (o /callback já consome o usado). */
async function limparStatesExpirados(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM contaazul_oauth_states WHERE expira_em <= now()`
  );
  return rowCount ?? 0;
}

export const contaazulService = {
  configurado,
  obterConexao,
  listarConexoes,
  listarConexoesAutorizadas,
  iniciarAutorizacao,
  consumirState,
  trocarCodePorTokens,
  renovar,
  getAccessToken,
  status,
  api,
  limparStatesExpirados,
  SCOPES,
};
