/**
 * Esqueci minha senha (migration 087, 28/09/2026).
 *
 * Até aqui não havia caminho: quem esquecia a senha dependia da equipe. O fluxo
 * é o de sempre — pedir o link, receber por e-mail, criar a senha nova —, com
 * quatro regras que não são enfeite:
 *
 * - **A resposta ao pedido é sempre a mesma**, exista o e-mail ou não. Dizer
 *   "e-mail não encontrado" transforma a tela em consulta de quem é cliente.
 *   Pelo mesmo motivo o e-mail sai sem `await`: esperar o SMTP só quando a conta
 *   existe denunciaria pelo tempo de resposta.
 * - **O banco guarda só o SHA-256 do token.** Quem lê a tabela (dump, backup,
 *   consulta de suporte) não troca a senha de ninguém.
 * - **Uso único é do banco**: `UPDATE ... WHERE usado_em IS NULL RETURNING` — com
 *   3 instâncias no cluster, de dois cliques no mesmo link um vence.
 * - **Sai pelo remetente institucional** (`remetenteDuoFuturo`, o SMTP da conta
 *   DuoFuturo), não pelo da empresa do cliente: quem esqueceu a senha pode ser
 *   justamente de uma empresa sem SMTP configurado.
 *
 * Limite: 3 pedidos por usuário e 10 por IP na última hora. Passou disso, a
 * resposta continua a mesma e nada sai — o limite também não pode denunciar.
 *
 * O JWT não tem revogação: trocar a senha não derruba uma sessão já aberta, que
 * vive até as 8h dela acabarem.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { enviarEmail, remetenteDuoFuturo } from '../../services/email.service';
import { assinaturaInstitucional, htmlParaTexto, semComentarios } from '../onboarding/onboarding.service';

export const VALIDADE_MINUTOS = 60;
export const MAX_POR_USUARIO_HORA = 3;
export const MAX_POR_IP_HORA = 10;
export const SENHA_MINIMA = 8;

const DIR_ONBOARDING = process.env.ONBOARDING_DIR || '/var/www/apps/landing/onboarding';
const MOLDE_EMAIL = path.join(DIR_ONBOARDING, 'email-molde.html');
const URL_REDEFINIR = process.env.APP_URL_REDEFINIR_SENHA || 'https://duofuturo.tech/gestao/redefinir-senha';
const EMAIL_SUPORTE = process.env.EMAIL_SUPORTE_CLIENTE || 'suporte@duofuturo.tech';
const TITULO = 'Vamos criar uma senha nova';

export const MSG_PEDIDO =
  'Se esse e-mail estiver cadastrado, você vai receber em instantes um link para criar uma senha nova. Confira também o lixo eletrônico.';
export const MSG_LINK_INVALIDO =
  'Este link não vale mais: ele já foi usado ou passou de 1 hora. Peça um novo em "Esqueci minha senha".';

export function hashDoToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function gerarToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashDoToken(token) };
}

/** Token que nem tem a forma de um nosso não vai ao banco. */
export function tokenBemFormado(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Mesma régua do "Alterar senha" do perfil. Devolve o problema, ou null. */
export function problemaNaSenha(senha: unknown): string | null {
  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    return `A senha precisa ter no mínimo ${SENHA_MINIMA} caracteres.`;
  }
  if (senha.length > 72) return 'A senha pode ter no máximo 72 caracteres.'; // teto do bcrypt
  return null;
}

/** `di***@escolapanthers.com.br` — confirma a conta na tela sem expor o e-mail inteiro. */
export function mascararEmail(email: string): string {
  const [nome, dominio] = String(email || '').split('@');
  if (!dominio) return '';
  const visivel = nome.slice(0, Math.min(2, Math.max(1, nome.length - 1)));
  return `${visivel}***@${dominio}`;
}

function escapar(t: string): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function montarEmail(nome: string, link: string): Promise<{ assunto: string; html: string; texto: string }> {
  const primeiroNome = (nome || '').trim().split(/\s+/)[0] || 'tudo bem';
  const assunto = 'Seu link para criar uma senha nova no DuoFuturo';

  const corpo = `
    <p style="margin:0 0 16px;">Oi ${escapar(primeiroNome)},</p>

    <p style="margin:0 0 16px;">
      Recebemos um pedido para criar uma senha nova na sua conta do DuoFuturo.
      É só clicar no botão abaixo e escolher a nova senha.
    </p>

    <p style="margin:0 0 24px;">
      <a href="${escapar(link)}"
         style="display:inline-block;background:#243a65;color:#ffffff;text-decoration:none;
                padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
        Criar senha nova
      </a>
    </p>

    <p style="margin:0 0 16px;">
      O link vale por <strong>1 hora</strong> e funciona uma vez só. Se o botão não
      abrir, copie e cole este endereço no navegador:<br />
      <span style="word-break:break-all;color:#243a65;">${escapar(link)}</span>
    </p>

    <p style="margin:0 0 16px;">
      Não pediu nada disso? Pode ignorar este e-mail: a sua senha continua a mesma.
      Se achar estranho, fale com a gente em
      <a href="mailto:${EMAIL_SUPORTE}" style="color:#243a65;">${EMAIL_SUPORTE}</a>.
    </p>
  `.trim();

  const assinatura = await assinaturaInstitucional();

  let html: string;
  try {
    const molde = fs.readFileSync(MOLDE_EMAIL, 'utf-8');
    if (!molde.includes('<!--CONTEUDO-->')) throw new Error('molde sem marcador de conteúdo');
    // Global (`split`/`join`): `String.replace` troca só a primeira ocorrência.
    html = molde
      .split('<!--TITULO-->').join(TITULO)
      .split('<!--CONTEUDO-->').join(corpo)
      .split('<!--ASSINATURA-->').join(assinatura);
  } catch {
    console.warn('[senha] molde não encontrado em', MOLDE_EMAIL);
    html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#333;max-width:600px;">${corpo}${assinatura}</div>`;
  }

  html = semComentarios(html);
  if (!/<html[\s>]/i.test(html)) {
    html =
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
      `<title>${escapar(assunto)}</title></head>` +
      `<body style="margin:0;padding:0;background-color:#F7F8FA;">${html}</body></html>`;
  }

  return { assunto, html, texto: htmlParaTexto(html) };
}

