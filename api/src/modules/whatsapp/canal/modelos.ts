import { listarTemplates, sendTemplateMessage, TemplateMeta } from '../meta/meta-whatsapp.service';
import { ContaCloud, credenciaisDa } from './contas';

/**
 * Modelos aprovados da WABA de uma empresa, prontos para o CRM usar.
 *
 * Fora da janela de 24h o número oficial só entrega modelo aprovado, então o chat do
 * card, o disparo e (quando houver) o follow-up precisam: listar o que dá para enviar,
 * saber quantas variáveis cada um pede e montar o envio no formato da Meta.
 *
 * Suportamos o que o CRM consegue preencher sozinho: corpo com variáveis (posicionais
 * `{{1}}` ou nomeadas `{{primeiro_nome}}` — o `parameter_format` do modelo decide),
 * cabeçalho de TEXTO (com ou sem variável), rodapé e botões de resposta rápida/URL
 * fixa. Cabeçalho de mídia, botão de URL com variável e modelo de autenticação ficam
 * listados como "não suportado" — enviar sem o parâmetro seria recusado pela Meta.
 */

export interface ModeloCRM {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  status: string;
  formato: 'POSITIONAL' | 'NAMED';
  cabecalho: string | null;
  corpo: string;
  rodape: string | null;
  botoes: string[];
  /** Variáveis do CORPO, na ordem: ['1','2'] ou ['primeiro_nome', …]. */
  variaveis: string[];
  /** Variável do cabeçalho de texto, se houver (a Meta permite uma). */
  variavelCabecalho: string | null;
  suportado: boolean;
  motivoNaoSuportado: string | null;
  /** Por que a Meta recusou (`rejected_reason`), quando recusou. */
  motivoRecusa: string | null;
}

const cache = new Map<string, { em: number; modelos: ModeloCRM[] }>();
const TTL_MS = 5 * 60_000;

function variaveisDe(texto: string): string[] {
  const vistas: string[] = [];
  for (const m of String(texto || '').matchAll(/\{\{\s*([\w]+)\s*\}\}/g)) {
    if (!vistas.includes(m[1])) vistas.push(m[1]);
  }
  return vistas;
}

