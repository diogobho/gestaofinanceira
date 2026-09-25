/**
 * Aviso de fim do teste grátis — sai quando falta 1 dia (migration 079).
 *
 * O TESTE ACABA NUMA HORA DE BRASÍLIA, não numa hora de servidor.
 * `assinaturas.trial_expira_em` é `timestamp WITHOUT time zone` gravado a partir
 * de um `new Date()` do processo, que roda em UTC: o que está lá é o INSTANTE em
 * UTC. Quem lê precisa converter — `AT TIME ZONE 'UTC' AT TIME ZONE
 * 'America/Sao_Paulo'` — antes de comparar com "amanhã" e antes de imprimir a
 * hora no e-mail. Sem isso, um teste que termina 21/09 às 21:30 (BRT) é lido
 * como 22/09 e o cliente é avisado no dia em que já perdeu o acesso.
 *
 * O recorte é por DATA de Brasília, não por "faltam 24 horas": quem assinou às
 * 23h e quem assinou às 7h recebem o aviso no mesmo dia útil, de manhã, que é
 * quando a pessoa consegue fazer alguma coisa a respeito.
 *
 * Idempotência é do BANCO, não do processo: `assinaturas.aviso_trial_em` é
 * carimbado com `UPDATE ... WHERE aviso_trial_em IS NULL RETURNING` ANTES do
 * envio. Duas execuções no mesmo dia (ou duas instâncias do cluster) disputam a
 * linha e só uma ganha. Se o envio falhar, o carimbo é desfeito e a próxima
 * execução tenta de novo.
 *
 * Canal: e-mail. WhatsApp ficou de fora de propósito — pelo número oficial
 * (Cloud API) não podemos iniciar conversa fora da janela de 24h sem um modelo
 * aprovado pela Meta, e o único modelo aprovado hoje é de boas-vindas.
 */

import fs from 'fs';
import path from 'path';
import { query } from '../../config/database';
import { enviarEmail, remetenteDuoFuturo } from '../../services/email.service';
import { assinaturaInstitucional, htmlParaTexto, semComentarios } from './onboarding.service';

const DIR_ONBOARDING = process.env.ONBOARDING_DIR || '/var/www/apps/landing/onboarding';
const MOLDE_EMAIL = path.join(DIR_ONBOARDING, 'email-molde.html');
const URL_PLANOS = process.env.APP_URL_PLANOS || 'https://duofuturo.tech/gestao/planos';
/**
 * Endereço que o CLIENTE procura — não o remetente. `DUOFUTURO_REMETENTE_EMAIL`
 * é `master@gestao.com` desde 13/09/2026, e pedir para escrever para ele manda
 * o cliente para uma caixa que não é a do suporte.
 */
const EMAIL_SUPORTE = process.env.EMAIL_SUPORTE_CLIENTE || 'suporte@duofuturo.tech';

/** Chamada do cabeçalho do molde, no lugar do "Sua conta está pronta!". */
const TITULO = 'Seu teste termina amanh&atilde;';

/**
 * "Termina amanhã", no calendário de quem usa o sistema.
 *
 * `$COLUNA` é um `timestamp` naive que guarda o instante em UTC — converter
 * antes de comparar é o ponto inteiro desta regra. Fica exportado para o teste
 * poder exercitar as bordas (23:30 de um dia é o dia seguinte em UTC).
 */
export const SQL_TRIAL_TERMINA_AMANHA = (coluna: string) =>
  `(${coluna} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
     = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1`;

/** A mesma conversão, para imprimir a hora do fim do teste no e-mail. */
export const SQL_EM_BRASILIA = (coluna: string) =>
  // Entre parênteses porque `AT TIME ZONE` prende mais forte que `::` e que `+`:
  // sem eles, um `::date` do chamador cai em cima do nome do fuso.
  `(${coluna} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`;

export interface ContaEmFimDeTrial {
  empresa_id: number;
  empresa_nome: string;
  usuario_id: number;
  usuario_nome: string;
  email: string;
  plano_nome: string | null;
  /** Compromissos à venda, do menor para o maior — só os ativos (21/09/2026). */
  ciclos: { ciclo: string; preco_mensal: number }[] | null;
  /** Já convertido para Brasília, pronto para imprimir. */
  expira_em_brt: string;
  expira_data_brt: string;
}

