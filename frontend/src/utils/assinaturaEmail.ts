import type { EmpresaInfo } from '@/types'

/**
 * Assinatura de e-mail do CRM.
 *
 * O padrão NÃO é a assinatura de nenhuma empresa específica: é montado na hora
 * com os dados da empresa do usuário logado (nome, e-mail, telefone, endereço,
 * logo e cor primária de `empresas`) mais o nome de quem envia. Cada usuário
 * pode substituir o HTML em /gestao/perfil (usuarios.assinatura_email).
 */

const COR_PADRAO = '#1F3A63'

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Aceita só http(s) e data:image — o resto vira "sem logo" em vez de virar vetor de injeção. */
function urlLogoSegura(url?: string | null): string | null {
  if (!url) return null
  const limpa = url.trim()
  if (/^https?:\/\//i.test(limpa) || /^data:image\//i.test(limpa)) return escapeHtml(limpa)
  return null
}

function soDigitos(v: string): string {
  return v.replace(/\D/g, '')
}

export interface DadosAssinatura {
  nomeUsuario?: string | null
  emailUsuario?: string | null
  empresa?: (EmpresaInfo & {
    email?: string | null
    telefone?: string | null
    endereco?: string | null
    logo_url?: string | null
    cor_primaria?: string | null
  }) | null
}

export function gerarAssinaturaPadrao({ nomeUsuario, emailUsuario, empresa }: DadosAssinatura): string {
  const nomeEmpresa = empresa?.nome?.trim() || ''
  const cor = /^#[0-9a-f]{6}$/i.test(empresa?.cor_primaria || '') ? empresa!.cor_primaria! : COR_PADRAO
  const logo = urlLogoSegura(empresa?.logo_url)
  const nome = (nomeUsuario || '').trim()
  // e-mail de contato: o da empresa quando houver, senão o de quem envia
  const email = (empresa?.email || emailUsuario || '').trim()
  const telefone = (empresa?.telefone || '').trim()
  const endereco = (empresa?.endereco || '').trim()

  // sem logo e sem nome de empresa (usuário master sem empresa) não há bloco de marca
  const blocoMarca = logo
    ? `<img src="${logo}" width="150" alt="${escapeHtml(nomeEmpresa)}" style="display:block;border:0;max-width:150px;height:auto;" />`
    : nomeEmpresa
      ? `<p style="margin:0;font-size:18px;letter-spacing:3px;font-weight:bold;color:${cor};font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;line-height:1.2;">${escapeHtml(nomeEmpresa)}</p>`
      : ''

  const linhas: string[] = []
  if (nome) {
    const margemTopo = blocoMarca ? 12 : 0
    linhas.push(`<p style="margin:${margemTopo}px 0 0;font-size:13px;font-weight:bold;color:${cor};font-family:Arial,sans-serif;">${escapeHtml(nome)}</p>`)
    if (nomeEmpresa && logo) {
      linhas.push(`<p style="margin:2px 0 0;font-size:11px;color:#888;font-family:Arial,sans-serif;">${escapeHtml(nomeEmpresa)}</p>`)
    }
  }
  if (email) {
    linhas.push(`<p style="margin:8px 0 0;font-size:12px;color:#555;font-family:Arial,sans-serif;">&#9993;&nbsp;<a href="mailto:${escapeHtml(email)}" style="color:#555;text-decoration:none;">${escapeHtml(email)}</a></p>`)
  }
  if (telefone) {
    const wa = soDigitos(telefone)
    const href = wa.length >= 10 ? `https://wa.me/${wa.length <= 11 ? '55' + wa : wa}` : `tel:${wa}`
    linhas.push(`<p style="margin:4px 0 0;font-size:12px;color:#555;font-family:Arial,sans-serif;">&#9742;&nbsp;<a href="${href}" style="color:#555;text-decoration:none;">${escapeHtml(telefone)}</a></p>`)
  }

  const rodape = endereco
    ? `  <tr>
    <td style="padding:12px 0 4px;font-size:10px;color:#bbb;line-height:1.8;border-top:1px solid #eeeeee;font-family:Arial,sans-serif;">
      ${escapeHtml(endereco)}
    </td>
  </tr>
`
    : ''

  const corpo = [blocoMarca, ...linhas].filter(Boolean).map(l => '      ' + l).join('\n')

  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;font-family:Arial,sans-serif;color:#333;">
  <tr>
    <td style="padding:20px 0 14px;">
${corpo}
    </td>
  </tr>
  <tr><td style="height:1px;background-color:${cor};opacity:0.25;font-size:0;line-height:0;padding:0;">&nbsp;</td></tr>
${rodape}</table>`
}

/**
 * Separador que o compositor insere entre o corpo e a assinatura de um disparo
 * de e-mail. É a fronteira usada para desmontar o template depois — mantenha os
 * dois lados (montar/separar) usando ESTA constante, nunca uma cópia literal.
 */
export const SEPARADOR_ASSINATURA =
  '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'

/** Corpo + separador + assinatura. É isto que vai para `disparos_crm.template`. */
export function montarEmailComAssinatura(corpo: string, assinatura: string): string {
  if (!assinatura.trim()) return corpo
  return `${corpo}${SEPARADOR_ASSINATURA}${assinatura}`
}

/**
 * Desfaz `montarEmailComAssinatura`.
 *
 * Existe por causa da edição de agendamento: a assinatura é HTML de e-mail
 * (tabelas, `<td>` lado a lado) e o editor de texto rico não tem nó de tabela —
 * ao receber o template inteiro ele DESCARTA `<table>/<tr>/<td>`, promove cada
 * filho a bloco e devolve isso no `onUpdate`. O resultado era gravado por cima
 * do original: os ícones sociais perdiam o alinhamento e, pior, os `<a href>`
 * em volta deles sumiam. Separando aqui, só o corpo passa pelo editor.
 *
 * Sem o separador (disparo antigo, de WhatsApp, ou já achatado) devolve tudo
 * como corpo: melhor tratar como corpo do que adivinhar onde a assinatura
 * começa e cortar o texto do cliente no lugar errado.
 */
export function separarAssinatura(template: string): { corpo: string; assinatura: string } {
  const i = template.indexOf(SEPARADOR_ASSINATURA)
  if (i === -1) return { corpo: template, assinatura: '' }
  return {
    corpo: template.slice(0, i),
    assinatura: template.slice(i + SEPARADOR_ASSINATURA.length),
  }
}
