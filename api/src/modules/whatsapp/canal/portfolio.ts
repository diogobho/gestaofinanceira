import { query } from '../../../config/database';
import { decrypt, encrypt } from '../../../utils/crypto';
import { pagamentoPendente } from '../meta/embedded-signup.service';

/**
 * O portfólio da Meta da EMPRESA (097) — um portfólio, uma conta do WhatsApp (WABA) e
 * um cartão por empresa, como fazem os provedores de mercado.
 *
 * A referência nasce na primeira conexão, que só o dono da conta (creator) faz. Os
 * números seguintes da equipe são criados nessa WABA pela API, ou — os que vêm do app
 * WhatsApp Business — passam pela janela e precisam cair neste mesmo portfólio.
 */

export interface PortfolioEmpresa {
  empresa_id: number;
  business_id: string;
  business_nome: string | null;
  waba_id: string;
  token_enc: string;
  definido_por: number | null;
  definido_em: string;
}

export async function portfolioDaEmpresa(empresaId: number): Promise<PortfolioEmpresa | null> {
  const r = await query(`SELECT * FROM whatsapp_portfolio_empresa WHERE empresa_id = $1`, [empresaId]);
  return r.rows[0] ?? null;
}

export function tokenDoPortfolio(p: PortfolioEmpresa): string {
  return decrypt(p.token_enc);
}

/** Grava a referência. A primeira vence: duas conexões ao mesmo tempo não brigam por ela. */
export async function definirPortfolio(dados: {
  empresaId: number;
  businessId: string;
  businessNome: string | null;
  wabaId: string;
  token: string;
  usuarioId: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO whatsapp_portfolio_empresa (empresa_id, business_id, business_nome, waba_id, token_enc, definido_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (empresa_id) DO NOTHING`,
    [dados.empresaId, dados.businessId, dados.businessNome, dados.wabaId, encrypt(dados.token), dados.usuarioId]
  );
  pagamentoCache.delete(dados.empresaId);
}

// A tela pergunta a cada visita; a Meta não precisa responder a cada uma.
const pagamentoCache = new Map<number, { em: number; pendente: boolean | null }>();
const PAGAMENTO_TTL_MS = 10 * 60_000;

export async function pagamentoPendenteDaEmpresa(p: PortfolioEmpresa): Promise<boolean | null> {
  const c = pagamentoCache.get(p.empresa_id);
  if (c && Date.now() - c.em < PAGAMENTO_TTL_MS) return c.pendente;
  const pendente = await pagamentoPendente(p.waba_id, tokenDoPortfolio(p));
  pagamentoCache.set(p.empresa_id, { em: Date.now(), pendente });
  return pendente;
}

/** Nome do dono da conta — é a quem a tela manda o operador pedir o primeiro passo. */
export async function nomeDoCreator(empresaId: number): Promise<string | null> {
  const r = await query(
    `SELECT nome FROM usuarios WHERE empresa_id = $1 AND tipo_usuario = 'creator' AND ativo = true ORDER BY id LIMIT 1`,
    [empresaId]
  );
  return r.rows[0]?.nome ?? null;
}