function paraCRM(t: TemplateMeta): ModeloCRM {
  const comp = t.components ?? [];
  const header = comp.find((c: any) => c.type === 'HEADER');
  const body = comp.find((c: any) => c.type === 'BODY');
  const footer = comp.find((c: any) => c.type === 'FOOTER');
  const buttons = comp.find((c: any) => c.type === 'BUTTONS');

  let motivo: string | null = null;
  if (t.category === 'AUTHENTICATION') motivo = 'Modelo de autenticação (código) não é enviado pelo CRM';
  if (header && header.format && header.format !== 'TEXT') {
    motivo = `Cabeçalho de ${String(header.format).toLowerCase()} ainda não é suportado`;
  }
  const botoes: string[] = [];
  for (const b of buttons?.buttons ?? []) {
    botoes.push(b.text);
    if (b.type === 'URL' && /\{\{/.test(b.url || '')) motivo = 'Botão de link com variável ainda não é suportado';
    if (b.type === 'COPY_CODE' || b.type === 'OTP' || b.type === 'FLOW' || b.type === 'CATALOG' || b.type === 'MPM') {
      motivo = `Botão do tipo ${b.type} ainda não é suportado`;
    }
  }
  const varsHeader = header?.format === 'TEXT' ? variaveisDe(header.text) : [];

  return {
    id: t.id,
    nome: t.name,
    idioma: t.language,
    categoria: t.category,
    status: t.status,
    formato: String(t.parameter_format || 'POSITIONAL').toUpperCase() === 'NAMED' ? 'NAMED' : 'POSITIONAL',
    cabecalho: header?.format === 'TEXT' ? header.text : null,
    corpo: body?.text ?? '',
    rodape: footer?.text ?? null,
    botoes,
    variaveis: variaveisDe(body?.text ?? ''),
    variavelCabecalho: varsHeader[0] ?? null,
    suportado: !motivo && t.status === 'APPROVED',
    motivoNaoSuportado: t.status !== 'APPROVED' ? `Status na Meta: ${t.status}` : motivo,
    motivoRecusa: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
  };
}

export async function listarModelos(conta: ContaCloud, forcar = false): Promise<ModeloCRM[]> {
  const chave = conta.waba_id;
  const guardado = cache.get(chave);
  if (!forcar && guardado && Date.now() - guardado.em < TTL_MS) return guardado.modelos;
  const modelos = (await listarTemplates(200, credenciaisDa(conta))).map(paraCRM);
  cache.set(chave, { em: Date.now(), modelos });
  return modelos;
}

/**
 * Esquece o que está guardado da WABA desta conta.
 *
 * Chamado logo depois de criar um modelo: sem isso o recém-criado só apareceria
 * na tela quando o TTL vencesse, e quem acabou de criá-lo concluiria que falhou.
 */
export function invalidarCacheModelos(conta: ContaCloud): void {
  cache.delete(conta.waba_id);
}

export async function acharModelo(conta: ContaCloud, nome: string, idioma?: string): Promise<ModeloCRM> {
  const todos = await listarModelos(conta);
  const m =
    todos.find((x) => x.nome === nome && (!idioma || x.idioma === idioma)) ??
    (await listarModelos(conta, true)).find((x) => x.nome === nome && (!idioma || x.idioma === idioma));
  if (!m) throw new Error(`Modelo "${nome}" não existe na conta do WhatsApp oficial`);
  if (!m.suportado) throw new Error(`Modelo "${nome}": ${m.motivoNaoSuportado}`);
  return m;
}

export interface ValoresModelo {
  /** Um valor por variável do corpo, na ordem de `modelo.variaveis`. */
  corpo: string[];
  cabecalho?: string | null;
}

/** O texto como o cliente vai ler — é o que fica no histórico do card. */
export function renderizarModelo(modelo: ModeloCRM, valores: ValoresModelo): string {
  const trocar = (texto: string, nomes: string[], vals: string[]) =>
    texto.replace(/\{\{\s*([\w]+)\s*\}\}/g, (inteiro, nome) => {
      const i = nomes.indexOf(nome);
      return i >= 0 && vals[i] != null ? vals[i] : inteiro;
    });
  const partes = [
    modelo.cabecalho
      ? trocar(modelo.cabecalho, modelo.variavelCabecalho ? [modelo.variavelCabecalho] : [], [valores.cabecalho ?? ''])
      : null,
    trocar(modelo.corpo, modelo.variaveis, valores.corpo),
    modelo.rodape,
  ].filter(Boolean);
  return partes.join('\n\n');
}

function parametro(formato: ModeloCRM['formato'], nome: string, valor: string) {
  // A Meta recusa parâmetro vazio (132012). Um espaço não é aceito tampouco; o
  // travessão ao menos deixa a frase legível quando o card não tem o dado.
  const texto = String(valor ?? '').trim() || '-';
  return formato === 'NAMED' ? { type: 'text', parameter_name: nome, text: texto } : { type: 'text', text: texto };
}

export async function enviarModelo(
  conta: ContaCloud,
  destino: string,
  modelo: ModeloCRM,
  valores: ValoresModelo
): Promise<{ messageId?: string; texto: string }> {
  if (valores.corpo.length < modelo.variaveis.length) {
    throw new Error(
      `O modelo "${modelo.nome}" pede ${modelo.variaveis.length} variável(is) no corpo e vieram ${valores.corpo.length}`
    );
  }
  const components: any[] = [];
  if (modelo.variavelCabecalho) {
    components.push({
      type: 'header',
      parameters: [parametro(modelo.formato, modelo.variavelCabecalho, valores.cabecalho ?? '')],
    });
  }
  if (modelo.variaveis.length) {
    components.push({
      type: 'body',
      parameters: modelo.variaveis.map((nome, i) => parametro(modelo.formato, nome, valores.corpo[i])),
    });
  }
  const r = await sendTemplateMessage(
    { to: destino, templateName: modelo.nome, languageCode: modelo.idioma, components },
    credenciaisDa(conta)
  );
  return { messageId: r?.messages?.[0]?.id, texto: renderizarModelo(modelo, valores) };
}