/**
 * Pede o link. Nunca lança por causa do e-mail e nunca diz se a conta existe:
 * quem chama responde sempre `MSG_PEDIDO`.
 */
export async function pedirRedefinicao(email: unknown, ip: string): Promise<void> {
  const alvo = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!alvo || alvo.length > 255 || !alvo.includes('@')) return;

  const porIp = await query(
    `SELECT count(*)::int AS n FROM senha_redefinicoes WHERE ip = $1 AND criado_em > now() - interval '1 hour'`,
    [ip]
  );
  if (porIp.rows[0].n >= MAX_POR_IP_HORA) {
    console.warn(`[senha] limite por IP atingido (${ip})`);
    return;
  }

  const u = (
    await query(
      `SELECT id, nome, email FROM usuarios WHERE lower(email) = $1 AND coalesce(ativo, true) ORDER BY id LIMIT 1`,
      [alvo]
    )
  ).rows[0];
  if (!u) return;

  const porUsuario = await query(
    `SELECT count(*)::int AS n FROM senha_redefinicoes WHERE usuario_id = $1 AND criado_em > now() - interval '1 hour'`,
    [u.id]
  );
  if (porUsuario.rows[0].n >= MAX_POR_USUARIO_HORA) {
    console.warn(`[senha] limite por usuário atingido (usuário ${u.id})`);
    return;
  }

  // O link novo aposenta os anteriores: só o e-mail mais recente vale.
  await query(`UPDATE senha_redefinicoes SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL`, [u.id]);

  const { token, hash } = gerarToken();
  await query(
    `INSERT INTO senha_redefinicoes (usuario_id, token_hash, expira_em, ip)
     VALUES ($1, $2, now() + make_interval(mins => $3), $4)`,
    [u.id, hash, VALIDADE_MINUTOS, ip]
  );

  const link = `${URL_REDEFINIR}?token=${token}`;
  // Sem await: o tempo de resposta não pode depender de a conta existir.
  void (async () => {
    try {
      const cred = await remetenteDuoFuturo();
      if (!cred) throw new Error('remetente institucional sem SMTP');
      const { assunto, html, texto } = await montarEmail(u.nome, link);
      await enviarEmail(u.email, assunto, html, cred, undefined, texto);
      console.log(`[senha] link de redefinição enviado ao usuário ${u.id}`);
    } catch (e: any) {
      console.error(`[senha] falha ao enviar o link ao usuário ${u.id}:`, e?.message || e);
    }
  })();
}

/** O link ainda vale? A tela pergunta antes de mostrar o formulário. */
export async function conferirToken(token: unknown): Promise<{ valido: boolean; email?: string }> {
  if (!tokenBemFormado(token)) return { valido: false };
  const r = await query(
    `SELECT u.email FROM senha_redefinicoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.usado_em IS NULL AND s.expira_em > now() AND coalesce(u.ativo, true)`,
    [hashDoToken(token)]
  );
  if (!r.rows[0]) return { valido: false };
  return { valido: true, email: mascararEmail(r.rows[0].email) };
}

/**
 * Troca a senha. Lança `Error` com a mensagem para a tela quando o link não vale
 * ou a senha não passa na régua.
 */
export async function redefinirSenha(token: unknown, novaSenha: unknown): Promise<void> {
  const problema = problemaNaSenha(novaSenha);
  if (problema) throw new Error(problema);
  if (!tokenBemFormado(token)) throw new Error(MSG_LINK_INVALIDO);

  // Queima o token ANTES de trocar a senha: de dois envios simultâneos, só um passa.
  const r = await query(
    `UPDATE senha_redefinicoes SET usado_em = now()
      WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()
      RETURNING usuario_id`,
    [hashDoToken(token)]
  );
  const usuarioId = r.rows[0]?.usuario_id;
  if (!usuarioId) throw new Error(MSG_LINK_INVALIDO);

  const hash = await bcrypt.hash(novaSenha as string, 10);
  const up = await query(`UPDATE usuarios SET senha = $1 WHERE id = $2 AND coalesce(ativo, true) RETURNING id`, [hash, usuarioId]);
  if (!up.rows[0]) throw new Error(MSG_LINK_INVALIDO);

  await query(`UPDATE senha_redefinicoes SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL`, [usuarioId]);
  console.log(`[senha] senha redefinida pelo link (usuário ${usuarioId})`);
}
