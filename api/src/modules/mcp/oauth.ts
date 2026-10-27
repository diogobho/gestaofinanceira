import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database';

/**
 * OAuth 2.1 do conector MCP (112, 23/10/2026).
 *
 * O Claude da pessoa descobre tudo sozinho: chama o MCP sem token, recebe 401 com o
 * endereço dos metadados, registra-se como cliente (registro dinâmico, RFC 7591),
 * abre a tela de login do Duo com PKCE (S256) e troca o código por um token. O token
 * é do USUÁRIO — o Claude passa a ver e fazer só o que ele já pode nas telas.
 *
 * Emissor = a origem do site. Os `/.well-known/oauth-*` da raiz chegam aqui por um
 * location do nginx; o resto vive sob /api/gestao/oauth (o nginx tira o /gestao).
 */
export const ORIGEM = (process.env.MCP_ORIGEM || 'https://duofuturo.tech').replace(/\/$/, '');
export const URL_MCP = `${ORIGEM}/api/gestao/mcp`;
const URL_OAUTH = `${ORIGEM}/api/gestao/oauth`;

const ACCESS_MS = 24 * 3600 * 1000;
const REFRESH_MS = 90 * 24 * 3600 * 1000;
const CODIGO_MS = 10 * 60 * 1000;

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const aleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function metadadosRecurso() {
  return {
    resource: URL_MCP,
    authorization_servers: [ORIGEM],
    scopes_supported: ['duo'],
    bearer_methods_supported: ['header'],
    resource_name: 'Duo — CRM e Financeiro com IA',
  };
}

export function metadadosServidor() {
  return {
    issuer: ORIGEM,
    authorization_endpoint: `${URL_OAUTH}/authorize`,
    token_endpoint: `${URL_OAUTH}/token`,
    registration_endpoint: `${URL_OAUTH}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['duo'],
  };
}

/** Só https, ou http em localhost (Claude Code/Desktop recebem o retorno na máquina). */
function redirectAceito(u: unknown): u is string {
  if (typeof u !== 'string' || u.length > 500) return false;
  try {
    const url = new URL(u);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

// Tentativas de login por IP: 10 a cada 15 min, na memória da instância (são 3; o
// teto efetivo fica em 30 — suficiente para deter adivinhação de senha).
const tentativas = new Map<string, { n: number; ate: number }>();
function podeTentar(ip: string): boolean {
  const agora = Date.now();
  const t = tentativas.get(ip);
  if (!t || t.ate < agora) { tentativas.set(ip, { n: 1, ate: agora + 15 * 60000 }); return true; }
  t.n++;
  return t.n <= 10;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function paginaLogin(p: Record<string, string>, nomeCliente: string, erro?: string) {
  const ocultos = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource']
    .map(k => `<input type="hidden" name="${k}" value="${esc(p[k])}">`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar ao Duo</title>
<style>
:root{--navy:#13264C;--dourado:#D2B773;--bg:#F7F5F0;--txt:#1F2430;--sub:#5B6270;--card:#fff;--borda:#E4DFD6}
@media (prefers-color-scheme:dark){:root{--bg:#0F172A;--txt:#F1F5F9;--sub:#94A3B8;--card:#1E293B;--borda:#334155}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--txt);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--borda);border-radius:16px;padding:28px}
h1{font-size:1.3rem;margin:0 0 4px;color:var(--txt)}p{margin:0 0 16px;color:var(--sub);font-size:.95rem}
label{display:block;font-size:.9rem;margin:12px 0 4px}input[type=email],input[type=password]{width:100%;padding:10px 12px;border:1px solid var(--borda);border-radius:10px;font:inherit;background:transparent;color:var(--txt)}
button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--navy);color:#fff;font:600 1rem system-ui;cursor:pointer}
button:focus-visible,input:focus-visible{outline:3px solid var(--dourado);outline-offset:2px}
.erro{background:#FEE2E2;color:#991B1B;border-radius:10px;padding:10px 12px;font-size:.9rem;margin-bottom:12px}
ul{margin:0 0 8px;padding-left:20px;color:var(--sub);font-size:.9rem}
</style></head><body><main>
<h1>Conectar o ${esc(nomeCliente)} ao Duo</h1>
<p>Entre com o seu login do Duo. O assistente vai ver e fazer só o que você já pode no sistema.</p>
<ul><li>Consultar o financeiro, o CRM e as conversas</li><li>Lançar, editar, mover e mandar mensagens, sempre pedindo a sua confirmação antes</li><li>Nunca exclui nada</li></ul>
${erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : ''}
<form method="post" action="${URL_OAUTH}/authorize">${ocultos}
<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required value="${esc(p.email)}">
<label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required>
<button type="submit">Entrar e autorizar</button>
</form></main></body></html>`;
}

async function cliente(clientId: unknown) {
  if (typeof clientId !== 'string' || !clientId) return null;
  const r = await query(`SELECT client_id, nome, redirect_uris FROM mcp_oauth_clientes WHERE client_id = $1`, [clientId]);
  return r.rows[0] || null;
}

/** Valida os parâmetros do pedido de autorização. Devolve a mensagem do erro ou null. */
async function validarPedido(p: Record<string, any>) {
  const c = await cliente(p.client_id);
  if (!c) return { erro: 'Aplicativo não registrado. Conecte de novo pelo seu assistente.' };
  if (!Array.isArray(c.redirect_uris) || !c.redirect_uris.includes(p.redirect_uri)) {
    return { erro: 'Endereço de retorno não confere com o registrado.' };
  }
  if (p.response_type && p.response_type !== 'code') return { erro: 'Tipo de resposta não suportado.' };
  if (p.code_challenge_method !== 'S256' || typeof p.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) {
    return { erro: 'Pedido sem PKCE (S256).' };
  }
  return { cliente: c };
}

async function emitirTokens(clientId: string, usuarioId: number, empresaId: number) {
  const access = aleatorio();
  const refresh = aleatorio();
  await query(
    `INSERT INTO mcp_oauth_tokens (access_hash, refresh_hash, client_id, usuario_id, empresa_id, access_expira_em, refresh_expira_em)
     VALUES ($1, $2, $3, $4, $5, now() + ($6::bigint * interval '1 millisecond'), now() + ($7::bigint * interval '1 millisecond'))`,
    [sha256(access), sha256(refresh), clientId, usuarioId, empresaId, ACCESS_MS, REFRESH_MS]
  );
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_MS / 1000, refresh_token: refresh, scope: 'duo' };
}