/**
 * Contas em teste que terminam AMANHÃ no fuso de Brasília e ainda não foram
 * avisadas. O destinatário é o dono da conta (`creator`; `master` como reserva,
 * para as contas criadas antes de 13/09/2026, que nasciam master).
 */
export async function contasParaAvisar(): Promise<ContaEmFimDeTrial[]> {
  const res = await query(
    `SELECT a.empresa_id,
            e.nome  AS empresa_nome,
            u.id    AS usuario_id,
            u.nome  AS usuario_nome,
            u.email,
            p.nome  AS plano_nome,
            (SELECT json_agg(json_build_object('ciclo', c.ciclo, 'preco_mensal', c.preco_mensal::float8)
                             ORDER BY c.meses)
               FROM planos_ciclos c
              WHERE c.plano_id = a.plano_id AND c.ativo) AS ciclos,
            to_char(${SQL_EM_BRASILIA('a.trial_expira_em')}, 'DD/MM/YYYY') || ' às ' ||
            to_char(${SQL_EM_BRASILIA('a.trial_expira_em')}, 'HH24:MI') AS expira_em_brt,
            to_char(${SQL_EM_BRASILIA('a.trial_expira_em')}, 'DD/MM/YYYY') AS expira_data_brt
       FROM assinaturas a
       JOIN empresas e ON e.id = a.empresa_id
       LEFT JOIN planos p ON p.id = a.plano_id
       JOIN LATERAL (
            SELECT u2.id, u2.nome, u2.email
              FROM usuarios u2
             WHERE u2.empresa_id = a.empresa_id
               AND u2.ativo
               AND u2.email IS NOT NULL
             ORDER BY (u2.tipo_usuario = 'creator') DESC,
                      (u2.tipo_usuario = 'master')  DESC,
                      u2.id
             LIMIT 1
       ) u ON true
      WHERE a.status = 'trial'
        AND a.aviso_trial_em IS NULL
        AND a.trial_expira_em IS NOT NULL
        AND ${SQL_TRIAL_TERMINA_AMANHA('a.trial_expira_em')}
      ORDER BY a.trial_expira_em`
  );
  return res.rows;
}

