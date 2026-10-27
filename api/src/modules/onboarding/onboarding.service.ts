import fs from 'fs';
import path from 'path';
import { query } from '../../config/database';
import { enviarEmail, remetenteDuoFuturo } from '../../services/email.service';
import { gerarAssinaturaPadrao, higienizarAssinatura } from '../../utils/assinatura-email';
import { digitosParaGravar, comDDIParaEnvio } from '../crm/_shared/telefone';
import { sendTextMessage, sendDocumentMessage, conferirConfig } from '../whatsapp/meta/meta-whatsapp.service';
import {
  PLANOS,
  PlanoSlug,
  planoSlug,
  ABERTURA,
  assuntoPadrao,
  corpoPadrao,
  whatsappPadrao,
} from './conteudo';

/**
 * Boas-vindas de conta nova: e-mail com o guia do PLANO contratado e, só para
 * quem pediu, o mesmo material pelo WhatsApp oficial.
 *
 * Três regras que desenham tudo o que está aqui:
 *
 * - **Nada nesta pasta pode derrubar o cadastro.** Quando isto roda, empresa,
 *   usuário e cobrança já existem; uma exceção que subisse até o `registrar`
 *   cairia no catch de rollback e apagaria a conta de quem acabou de pagar.
 * - **Nós não iniciamos conversa no WhatsApp.** Pela Cloud API, mensagem para
 *   quem não falou conosco exige modelo aprovado pela Meta. Por isso o cadastro
 *   entrega um link `wa.me` pronto: quem escreve é a pessoa, e a mensagem dela
 *   abre a janela de 24h em que podemos responder com texto livre e o PDF.
 * - **Toda entrega fica registrada** em `onboarding_envios`, com o erro legível
 *   quando falha. Sem isso a equipe só descobre que o e-mail não saiu quando o
 *   cliente reclama.
 */

const DIR_ONBOARDING = process.env.ONBOARDING_DIR || '/var/www/apps/landing/onboarding';
const MOLDE_EMAIL = path.join(DIR_ONBOARDING, 'email-molde.html');

/**
 * Chamada do cabeçalho do molde. Ela era chumbada no HTML, e o molde é o mesmo
 * de todo e-mail de ciclo de vida da conta — o aviso de fim de teste saía com
 * "Sua conta está pronta!" em cima de um texto dizendo que o teste acaba amanhã.
 */
const TITULO_BOAS_VINDAS = 'Sua conta est&aacute; pronta!';
const PDF_GENERICO = 'primeiros-passos-duofuturo-crm.pdf';
const URL_ONBOARDING = 'https://duofuturo.tech/onboarding';

/** Número oficial (Cloud API), como o cliente digita no link do WhatsApp. */
const NUMERO_OFICIAL = process.env.ONBOARDING_WHATSAPP_NUMERO || '5511940524435';