const router = Router();
const form = express.urlencoded({ extended: false, limit: '20kb' });

router.post('/oauth/register', async (req: Request, res: Response) => {
  try {
    const uris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris : [];
    if (uris.length === 0 || uris.length > 10 || !uris.every(redirectAceito)) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris precisa de https (ou http em localhost).' });
    }
    const nome = typeof req.body?.client_name === 'string' ? req.body.client_name.slice(0, 200) : 'Assistente de IA';
    const clientId = `duo_${aleatorio(18)}`;
    await query(
      `INSERT INTO mcp_oauth_clientes (client_id, nome, redirect_uris) VALUES ($1, $2, $3)`,
      [clientId, nome, JSON.stringify(uris)]
    );
    res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: nome,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  } catch (err: any) {
    console.error('[MCP OAuth] register', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/oauth/authorize', async (req: Request, res: Response) => {
  const p = req.query as Record<string, string>;
  const v = await validarPedido(p);
  // Sem cliente/redirect válido não dá para devolver o erro ao app: mostra aqui.
  if (!v.cliente) return res.status(400).type('html').send(paginaLogin(p, 'assistente', v.erro));
  res.type('html').send(paginaLogin(p, v.cliente.nome || 'assistente'));
});

router.post('/oauth/authorize', form, async (req: Request, res: Response) => {
  const p = (req.body || {}) as Record<string, string>;
  const v = await validarPedido(p);
  if (!v.cliente) return res.status(400).type('html').send(paginaLogin(p, 'assistente', v.erro));
  const nome = v.cliente.nome || 'assistente';

  if (!podeTentar(String(req.headers['x-real-ip'] || req.ip))) {
    return res.status(429).type('html').send(paginaLogin(p, nome, 'Muitas tentativas. Espere 15 minutos e tente de novo.'));
  }
  const email = String(p.email || '').trim().toLowerCase();
  const u = (await query(
    `SELECT id, senha, empresa_id, ativo FROM usuarios WHERE lower(email) = $1 LIMIT 1`, [email]
  )).rows[0];
  const ok = u && u.ativo && u.empresa_id && await bcrypt.compare(String(p.senha || ''), u.senha || '');
  if (!ok) return res.status(401).type('html').send(paginaLogin(p, nome, 'E-mail ou senha incorretos.'));

  const codigo = aleatorio();
  await query(
    `INSERT INTO mcp_oauth_codigos (codigo_hash, client_id, usuario_id, redirect_uri, code_challenge, expira_em)
     VALUES ($1, $2, $3, $4, $5, now() + ($6::bigint * interval '1 millisecond'))`,
    [sha256(codigo), p.client_id, u.id, p.redirect_uri, p.code_challenge, CODIGO_MS]
  );
  const volta = new URL(p.redirect_uri);
  volta.searchParams.set('code', codigo);
  if (p.state) volta.searchParams.set('state', p.state);
  res.redirect(302, volta.toString());
});

router.post('/oauth/token', form, async (req: Request, res: Response) => {
  const b = req.body || {};
  const erro = (code: string, desc: string, status = 400) => res.status(status).json({ error: code, error_description: desc });
  try {
    if (b.grant_type === 'authorization_code') {
      // Uso único: marcar como usado é o próprio claim.
      const r = await query(
        `UPDATE mcp_oauth_codigos SET usado_em = now()
          WHERE codigo_hash = $1 AND usado_em IS NULL AND expira_em > now()
          RETURNING client_id, usuario_id, redirect_uri, code_challenge`,
        [sha256(String(b.code || ''))]
      );
      const c = r.rows[0];
      if (!c || c.client_id !== b.client_id || c.redirect_uri !== b.redirect_uri) return erro('invalid_grant', 'Código inválido ou expirado.');
      const desafio = crypto.createHash('sha256').update(String(b.code_verifier || '')).digest('base64url');
      if (desafio !== c.code_challenge) return erro('invalid_grant', 'code_verifier não confere.');
      const u = (await query(`SELECT empresa_id FROM usuarios WHERE id = $1 AND ativo`, [c.usuario_id])).rows[0];
      if (!u?.empresa_id) return erro('invalid_grant', 'Usuário inativo.');
      return res.json(await emitirTokens(c.client_id, c.usuario_id, u.empresa_id));
    }

    if (b.grant_type === 'refresh_token') {
      // Rotação: o refresh usado é revogado junto do access dele.
      const r = await query(
        `UPDATE mcp_oauth_tokens SET revogado_em = now()
          WHERE refresh_hash = $1 AND revogado_em IS NULL AND refresh_expira_em > now()
          RETURNING client_id, usuario_id, empresa_id`,
        [sha256(String(b.refresh_token || ''))]
      );
      const t = r.rows[0];
      if (!t || (b.client_id && b.client_id !== t.client_id)) return erro('invalid_grant', 'Refresh token inválido.');
      const u = (await query(`SELECT empresa_id FROM usuarios WHERE id = $1 AND ativo`, [t.usuario_id])).rows[0];
      if (!u || Number(u.empresa_id) !== Number(t.empresa_id)) return erro('invalid_grant', 'Usuário inativo.');
      return res.json(await emitirTokens(t.client_id, t.usuario_id, t.empresa_id));
    }
    return erro('unsupported_grant_type', 'Use authorization_code ou refresh_token.');
  } catch (err: any) {
    console.error('[MCP OAuth] token', err.message);
    return erro('server_error', 'Erro interno.', 500);
  }
});

// Metadados: na raiz do site (via nginx) e também aqui embaixo, para quem procura pelo caminho.
const recurso = (_req: Request, res: Response) => res.json(metadadosRecurso());
const servidor = (_req: Request, res: Response) => res.json(metadadosServidor());
router.get(/^\/\.well-known\/oauth-protected-resource(\/.*)?$/, recurso);
router.get(/^\/\.well-known\/oauth-authorization-server(\/.*)?$/, servidor);
router.get(/^\/\.well-known\/openid-configuration(\/.*)?$/, servidor);
router.get('/mcp/.well-known/oauth-protected-resource', recurso);
router.get('/oauth/.well-known/oauth-authorization-server', servidor);

/** Token do header → usuário (e marca o último uso, que a tela de conexões mostra). */
export async function usuarioDoToken(authorization: unknown): Promise<{ usuarioId: number; empresaId: number } | null> {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  const h = sha256(authorization.slice(7).trim());
  const r = await query(
    `UPDATE mcp_oauth_tokens SET ultimo_uso_em = now()
      WHERE access_hash = $1 AND revogado_em IS NULL AND access_expira_em > now()
      RETURNING usuario_id, empresa_id`,
    [h]
  );
  const t = r.rows[0];
  return t ? { usuarioId: Number(t.usuario_id), empresaId: Number(t.empresa_id) } : null;
}

export default router;