/** Assunto, HTML e texto puro do aviso — também é a prévia da tela. */
export async function montarAviso(
  c: Pick<ContaEmFimDeTrial, 'usuario_nome' | 'empresa_nome' | 'plano_nome' | 'ciclos' | 'expira_em_brt'>
): Promise<{ assunto: string; html: string; texto: string }> {
  const primeiroNome = (c.usuario_nome || '').trim().split(/\s+/)[0] || 'tudo bem';
  const plano = c.plano_nome || 'seu plano';
  // O preço vem dos ciclos À VENDA: o mensal saiu em 21/09/2026, e anunciar o
  // valor dele seria prometer um compromisso que a tela não oferece mais.
  const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}/mês`;
  const opcoes = (c.ciclos || []).map(x => `${reais(x.preco_mensal)} no ${x.ciclo}`);
  const precos = opcoes.length > 1
    ? `${opcoes.slice(0, -1).join(', ')} ou ${opcoes[opcoes.length - 1]}`
    : opcoes[0] || null;

  const assunto = `${primeiroNome}, seu teste do DuoFuturo termina amanhã`;

  const corpo = `
    <p style="margin:0 0 16px;">Oi ${escapar(primeiroNome)},</p>

    <p style="margin:0 0 16px;">
      Passando para avisar com antecedência: o teste grátis da conta
      <strong>${escapar(c.empresa_nome)}</strong> termina <strong>amanhã,
      ${escapar(c.expira_em_brt)}</strong> (horário de Brasília).
    </p>

    <p style="margin:0 0 16px;">
      Para continuar de onde parou — com os seus leads, conversas e lançamentos
      exatamente como estão — é só escolher o plano dentro do sistema. Nada é
      apagado quando o teste acaba.
    </p>

    <p style="margin:0 0 24px;">
      <a href="${URL_PLANOS}"
         style="display:inline-block;background:#243a65;color:#ffffff;text-decoration:none;
                padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
        Escolher meu plano
      </a>
    </p>

    <p style="margin:0 0 16px;">
      Você está no <strong>${escapar(plano)}</strong>${precos ? `: ${precos}` : ''}.
      Quanto maior o compromisso, menor o valor por mês — a comparação aparece
      na mesma tela, sem compromisso de decidir agora.
    </p>

    <p style="margin:0 0 16px;">
      Se ficou alguma dúvida sobre o sistema, ou se preferir conversar antes de
      decidir, responda este e-mail ou escreva para
      <a href="mailto:${EMAIL_SUPORTE}" style="color:#243a65;">${EMAIL_SUPORTE}</a>.
      A gente responde.
    </p>
  `.trim();

  const assinatura = await assinaturaInstitucional();

  let html: string;
  try {
    const molde = fs.readFileSync(MOLDE_EMAIL, 'utf-8');
    if (!molde.includes('<!--CONTEUDO-->')) throw new Error('molde sem marcador de conteúdo');
    // Global (`split`/`join`): com texto simples o `String.replace` troca só a
    // primeira ocorrência — a pegadinha que já deixou um e-mail sem miolo.
    html = molde
      .split('<!--TITULO-->').join(TITULO)
      .split('<!--CONTEUDO-->').join(corpo)
      .split('<!--ASSINATURA-->').join(assinatura);
  } catch {
    console.warn('[avisoTrial] molde não encontrado em', MOLDE_EMAIL);
    html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#333;max-width:600px;">${corpo}${assinatura}</div>`;
  }

  html = semComentarios(html);
  if (!/<html[\s>]/i.test(html)) {
    html =
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
      `<title>${assunto.replace(/</g, '&lt;')}</title></head>` +
      `<body style="margin:0;padding:0;background-color:#F7F8FA;">${html}</body></html>`;
  }

  return { assunto, html, texto: htmlParaTexto(html) };
}

export interface ResultadoAviso {
  empresa_id: number;
  empresa_nome: string;
  email: string;
  expira_em_brt: string;
  enviado: boolean;
  erro?: string;
}

/**
 * Manda o aviso para quem termina o teste amanhã.
 *
 * `aplicar = false` (padrão) apenas lista — nada é carimbado e nada sai. É o
 * modo do script de conferência.
 */
export async function enviarAvisosTrial(aplicar = false): Promise<ResultadoAviso[]> {
  const contas = await contasParaAvisar();
  if (!contas.length) return [];

  const remetente = await remetenteDuoFuturo('DuoFuturo');
  const saida: ResultadoAviso[] = [];

  for (const c of contas) {
    const base = {
      empresa_id: c.empresa_id,
      empresa_nome: c.empresa_nome,
      email: c.email,
      expira_em_brt: c.expira_em_brt,
    };

    if (!aplicar) {
      saida.push({ ...base, enviado: false });
      continue;
    }

    // Carimba ANTES de enviar: quem ganha a linha é quem envia. Duas execuções
    // no mesmo dia não geram dois e-mails.
    const claim = await query(
      `UPDATE assinaturas
          SET aviso_trial_em = now(), updated_at = now()
        WHERE empresa_id = $1 AND status = 'trial' AND aviso_trial_em IS NULL
        RETURNING empresa_id`,
      [c.empresa_id]
    );
    if (claim.rowCount === 0) continue;

    try {
      if (!remetente) throw new Error('remetente institucional indisponível');
      const { assunto, html, texto } = await montarAviso(c);
      await enviarEmail(c.email, assunto, html, remetente, undefined, texto);
      saida.push({ ...base, enviado: true });
    } catch (err: any) {
      // Devolve a linha à fila: melhor tentar de novo amanhã do que engolir.
      await query(`UPDATE assinaturas SET aviso_trial_em = NULL WHERE empresa_id = $1`, [c.empresa_id]);
      saida.push({ ...base, enviado: false, erro: err?.message || String(err) });
    }
  }

  return saida;
}

function escapar(t: string): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
