import { CATALOGO } from './catalogo';

/**
 * Leitura das notas de um lead como blocos de integração.
 *
 * As notas de um card não são um texto só: são blocos empilhados. O primeiro é o que
 * criou o lead; os seguintes foram ANEXADOS por webhooks que encontraram o telefone já
 * no funil, cada um carimbado com data e hora de São Paulo:
 *
 *     Campanha Grupos LEADS (SendFlow)
 *     Grupo: Desafio 52 Semanas - Vida Próspera
 *     Evento: group.updated.members.added
 *
 *     [06/09/2026, 09:06:56] Formulário Caixa Rápido
 *     Negócio: Funcionário público
 *     E-mail: rozebrum.engenharia@gmail.com
 *     Faturamento hoje: R$ 5k - R$ 10k
 *
 * O parser é deliberadamente genérico: reconhece o bloco pelo catálogo, mas lê os
 * campos por `Rótulo: valor`, sem lista fixa. Um rótulo novo no WordPress vira coluna
 * nova no dashboard sem tocar em código — que é o oposto do que aconteceria com um
 * parser campo a campo.
 */

/** `[06/09/2026, 09:06:56] ` no começo de um bloco anexado. */
const CARIMBO = /^\[(\d{2}\/\d{2}\/\d{4},?\s+\d{2}:\d{2}(?::\d{2})?)\]\s*/;

/** `Rótulo: valor` — rótulo curto e sem `:`, para não confundir com texto corrido. */
const CAMPO = /^\s*([^:|]{2,40}?)\s*:\s*(.*)$/;

/** Valor de campo mais longo que isto vai truncado: o texto inteiro fica no card. */
const MAX_VALOR = 600;

export interface CampoNota {
  chave: string;
  rotulo: string;
  valor: string;
}

export interface BlocoNota {
  /** id do catálogo, ou null quando o bloco não é de nenhuma integração conhecida. */
  integracao: string | null;
  /** Quando o bloco foi anexado (`dd/mm/yyyy, hh:mm:ss`, São Paulo). null = bloco original. */
  carimbo: string | null;
  titulo: string;
  campos: CampoNota[];
}

/** Rótulo → chave estável: sem acento, minúscula, separada por `_`. */
export function chaveDoRotulo(rotulo: string): string {
  return rotulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function reconhecer(linhas: string[]): string | null {
  const primeira = linhas[0] || '';
  const corpo = linhas.join('\n');
  for (const def of CATALOGO) {
    if (def.marcador && def.marcador.test(primeira)) return def.id;
    if (def.marcadorCorpo && def.marcadorCorpo.test(corpo)) return def.id;
  }
  return null;
}

/**
 * Quebra as notas em blocos.
 *
 * A separação é a linha em branco, mas texto livre também tem linha em branco — o
 * "Por que essa pessoa faz sentido" das indicações tem parágrafos. Por isso um pedaço
 * sem carimbo e sem marcador conhecido é tratado como CONTINUAÇÃO do bloco anterior,
 * não como bloco novo: partir o depoimento de um embaixador em três blocos anônimos
 * encheria o dashboard de ruído.
 */
function separarBlocos(notas: string): { carimbo: string | null; linhas: string[] }[] {
  const pedacos = notas.split(/\n[ \t]*\n/);
  const blocos: { carimbo: string | null; linhas: string[] }[] = [];

  for (const pedaco of pedacos) {
    const texto = pedaco.replace(/\r/g, '').trim();
    if (!texto) continue;

    const m = texto.match(CARIMBO);
    const carimbo = m ? m[1] : null;
    const linhas = (m ? texto.slice(m[0].length) : texto).split('\n').map((l) => l.trimEnd());

    if (!carimbo && blocos.length > 0 && reconhecer(linhas) === null) {
      blocos[blocos.length - 1].linhas.push('', ...linhas);
      continue;
    }
    blocos.push({ carimbo, linhas });
  }

  return blocos;
}

function limpar(valor: string): string {
  const v = valor.trim().replace(/\s+\n/g, '\n');
  return v.length > MAX_VALOR ? `${v.slice(0, MAX_VALOR)}…` : v;
}

/**
 * Campos de um bloco.
 *
 * Três formatos convivem nas notas de produção e os três passam por aqui:
 *  - uma linha por campo (`Grupo: ...`) — webhooks de formulário;
 *  - vários campos numa linha separados por ` | ` — o diagnóstico legado;
 *  - rótulo sozinho terminado em `:` e o valor nas linhas seguintes — os depoimentos
 *    das indicações e as listas de prioridades/serviços do diagnóstico.
 */
function lerCampos(linhas: string[]): { titulo: string; campos: CampoNota[] } {
  const campos: CampoNota[] = [];
  let titulo = '';
  let pendente: CampoNota | null = null;

  const guardar = () => {
    if (pendente && pendente.valor.trim()) campos.push({ ...pendente, valor: limpar(pendente.valor) });
    pendente = null;
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) {
      if (pendente) pendente.valor += '\n';
      continue;
    }

    // ` | ` só separa campos quando TODOS os pedaços são `rótulo: valor` — senão um
    // texto livre com barra viraria dois campos truncados.
    const segmentos = linha.split(' | ');
    const todosCampos = segmentos.length > 1 && segmentos.every((s) => CAMPO.test(s));
    const partes = todosCampos ? segmentos : [linha];

    let casou = false;
    for (const parte of partes) {
      const m = parte.match(CAMPO);
      if (!m) continue;
      casou = true;
      guardar();
      const rotulo = m[1].trim();
      pendente = { chave: chaveDoRotulo(rotulo), rotulo, valor: m[2] };
      if (todosCampos) guardar();
    }
    if (casou) continue;

    // Linha que não é campo: título (se for a primeira) ou continuação do valor anterior.
    if (i === 0 && !titulo) {
      titulo = linha.trim();
      continue;
    }
    if (pendente) pendente.valor += (pendente.valor ? '\n' : '') + linha.trim();
    else if (!titulo) titulo = linha.trim();
  }

  guardar();
  return { titulo, campos };
}

/**
 * O nome da campanha do SendFlow mora no título do bloco (`Campanha X (SendFlow)`),
 * não num rótulo. Sem isto não dá para separar duas campanhas rodando no mesmo funil —
 * que é exatamente o que o `campaignName` existe para dizer.
 */
function camposDoTitulo(integracao: string | null, titulo: string): CampoNota[] {
  if (integracao !== 'sendflow') return [];
  const m = titulo.match(/^Campanha\s+(.+?)\s*\(SendFlow\)\s*$/i);
  return m ? [{ chave: 'campanha', rotulo: 'Campanha', valor: m[1].trim() }] : [];
}

export function lerNotas(notas: string | null): BlocoNota[] {
  if (!notas || !notas.trim()) return [];

  return separarBlocos(notas).map(({ carimbo, linhas }) => {
    const integracao = reconhecer(linhas);
    const { titulo, campos } = lerCampos(linhas);
    return {
      integracao,
      carimbo,
      titulo,
      campos: [...camposDoTitulo(integracao, titulo), ...campos],
    };
  });
}
