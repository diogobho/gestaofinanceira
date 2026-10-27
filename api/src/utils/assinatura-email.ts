/**
 * Assinatura de e-mail gerada a partir dos dados da empresa — a versão de
 * servidor de `frontend/src/utils/assinaturaEmail.ts`.
 *
 * Existe porque o e-mail de boas-vindas é montado pela API, sem navegador por
 * perto, e ele termina com a assinatura da conta institucional. Quando o usuário
 * tem `usuarios.assinatura_email` salva, é ELA que vale; isto aqui é o padrão de
 * quem nunca abriu /gestao/perfil.
 *
 * **Nunca chumbar a assinatura de um cliente como padrão.** Até 13/08/2026 o
 * default era o HTML do Instituto Totem e ele aparecia para todas as empresas.
 *
 * Mantenha a saída igual à do frontend: as duas geram a mesma assinatura para a
 * mesma empresa, e é isso que faz o e-mail e a tela combinarem.
 */

const COR_PADRAO = '#1F3A63';

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Aceita só http(s) e data:image — o resto vira "sem logo", não vetor de injeção. */
function urlLogoSegura(url?: string | null): string | null {
  if (!url) return null;
  const limpa = String(url).trim();
  if (/^https?:\/\//i.test(limpa) || /^data:image\//i.test(limpa)) return escapeHtml(limpa);
  return null;
}

export interface EmpresaAssinatura {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  logo_url?: string | null;
  cor_primaria?: string | null;
}

export function gerarAssinaturaPadrao(dados: {
  nomeUsuario?: string | null;
  emailUsuario?: string | null;
  empresa?: EmpresaAssinatura | null;
}): string {
  const { nomeUsuario, emailUsuario, empresa } = dados;
  const nomeEmpresa = empresa?.nome?.trim() || '';
  const cor = /^#[0-9a-f]{6}$/i.test(empresa?.cor_primaria || '') ? empresa!.cor_primaria! : COR_PADRAO;
  const logo = urlLogoSegura(empresa?.logo_url);
  const nome = (nomeUsuario || '').trim();
  const email = (empresa?.email || emailUsuario || '').trim();
  const telefone = (empresa?.telefone || '').trim();
  const endereco = (empresa?.endereco || '').trim();

  const blocoMarca = logo
    ? `<img src="${logo}" width="150" alt="${escapeHtml(nomeEmpresa)}" style="display:block;border:0;max-width:150px;height:auto;" />`
    : nomeEmpresa
      ? `<p style="margin:0;font-size:18px;letter-spacing:3px;font-weight:bold;color:${cor};font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;line-height:1.2;">${escapeHtml(nomeEmpresa)}</p>`
      : '';

  const linhas: string[] = [];
  if (nome) {
    const margemTopo = blocoMarca ? 12 : 0;
    linhas.push(`<p style="margin:${margemTopo}px 0 0;font-size:13px;font-weight:bold;color:${cor};font-family:Arial,sans-serif;">${escapeHtml(nome)}</p>`);
    if (nomeEmpresa && logo) {
      linhas.push(`<p style="margin:2px 0 0;font-size:11px;color:#888;font-family:Arial,sans-serif;">${escapeHtml(nomeEmpresa)}</p>`);
    }
  }
  if (email) {
    linhas.push(`<p style="margin:8px 0 0;font-size:12px;color:#555;font-family:Arial,sans-serif;">&#9993;&nbsp;<a href="mailto:${escapeHtml(email)}" style="color:#555;text-decoration:none;">${escapeHtml(email)}</a></p>`);
  }
  if (telefone) {
    const wa = telefone.replace(/\D/g, '');
    const href = wa.length >= 10 ? `https://wa.me/${wa.length <= 11 ? '55' + wa : wa}` : `tel:${wa}`;
    linhas.push(`<p style="margin:4px 0 0;font-size:12px;color:#555;font-family:Arial,sans-serif;">&#9742;&nbsp;<a href="${href}" style="color:#555;text-decoration:none;">${escapeHtml(telefone)}</a></p>`);
  }

  const rodape = endereco
    ? `  <tr>
    <td style="padding:12px 0 4px;font-size:10px;color:#bbb;line-height:1.8;border-top:1px solid #eeeeee;font-family:Arial,sans-serif;">
      ${escapeHtml(endereco)}
    </td>
  </tr>
`
    : '';

  const corpo = [blocoMarca, ...linhas].filter(Boolean).map(l => '      ' + l).join('\n');

  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;font-family:Arial,sans-serif;color:#333;">
  <tr>
    <td style="padding:20px 0 14px;">
${corpo}
    </td>
  </tr>
  <tr><td style="height:1px;background-color:${cor};opacity:0.25;font-size:0;line-height:0;padding:0;">&nbsp;</td></tr>
${rodape}</table>`;
}

/**
 * Higieniza HTML de assinatura vindo do banco antes de colar num e-mail que a
 * API monta: fora `<script>`, atributos `on*` e `javascript:`. Mesma regra do
 * cabeçalho do relatório em PDF.
 */
export function higienizarAssinatura(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}