export interface DadosContaNova {
  empresaId: number;
  usuarioId?: number | null;
  nomeEmpresa: string;
  nomeUsuario: string;
  email: string;
  telefone?: string | null;
  planoId?: number | null;
  plano?: string | null;
  /** trial | aguardando_pagamento — muda só a primeira frase do e-mail. */
  assinaturaStatus?: string;
  /** Consentimento LGPD para receber o material também pelo WhatsApp. */
  optinWhatsapp?: boolean;
  optinIp?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modelos (tabela `onboarding_modelos`, semeada na primeira leitura)
// ─────────────────────────────────────────────────────────────────────────────

export interface ModeloOnboarding {
  plano_id: number;
  plano_nome: string;
  slug: PlanoSlug;
  email_assunto: string;
  email_corpo: string;
  whatsapp_texto: string;
  pdf_arquivo: string;
  updated_at?: string;
}

/**
 * O modelo do plano. Se a linha não existe, semeia com o padrão do código —
 * `ON CONFLICT DO NOTHING` porque são 3 instâncias no cluster e todas podem
 * chegar aqui ao mesmo tempo no primeiro cadastro depois do deploy.
 */
export async function getModelo(planoId: number, planoNome?: string | null): Promise<ModeloOnboarding> {
  const slug = planoSlug(planoNome, planoId);

  // Sem plano identificado (registro antigo, dado solto) devolve o padrão em
  // memória: a alternativa era um INSERT com plano_id nulo, que estoura na FK e
  // reprova o e-mail inteiro por causa de um campo que nem é dele.
  if (!planoId) {
    return {
      plano_id: 0,
      plano_nome: planoNome || PLANOS[slug].nome,
      slug,
      email_assunto: assuntoPadrao(slug),
      email_corpo: corpoPadrao(slug),
      whatsapp_texto: whatsappPadrao(slug),
      pdf_arquivo: PLANOS[slug].pdf,
    };
  }

  const existente = await query(
    `SELECT m.*, p.nome AS plano_nome FROM onboarding_modelos m
       JOIN planos p ON p.id = m.plano_id
      WHERE m.plano_id = $1`,
    [planoId]
  );
  if (existente.rows[0]) return { ...existente.rows[0], slug };

  await query(
    `INSERT INTO onboarding_modelos (plano_id, email_assunto, email_corpo, whatsapp_texto, pdf_arquivo)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (plano_id) DO NOTHING`,
    [planoId, assuntoPadrao(slug), corpoPadrao(slug), whatsappPadrao(slug), PLANOS[slug].pdf]
  );

  const criado = await query(
    `SELECT m.*, p.nome AS plano_nome FROM onboarding_modelos m
       JOIN planos p ON p.id = m.plano_id
      WHERE m.plano_id = $1`,
    [planoId]
  );
  return criado.rows[0]
    ? { ...criado.rows[0], slug }
    : {
        plano_id: planoId,
        plano_nome: planoNome || PLANOS[slug].nome,
        slug,
        email_assunto: assuntoPadrao(slug),
        email_corpo: corpoPadrao(slug),
        whatsapp_texto: whatsappPadrao(slug),
        pdf_arquivo: PLANOS[slug].pdf,
      };
}

export async function listarModelos(): Promise<ModeloOnboarding[]> {
  const planos = await query('SELECT id, nome FROM planos WHERE ativo = true ORDER BY id');
  const modelos: ModeloOnboarding[] = [];
  for (const p of planos.rows) modelos.push(await getModelo(p.id, p.nome));
  return modelos;
}

export async function salvarModelo(
  planoId: number,
  dados: Partial<Pick<ModeloOnboarding, 'email_assunto' | 'email_corpo' | 'whatsapp_texto' | 'pdf_arquivo'>>,
  usuarioId: number
): Promise<ModeloOnboarding> {
  await getModelo(planoId); // garante a linha antes do UPDATE

  const campos: string[] = [];
  const params: any[] = [planoId];
  // Filtro opcional: o placeholder é numerado pelo array, nunca chumbado.
  for (const [coluna, valor] of Object.entries(dados)) {
    if (valor === undefined) continue;
    params.push(valor);
    campos.push(`${coluna} = $${params.length}`);
  }
  if (!campos.length) return getModelo(planoId);

  params.push(usuarioId);
  await query(
    `UPDATE onboarding_modelos
        SET ${campos.join(', ')}, atualizado_por = $${params.length}, updated_at = now()
      WHERE plano_id = $1`,
    params
  );
  return getModelo(planoId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do e-mail
// ─────────────────────────────────────────────────────────────────────────────

function primeiroNome(nome: string): string {
  return String(nome || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function aplicarVariaveis(texto: string, dados: { nomeUsuario: string; nomeEmpresa: string; plano: string; abertura?: string }): string {
  return String(texto)
    .replace(/\[Abertura\]/gi, dados.abertura ?? '')
    .replace(/\[PrimeiroNome\]/gi, primeiroNome(dados.nomeUsuario))
    .replace(/\[Nome\]/gi, dados.nomeUsuario)
    .replace(/\[Empresa\]/gi, dados.nomeEmpresa)
    .replace(/\[Plano\]/gi, dados.plano);
}

/**
 * A assinatura da conta institucional (hoje `master@gestao.com`). Quem tem
 * assinatura salva em /gestao/perfil manda a sua; quem não tem recebe a gerada
 * com os dados da própria empresa — a mesma regra do disparo de e-mail do CRM.
 */
export async function assinaturaInstitucional(): Promise<string> {
  const email = process.env.DUOFUTURO_REMETENTE_EMAIL || 'suporte@duofuturo.tech';
  try {
    const res = await query(
      `SELECT u.nome, u.email, u.assinatura_email,
              e.nome AS empresa_nome, e.email AS empresa_email, e.telefone, e.endereco,
              e.logo_url, e.cor_primaria
         FROM usuarios u
         LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE u.email = $1
        LIMIT 1`,
      [email]
    );
    const u = res.rows[0];
    if (!u) return '';
    if (u.assinatura_email && String(u.assinatura_email).trim()) {
      return higienizarAssinatura(u.assinatura_email);
    }
    return gerarAssinaturaPadrao({
      nomeUsuario: u.nome,
      emailUsuario: u.email,
      empresa: {
        nome: u.empresa_nome,
        email: u.empresa_email,
        telefone: u.telefone,
        endereco: u.endereco,
        logo_url: u.logo_url,
        cor_primaria: u.cor_primaria,
      },
    });
  } catch (err: any) {
    console.warn('[onboarding] assinatura institucional indisponível —', err?.message || err);
    return '';
  }
}

/**
 * Tira os comentários HTML antes de enviar. O molde tem um bloco de
 * documentação no topo — anotação de quem mantém o código, com o e-mail da conta
 * institucional e o endereço do painel — e ele ia no código-fonte de CADA e-mail
 * que chegava ao cliente. Comentário condicional do Outlook (`<!--[if mso]>`)
 * é instrução de renderização e fica.
 */
export function semComentarios(html: string): string {
  return html.replace(/<!--(?!\s*\[if)[\s\S]*?-->/g, '');
}

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–',
  middot: '·', rsaquo: '›', lsaquo: '‹', hellip: '…', laquo: '«', raquo: '»',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ', ccedil: 'ç', Ccedil: 'Ç',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', agrave: 'à', Agrave: 'À',
};

/**
 * Versão em texto puro do e-mail (parte `text/plain`). E-mail só com HTML leva
 * `MIME_HTML_ONLY` no SpamAssassin e pesa contra nos filtros da Microsoft — e
 * é o que aparece em quem lê e-mail sem HTML. Link vira "texto (url)".
 */
export function htmlParaTexto(html: string): string {
  return semComentarios(html)
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    // A quebra de linha do CÓDIGO-FONTE não é quebra de linha do texto: quem
    // decide onde o texto quebra são as tags, logo abaixo.
    .replace(/\s+/g, ' ')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, rotulo: string) => {
      const texto = rotulo.replace(/<[^>]+>/g, '').trim();
      if (!texto) return '';
      if (/^mailto:/i.test(href) || texto === href || href.includes(texto)) return texto;
      return `${texto} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    // Número do passo: é um <div> sozinho numa célula, e virava uma linha só
    // com "1" antes do texto do passo.
    .replace(/<div\b[^>]*>\s*(\d+)\s*<\/div>\s*<\/td>/gi, '$1. ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(li|h[1-6]|div|table)>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, nome: string) => ENTIDADES[nome] ?? m)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Assunto + HTML prontos para enviar (ou para a prévia da tela). */
export async function montarEmail(dados: {
  nomeUsuario: string;
  nomeEmpresa: string;
  planoId: number;
  planoNome?: string | null;
  trial: boolean;
}): Promise<{ assunto: string; html: string; texto: string; pdf: string | null; modelo: ModeloOnboarding }> {
  const modelo = await getModelo(dados.planoId, dados.planoNome);
  const vars = {
    nomeUsuario: dados.nomeUsuario,
    nomeEmpresa: dados.nomeEmpresa,
    plano: modelo.plano_nome,
    abertura: aplicarVariaveis(dados.trial ? ABERTURA.trial : ABERTURA.pagante, {
      nomeUsuario: dados.nomeUsuario,
      nomeEmpresa: dados.nomeEmpresa,
      plano: modelo.plano_nome,
    }),
  };

  const corpo = aplicarVariaveis(modelo.email_corpo, vars);
  const assunto = aplicarVariaveis(modelo.email_assunto, vars);
  const assinatura = await assinaturaInstitucional();

  let html: string;
  try {
    const molde = fs.readFileSync(MOLDE_EMAIL, 'utf-8');
    if (!molde.includes('<!--CONTEUDO-->')) {
      throw new Error('o molde não tem o marcador do conteúdo');
    }
    // Substituição GLOBAL: com `String.replace` e texto simples só a primeira
    // ocorrência troca, e o molde já citou o marcador dentro do próprio
    // comentário de documentação uma vez — o e-mail saiu sem miolo e sem
    // assinatura, com o conteúdo enfiado no comentário.
    html = molde
      .split('<!--TITULO-->').join(TITULO_BOAS_VINDAS)
      .split('<!--CONTEUDO-->').join(corpo)
      .split('<!--ASSINATURA-->').join(assinatura);
  } catch {
    // Molde sumiu: melhor um e-mail sem moldura do que nenhum e-mail.
    console.warn('[onboarding] molde não encontrado em', MOLDE_EMAIL);
    html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#333;max-width:600px;">${corpo}${assinatura}</div>`;
  }

  const caminhoPdf = path.join(DIR_ONBOARDING, modelo.pdf_arquivo);
  const pdf = fs.existsSync(caminhoPdf)
    ? caminhoPdf
    : fs.existsSync(path.join(DIR_ONBOARDING, PDF_GENERICO))
      ? path.join(DIR_ONBOARDING, PDF_GENERICO)
      : null;

  html = semComentarios(html);
  // Documento completo, não uma <table> solta: sem doctype, <html> e charset os
  // verificadores acusam "corpo com erros de formatação" e alguns clientes
  // chutam a codificação — e a acentuação vira "Ã©".
  if (!/<html[\s>]/i.test(html)) {
    html =
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
      `<title>${assunto.replace(/</g, '&lt;')}</title></head>` +
      `<body style="margin:0;padding:0;background-color:#F7F8FA;">${html}</body></html>`;
  }
  return { assunto, html, texto: htmlParaTexto(html), pdf, modelo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro da conta nova
// ─────────────────────────────────────────────────────────────────────────────

/** Sem I, O, 0 e 1: o código é lido de um e-mail e digitado num WhatsApp. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sortearCodigo(tamanho = 4): string {
  let s = '';
  for (let i = 0; i < tamanho; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

/**
 * Cria o registro da conta nova e devolve o código do WhatsApp.
 *
 * O chamador (`registrar`) tem que envolver isto no próprio try/catch: falhar
 * aqui não pode desfazer o cadastro. Sem código, o cadastro simplesmente não
 * oferece o botão do WhatsApp — o e-mail segue normalmente.
 */
export async function criarEnvio(dados: DadosContaNova): Promise<{ id: number; codigo: string }> {
  const telefone = digitosParaGravar(dados.telefone);

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = sortearCodigo();
    const res = await query(
      `INSERT INTO onboarding_envios
         (empresa_id, usuario_id, plano_id, plano_nome, assinatura_status, nome_usuario,
          nome_empresa, email, telefone, codigo, whatsapp_optin, optin_em, optin_ip, whatsapp_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (codigo) DO NOTHING
       RETURNING id, codigo`,
      [
        dados.empresaId,
        dados.usuarioId ?? null,
        dados.planoId ?? null,
        dados.plano ?? null,
        dados.assinaturaStatus ?? null,
        dados.nomeUsuario,
        dados.nomeEmpresa,
        dados.email,
        telefone,
        codigo,
        !!dados.optinWhatsapp,
        dados.optinWhatsapp ? new Date() : null,
        dados.optinWhatsapp ? dados.optinIp ?? null : null,
        dados.optinWhatsapp ? 'aguardando_contato' : 'nao_solicitado',
      ]
    );
    if (res.rows[0]) return res.rows[0];
  }
  throw new Error('não foi possível gerar um código de onboarding');
}

/** O link que o cadastro mostra: a pessoa escreve, e a janela de 24h abre. */
export function linkWhatsApp(codigo: string): string {
  const texto = `Quero meu material de boas-vindas (código ${codigo})`;
  return `https://wa.me/${NUMERO_OFICIAL}?text=${encodeURIComponent(texto)}`;
}

/**
 * Envia o e-mail de boas-vindas do envio já registrado. Nunca lança: grava o
 * motivo da falha na própria linha, que é o que a tela de acompanhamento mostra.
 */
export async function enviarEmailDoEnvio(envioId: number): Promise<boolean> {
  const res = await query('SELECT * FROM onboarding_envios WHERE id = $1', [envioId]);
  const envio = res.rows[0];
  if (!envio) return false;

  try {
    const { assunto, html, texto, pdf } = await montarEmail({
      nomeUsuario: envio.nome_usuario,
      nomeEmpresa: envio.nome_empresa,
      planoId: envio.plano_id,
      planoNome: envio.plano_nome,
      trial: envio.assinatura_status === 'trial',
    });

    if (!pdf) console.warn('[onboarding] PDF do plano não encontrado — e-mail sai sem anexo');

    const info = await enviarEmail(
      envio.email,
      assunto,
      html,
      await remetenteDuoFuturo('DuoFuturo'),
      pdf ? [{ filename: `Primeiros passos — ${envio.plano_nome || 'DuoFuturo'}.pdf`, path: pdf }] : undefined,
      texto
    );

    await query(
      `UPDATE onboarding_envios
          SET email_status = 'enviado', email_message_id = $2, email_erro = NULL,
              email_em = now(), updated_at = now()
        WHERE id = $1`,
      [envioId, info.messageId]
    );
    return true;
  } catch (err: any) {
    const motivo = String(err?.message || err).slice(0, 500);
    console.error('[onboarding] e-mail falhou para', envio.email, '—', motivo);
    await query(
      `UPDATE onboarding_envios
          SET email_status = 'falhou', email_erro = $2, updated_at = now()
        WHERE id = $1`,
      [envioId, motivo]
    );
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp oficial — entrega dentro da janela de 24h
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manda texto + PDF do plano.
 *
 * O claim é atômico (`UPDATE ... WHERE whatsapp_status <> 'enviado' RETURNING`):
 * a Meta reentrega o mesmo evento quando não recebe o 200 a tempo, e são 3
 * instâncias no cluster — sem isso o cliente receberia o material em duplicata.
 * Quem não ganha o claim sai calado.
 */
export async function entregarMaterial(
  envioId: number,
  /** Número que escreveu. É ELE que tem a janela de 24h aberta. */
  destinoPreferido?: string | null
): Promise<'enviado' | 'ja_enviado' | 'falhou'> {
  const claim = await query(
    `UPDATE onboarding_envios
        SET whatsapp_status = 'contato_recebido', contato_em = COALESCE(contato_em, now()), updated_at = now()
      WHERE id = $1 AND whatsapp_status <> 'enviado'
      RETURNING *`,
    [envioId]
  );
  const envio = claim.rows[0];
  if (!envio) return 'ja_enviado';

  try {
    const cfg = conferirConfig();
    if (!cfg.configurado) throw new Error(`Cloud API sem configuração: falta ${cfg.faltando.join(', ')}`);

    const modelo = await getModelo(envio.plano_id, envio.plano_nome);
    const texto = aplicarVariaveis(modelo.whatsapp_texto, {
      nomeUsuario: envio.nome_usuario,
      nomeEmpresa: envio.nome_empresa,
      plano: modelo.plano_nome,
    });

    /**
     * O destino é o número que ESCREVEU, não o do cadastro: a janela de 24h
     * pertence a quem mandou a mensagem, e quem pede o material pelo celular
     * pessoal nem sempre digitou aquele número no formulário. Sem a mensagem em
     * mãos (o botão "Enviar material" do painel), usa-se a última recebida
     * daquele envio e, por último, o telefone do cadastro.
     */
    const ultima = destinoPreferido
      ? null
      : await query(
          'SELECT de_numero FROM onboarding_mensagens WHERE envio_id = $1 ORDER BY recebida_em DESC LIMIT 1',
          [envioId]
        );
    const bruto = destinoPreferido || ultima?.rows[0]?.de_numero || envio.telefone;
    const destino = comDDIParaEnvio(digitosParaGravar(bruto) || '');
    const resposta = await sendTextMessage({ to: destino, text: texto });
    await sendDocumentMessage({
      to: destino,
      link: `${URL_ONBOARDING}/${modelo.pdf_arquivo}`,
      filename: `Primeiros passos — ${modelo.plano_nome}.pdf`,
    });

    await query(
      `UPDATE onboarding_envios
          SET whatsapp_status = 'enviado', whatsapp_message_id = $2, whatsapp_erro = NULL,
              whatsapp_em = now(), updated_at = now()
        WHERE id = $1`,
      [envioId, resposta?.messages?.[0]?.id ?? null]
    );
    return 'enviado';
  } catch (err: any) {
    const motivo = String(err?.message || err).slice(0, 500);
    console.error('[onboarding] WhatsApp falhou para o envio', envioId, '—', motivo);
    await query(
      `UPDATE onboarding_envios
          SET whatsapp_status = 'falhou', whatsapp_erro = $2, updated_at = now()
        WHERE id = $1`,
      [envioId, motivo]
    );
    return 'falhou';
  }
}

/** Códigos no texto da mensagem: "(código K7Q2)", "codigo K7Q2", ou o código solto. */
function codigosNoTexto(texto: string): string[] {
  const t = String(texto || '').toUpperCase();
  const achados = new Set<string>();
  const rotulado = t.match(/C[ÓO]DIGO[:\s]*([A-Z0-9]{4})/g) || [];
  for (const m of rotulado) {
    const c = m.match(/([A-Z0-9]{4})$/);
    if (c) achados.add(c[1]);
  }
  for (const p of t.split(/[^A-Z0-9]+/)) {
    if (p.length === 4 && /[A-Z]/.test(p) && /^[A-Z0-9]+$/.test(p)) achados.add(p);
  }
  return [...achados];
}

/**
 * Acha a conta de quem escreveu. O código manda; o telefone é rede de segurança
 * (a pessoa pode apagar o texto sugerido antes de enviar).
 *
 * O telefone sozinho não basta como identificação — dois cadastros podem
 * compartilhar um número —, então ele só vale quando há UM envio aguardando
 * contato naquele número.
 */
async function acharEnvio(texto: string, deNumero: string): Promise<any | null> {
  for (const codigo of codigosNoTexto(texto)) {
    const res = await query('SELECT * FROM onboarding_envios WHERE codigo = $1', [codigo]);
    if (res.rows[0]) return res.rows[0];
  }

  const digitos = digitosParaGravar(deNumero);
  if (!digitos) return null;
  // Variantes do número brasileiro (com e sem o 9, com e sem DDI) — o mesmo
  // problema de sempre: a Meta entrega com DDI, o cadastro grava sem.
  const sufixo = digitos.slice(-8);
  const res = await query(
    `SELECT * FROM onboarding_envios
      WHERE telefone LIKE $1 AND whatsapp_optin = true AND whatsapp_status <> 'enviado'
      ORDER BY criado_at DESC`,
    [`%${sufixo}`]
  );
  return res.rows.length === 1 ? res.rows[0] : null;
}

/**
 * Uma mensagem recebida no número oficial.
 *
 * O INSERT com `ON CONFLICT DO NOTHING RETURNING id` é o dedupe: a Meta
 * reentrega, e quem não inseriu a linha não processa nada.
 */
export async function processarMensagemRecebida(msg: {
  messageId: string;
  de: string;
  tipo?: string;
  texto?: string;
}): Promise<'material_enviado' | 'ja_enviado' | 'falhou' | 'sem_conta' | undefined> {
  const reservado = await query(
    `INSERT INTO onboarding_mensagens (message_id, de_numero, tipo, texto)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING id`,
    [msg.messageId, digitosParaGravar(msg.de) || msg.de, msg.tipo ?? null, msg.texto ?? null]
  );
  const linhaId = reservado.rows[0]?.id;
  if (!linhaId) return; // já processada por outra instância

  const envio = await acharEnvio(msg.texto || '', msg.de);
  if (!envio) {
    // Ninguém é atendido automaticamente por engano: sem conta identificada o
    // material não sai, e a mensagem fica visível para a equipe responder.
    await query(`UPDATE onboarding_mensagens SET desfecho = 'sem_conta' WHERE id = $1`, [linhaId]);
    return 'sem_conta';
  }

  const desfecho = await entregarMaterial(envio.id, msg.de);
  await query(
    `UPDATE onboarding_mensagens SET envio_id = $2, desfecho = $3, erro = $4 WHERE id = $1`,
    [
      linhaId,
      envio.id,
      desfecho === 'enviado' ? 'material_enviado' : desfecho,
      desfecho === 'falhou' ? 'ver onboarding_envios.whatsapp_erro' : null,
    ]
  );
  return desfecho === 'enviado' ? 'material_enviado' : desfecho;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela de acompanhamento
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltrosEnvios {
  dataInicio?: string;
  dataFim?: string;
  planoId?: number;
  status?: string;
  busca?: string;
  limite?: number;
}

export async function listarEnvios(f: FiltrosEnvios = {}) {
  const where: string[] = [];
  const params: any[] = [];
  // Filtro opcional nunca chumba `$n`: o número sai do tamanho do array. Todos
  // os `$?` de uma cláusula viram o MESMO placeholder — é o que deixa a busca
  // usar um parâmetro só nas três colunas.
  const add = (sql: string, valor: any) => {
    params.push(valor);
    where.push(sql.replace(/\$\?/g, `$${params.length}`));
  };

  if (f.dataInicio) add('e.criado_at >= $?::date', f.dataInicio);
  if (f.dataFim) add("e.criado_at < ($?::date + interval '1 day')", f.dataFim);
  if (f.planoId) add('e.plano_id = $?', f.planoId);
  if (f.status === 'email_falhou') where.push("e.email_status = 'falhou'");
  else if (f.status === 'email_enviado') where.push("e.email_status = 'enviado'");
  else if (f.status === 'aguardando_optin') where.push("e.whatsapp_status = 'aguardando_contato'");
  else if (f.status === 'whatsapp_enviado') where.push("e.whatsapp_status = 'enviado'");
  else if (f.status === 'whatsapp_falhou') where.push("e.whatsapp_status = 'falhou'");
  if (f.busca) add('(e.nome_empresa ILIKE $? OR e.nome_usuario ILIKE $? OR e.email ILIKE $?)', `%${f.busca}%`);

  const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const limite = Math.min(Math.max(Number(f.limite) || 200, 1), 1000);

  const res = await query(
    `SELECT e.*, emp.nome AS empresa_atual
       FROM onboarding_envios e
       LEFT JOIN empresas emp ON emp.id = e.empresa_id
       ${sqlWhere}
      ORDER BY e.criado_at DESC
      LIMIT ${limite}`,
    params
  );

  const resumo = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE email_status = 'enviado')::int       AS email_ok,
            count(*) FILTER (WHERE email_status = 'falhou')::int        AS email_falhou,
            count(*) FILTER (WHERE whatsapp_optin)::int                 AS optin,
            count(*) FILTER (WHERE whatsapp_status = 'enviado')::int    AS whatsapp_ok,
            count(*) FILTER (WHERE whatsapp_status = 'falhou')::int     AS whatsapp_falhou
       FROM onboarding_envios e ${sqlWhere}`,
    params
  );

  return { envios: res.rows, resumo: resumo.rows[0] };
}

export async function listarMensagens(limite = 50) {
  const res = await query(
    `SELECT m.*, e.nome_empresa, e.codigo
       FROM onboarding_mensagens m
       LEFT JOIN onboarding_envios e ON e.id = m.envio_id
      ORDER BY m.recebida_em DESC
      LIMIT $1`,
    [Math.min(Math.max(limite, 1), 200)]
  );
  return res.rows;
}

/** "Enviar teste para mim" — o e-mail do plano, sem gravar nada. */
export async function enviarTeste(planoId: number, destino: string, nome: string, trial = true) {
  const { assunto, html, texto, pdf } = await montarEmail({
    nomeUsuario: nome || 'Fulano de Tal',
    nomeEmpresa: 'Empresa de Teste',
    planoId,
    trial,
  });
  return enviarEmail(
    destino,
    `[TESTE] ${assunto}`,
    html,
    await remetenteDuoFuturo('DuoFuturo'),
    pdf ? [{ filename: 'Primeiros passos.pdf', path: pdf }] : undefined,
    texto
  );
}
