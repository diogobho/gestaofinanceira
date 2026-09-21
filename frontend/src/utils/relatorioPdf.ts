/**
 * Relatório em PDF — documento próprio, impresso de um iframe isolado.
 *
 * O relatório NÃO é a tela mandada para a impressora. É um documento montado do
 * zero, em A4 e SEMPRE em tema claro, dentro de um iframe com CSS próprio. Isso
 * evita as duas armadilhas de imprimir a página do app:
 *
 *  - o bloco "DARK MODE — Overrides globais" do `index.css` pintaria o PDF de
 *    cinza-800 (ver CLAUDE.md, "Modo escuro");
 *  - o app autenticado é `h-screen` com rolagem interna, então a impressora
 *    receberia só a primeira dobra.
 *
 * O PDF sai pelo diálogo do navegador ("Salvar como PDF"), que é o destino
 * padrão no Chrome/Edge e existe em Firefox, Safari e no celular. Foi a escolha
 * ante embarcar um gerador de PDF (jsPDF + html2canvas passam de 1 MB e
 * rasterizam texto e gráfico) ou renderizar no servidor (a API não tem
 * navegador headless, e mandar HTML do cliente para renderizar lá é vetor de
 * SSRF).
 */

/* --------------------------------------------------------------- tipos --- */

export interface ItemResumo {
  rotulo: string
  valor: string
  /** linha pequena embaixo do número (composição, base de cálculo…) */
  detalhe?: string
  /** cor do número — hex de tema CLARO, o papel é branco */
  cor?: string
}

export interface BlocoRelatorio {
  titulo?: string
  descricao?: string
  /** HTML já montado (use `tabelaHtml`, `capturarGrafico`, `listaValoresHtml`) */
  html: string
  /** ocupa metade da largura, para dois blocos lado a lado */
  metade?: boolean
}

export interface RelatorioPdf {
  titulo: string
  subtitulo?: string
  /** descrição do recorte: período e filtros aplicados */
  periodo?: string
  /** HTML da assinatura do usuário (`usuarios.assinatura_email`) — vira o cabeçalho */
  assinaturaHtml?: string | null
  resumo?: ItemResumo[]
  blocos: BlocoRelatorio[]
  /** vira o `document.title`, que o Chrome sugere como nome do arquivo */
  nomeArquivo?: string
  notaRodape?: string
}

/* ----------------------------------------------------------- auxiliares --- */

export function escaparHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface ColunaTabela {
  titulo: string
  alinhar?: 'esquerda' | 'direita'
  /** não quebra linha — data, parcela, situação curta; quem cede é a coluna de texto livre */
  semQuebra?: boolean
  /**
   * Largura mínima sugerida (`'18%'`). Sem ela a tabela automática dá quase
   * tudo à coluna de maior conteúdo — um nome de cliente longo — e espreme a
   * vizinha até "Conversão CRM" quebrar em duas linhas.
   */
  largura?: string
}

/**
 * Tabela do relatório. As células chegam como TEXTO — o escape é feito aqui.
 * `total` vira a linha de soma no pé da tabela.
 */
export function tabelaHtml(
  colunas: ColunaTabela[],
  linhas: (string | number)[][],
  total?: (string | number)[]
): string {
  if (linhas.length === 0) {
    return '<p class="vazio">Sem dados no período com os filtros atuais.</p>'
  }
  const alinhamento = colunas.map((c) => {
    const classes = [c.alinhar === 'direita' && 'dir', c.semQuebra && 'nw'].filter(Boolean)
    return classes.length ? ` class="${classes.join(' ')}"` : ''
  })
  const cabecalho = colunas
    .map((c, i) => {
      const largura = c.largura ? ` style="width:${escaparHtml(c.largura)}"` : ''
      return `<th${alinhamento[i]}${largura}>${escaparHtml(c.titulo)}</th>`
    })
    .join('')
  const linhaHtml = (linha: (string | number)[]) =>
    `<tr>${linha.map((celula, i) => `<td${alinhamento[i] ?? ''}>${escaparHtml(celula)}</td>`).join('')}</tr>`
  const corpo = linhas.map(linhaHtml).join('')
  const pe = total ? `<tfoot>${linhaHtml(total)}</tfoot>` : ''
  return `<table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody>${pe}</table>`
}

/** Lista rótulo → valor, para composições curtas que não merecem tabela. */
export function listaValoresHtml(
  itens: { rotulo: string; valor: string; cor?: string }[]
): string {
  if (itens.length === 0) return '<p class="vazio">Sem valores para exibir.</p>'
  return `<ul class="lista">${itens
    .map(
      (i) =>
        `<li><span class="lista-rotulo">${
          i.cor ? `<span class="ponto" style="background:${escaparHtml(i.cor)}"></span>` : ''
        }${escaparHtml(i.rotulo)}</span><span class="lista-valor">${escaparHtml(i.valor)}</span></li>`
    )
    .join('')}</ul>`
}

const ATRIBUTOS_DE_COR = ['fill', 'stroke', 'stop-color', 'flood-color']

/** Largura útil do A4 retrato com as margens do `@page`: 210mm − 2×10mm. */
export const LARGURA_PAPEL = 718
/** Um bloco `metade`, já descontado o `gap` de 14px da `.linha`. */
export const LARGURA_PAPEL_METADE = Math.floor((LARGURA_PAPEL - 14) / 2)

/** Tamanhos de texto que o papel comporta: menor não se lê, maior grita. */
const FONTE_MIN = 9
const FONTE_MAX = 13

/**
 * Copia um gráfico já renderizado na tela (SVG do recharts) para o relatório.
 *
 * `mapaCores` troca hex por hex — é o que traz um gráfico desenhado no tema
 * ESCURO de volta para o claro: no papel branco, texto de eixo em `#9ca3af`
 * some. Sem o mapa, a cópia sai idêntica à tela.
 *
 * Três coisas que a cópia crua NÃO resolvia, e que aqui são resolvidas de
 * propósito (o SVG é vetorial: quem manda no resultado é o viewBox):
 *
 *  1. **O tamanho do texto dependia da largura da TELA.** Esticar o SVG para
 *     100% do papel amplia o eixo junto: num card de 500px o eixo de 12px sai
 *     com 19px no papel (o dobro do texto do corpo); num monitor largo, em que
 *     o mesmo card tem 900px, sai com 9px. Mesmo botão, resultados opostos.
 *     Agora a escala do desenho e o tamanho da fonte são calculados um contra o
 *     outro: o eixo sai sempre no tamanho em que foi desenhado, entre 9 e 13px.
 *  2. **Rótulo na borda saía cortado.** O `LabelList` do último ponto extrapola
 *     o viewBox (medido: 12px além dos 500). O que vaza cai fora da margem do
 *     papel e some no meio da palavra ("R$ 2", "R$").
 *  3. **Faixa morta embaixo.** A legenda do recharts é HTML sobreposta, mas o
 *     SVG reserva a altura dela mesmo assim — 34px de nada, e a legenda copiada
 *     vinha ainda mais abaixo.
 *
 * O `getBBox()` do SVG dá a caixa do que foi REALMENTE desenhado e resolve 2 e
 * 3 de uma vez: recortar por ela inclui o que vazou e descarta o que sobrou.
 */
export function capturarGrafico(
  seletor: string,
  opts: {
    mapaCores?: Record<string, string>
    /** largura do bloco no papel — `LARGURA_PAPEL_METADE` num bloco `metade` */
    larguraAlvo?: number
    /** teto de altura: um gráfico não pode comer meia página */
    alturaMax?: number
  } = {}
): string {
  const raiz = document.querySelector(seletor)
  if (!raiz) return ''

  // Cuidado: no recharts 3 o ÍCONE DE CADA LEGENDA também é `svg.recharts-surface`
  // (14x14), e ele vem antes do gráfico no DOM — pegar o primeiro copiava um
  // quadradinho de legenda esticado para a largura toda. Vale o maior SVG que
  // não esteja dentro da legenda.
  const candidatos = Array.from(raiz.querySelectorAll('svg')).filter(
    (el) => !el.closest('.recharts-legend-wrapper')
  )
  const area = (el: SVGSVGElement) =>
    (Number(el.getAttribute('width')) || el.clientWidth || 0) *
    (Number(el.getAttribute('height')) || el.clientHeight || 0)
  const svg = candidatos.reduce<SVGSVGElement | null>(
    (maior, el) => (!maior || area(el) > area(maior) ? el : maior),
    null
  )
  if (!svg) return ''

  const clone = svg.cloneNode(true) as SVGSVGElement
  const largura = Number(svg.getAttribute('width')) || svg.clientWidth
  const altura = Number(svg.getAttribute('height')) || svg.clientHeight
  if (!(largura > 0) || !(altura > 0)) return ''

  const larguraAlvo = opts.larguraAlvo ?? LARGURA_PAPEL
  const alturaMax = opts.alturaMax ?? 300
  const RESPIRO = 4

  // Tamanho que cada texto deve ter NO PAPEL. O recharts define o tamanho por
  // CSS do elemento pai, não por atributo no <text>, daí o getComputedStyle.
  const textosOriginais = Array.from(svg.querySelectorAll('text'))
  const alvos = textosOriginais.map((t) => {
    const atual = parseFloat(getComputedStyle(t).fontSize)
    return Number.isFinite(atual) && atual > 0
      ? Math.min(FONTE_MAX, Math.max(FONTE_MIN, atual))
      : 0
  })
  const textosClone = Array.from(clone.querySelectorAll('text'))

  // O texto é desenhado em unidades de usuário e depois multiplicado pela
  // escala: gravar `alvo / escala` faz sair `alvo` no papel.
  const aplicarFontes = (escala: number) => {
    textosClone.forEach((destino, i) => {
      const alvo = alvos[i]
      if (!alvo) return
      destino.setAttribute('font-size', `${(alvo / escala).toFixed(2)}px`)
      // O `style` inline do LabelList traz o font-size da TELA e venceria o
      // atributo: some com ele. Cor e peso ficam nos atributos.
      const estilo = destino.getAttribute('style')
      if (estilo && /font-size/i.test(estilo)) {
        destino.setAttribute('style', estilo.replace(/font-size\s*:[^;]*;?/gi, ''))
      }
    })
  }

  // Recorte pelo que foi DESENHADO, não pela moldura — inclui o rótulo que
  // vazou pela borda e descarta a faixa que o SVG reserva para a legenda.
  //
  // Medir no clone, e não no original, porque a fonte compensada é MAIOR em
  // unidades de usuário: medir antes de trocá-la dava uma caixa apertada, e o
  // eixo Y saía decapitado (".2000" no lugar de "32000"). Como a caixa depende
  // da fonte e a fonte depende da escala, que depende da caixa, o ponto fixo é
  // buscado por iteração — três passadas já chegam à casa do décimo.
  const palco = document.createElement('div')
  palco.setAttribute('aria-hidden', 'true')
  palco.style.cssText =
    'position:fixed;left:-10000px;top:0;width:' + largura + 'px;visibility:hidden;pointer-events:none'
  clone.setAttribute('viewBox', `0 0 ${largura} ${altura}`)
  clone.removeAttribute('width')
  clone.removeAttribute('height')
  palco.appendChild(clone)
  document.body.appendChild(palco)

  let vx = 0
  let vy = 0
  let vw = largura
  let vh = altura
  let escala = Math.min(larguraAlvo / vw, alturaMax / vh)
  try {
    for (let passada = 0; passada < 3; passada++) {
      aplicarFontes(escala)
      const caixa = clone.getBBox()
      if (!(caixa.width > 0) || !(caixa.height > 0)) break
      vx = caixa.x - RESPIRO
      vy = caixa.y - RESPIRO
      vw = caixa.width + RESPIRO * 2
      vh = caixa.height + RESPIRO * 2
      escala = Math.min(larguraAlvo / vw, alturaMax / vh)
    }
  } catch {
    /* fora da tela o getBBox lança: vale a moldura, com a escala já calculada */
  } finally {
    palco.remove()
  }
  aplicarFontes(escala)

  clone.setAttribute('viewBox', `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`)
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  clone.setAttribute('width', String(Math.round(vw * escala)))
  clone.setAttribute('height', String(Math.round(vh * escala)))
  clone.setAttribute('style', 'display:block;margin:0 auto;max-width:100%;height:auto')

  const mapa = opts.mapaCores
  if (mapa) {
    const normalizado: Record<string, string> = {}
    for (const [de, para] of Object.entries(mapa)) normalizado[de.toLowerCase()] = para

    const trocar = (el: Element) => {
      for (const attr of ATRIBUTOS_DE_COR) {
        const valor = el.getAttribute(attr)
        const novo = valor && normalizado[valor.trim().toLowerCase()]
        if (novo) el.setAttribute(attr, novo)
      }
      const estilo = el.getAttribute('style')
      if (estilo) {
        const novo = estilo.replace(/#[0-9a-f]{3,8}/gi, (hex) => normalizado[hex.toLowerCase()] ?? hex)
        if (novo !== estilo) el.setAttribute('style', novo)
      }
    }
    trocar(clone)
    clone.querySelectorAll('*').forEach(trocar)
  }

  // A legenda do recharts é HTML, irmã do <svg> — sem ela o gráfico copiado
  // perde a identificação das séries.
  const legenda = raiz.querySelector('.recharts-default-legend')
  const legendaHtml = legenda ? `<div class="legenda">${legenda.outerHTML}</div>` : ''

  return `<div class="grafico">${clone.outerHTML}${legendaHtml}</div>`
}

/**
 * Assinatura do usuário: HTML que ele mesmo escreveu, então entra higienizado.
 * Mantém `style` (é o que dá a cara da assinatura) e derruba script, handler
 * inline e `javascript:`.
 */
function sanitizarAssinatura(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const raiz = doc.body.firstElementChild
  if (!raiz) return ''

  raiz.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach((el) => el.remove())
  const limpar = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      const nome = attr.name.toLowerCase()
      const ehUrl = nome === 'href' || nome === 'src' || nome === 'xlink:href'
      if (nome.startsWith('on') || (ehUrl && /^\s*javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name)
      }
    }
  }
  raiz.querySelectorAll('*').forEach(limpar)
  return raiz.innerHTML
}

/* ------------------------------------------------------------- montagem --- */

const CSS_RELATORIO = `
@page { size: A4 portrait; margin: 12mm 10mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  line-height: 1.45;
  color: #1f2937;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pagina { padding: 0; }

/* Papel timbrado: marca à esquerda, identificação do recorte à direita. A
   assinatura de e-mail do usuário é alta demais para virar cabeçalho crua
   (a do Instituto Totem tem 287px: logo de 110px, seis ícones de 42px e o
   endereço) — ajustarCabecalho() mede e reduz em escala, sem cortar nada. */
.cabecalho {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
  border-bottom: 2px solid #1F3A63; padding-bottom: 8px; margin-bottom: 14px;
}
.cabecalho .marca { flex: 0 1 auto; min-width: 0; overflow: hidden; }
.cabecalho .assinatura { transform-origin: left top; }
.cabecalho .assinatura img { max-width: 100%; height: auto; }
.cabecalho .identificacao { flex: 1 1 auto; text-align: right; }
.cabecalho .identificacao p { margin: 0; }
/* Sem assinatura o cabeçalho é só a identificação, e ela volta a ser à esquerda. */
.cabecalho.sem-marca .identificacao { text-align: left; }
.titulo { margin: 0 0 2px; font-size: 19px; color: #1F3A63; }
.subtitulo { margin: 0; font-size: 11px; color: #6b7280; }
.recorte { margin: 6px 0 0; font-size: 10.5px; color: #374151; }
.recorte strong { color: #111827; }
.emitido { margin: 2px 0 0; font-size: 10px; color: #9ca3af; }

.resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 0; }
.cartao { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; background: #f9fafb; break-inside: avoid; }
.cartao .rotulo { margin: 0; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
.cartao .valor { margin: 2px 0 0; font-size: 15px; font-weight: bold; color: #111827; }
.cartao .detalhe { margin: 2px 0 0; font-size: 9.5px; color: #6b7280; }

.blocos { margin-top: 12px; }
/* Bloco inteiro pode QUEBRAR entre páginas: uma tabela de 150 lançamentos que
   não pode ser cortada pula inteira para a página seguinte e deixa meia folha
   em branco. Quem não quebra é o par lado a lado (curto por natureza). */
.bloco { margin-bottom: 10px; }
.linha { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
.linha > .bloco { flex: 1 1 0; min-width: 0; margin-bottom: 0; }
.bloco h2 { margin: 0 0 1px; font-size: 12.5px; color: #1F3A63; break-after: avoid; page-break-after: avoid; }
.bloco .descricao { margin: 0 0 6px; font-size: 9.5px; color: #6b7280; break-after: avoid; page-break-after: avoid; }

table { width: 100%; border-collapse: collapse; font-size: 10px; }
/* tabela cortada entre páginas repete o cabeçalho na página seguinte */
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { text-align: left; background: #f3f4f6; color: #374151; font-weight: bold; padding: 5px 6px; border-bottom: 1px solid #d1d5db; }
td { padding: 4px 6px; border-bottom: 1px solid #eef0f3; }
th.dir, td.dir { text-align: right; white-space: nowrap; }
th.nw, td.nw { white-space: nowrap; }
tbody tr:nth-child(even) td { background: #fafbfc; }
/* O Chrome repete o tfoot em toda página que a tabela ocupa: um total no meio
   da tabela, antes das linhas que ele soma, confunde. Sai uma vez, no fim. */
tfoot { display: table-row-group; }
tfoot td { font-weight: bold; color: #111827; background: #f3f4f6; border-top: 1px solid #d1d5db; border-bottom: 0; }

.lista { list-style: none; margin: 0; padding: 0; }
.lista li { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px solid #f1f2f4; }
.lista li:last-child { border-bottom: 0; }
.lista-rotulo { color: #4b5563; }
.lista-valor { font-weight: bold; color: #111827; white-space: nowrap; }
.ponto { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }

/* O SVG já sai com width/height em px, recortado no desenho: nada de
   max-width esticando de volta. */
.grafico { break-inside: avoid; page-break-inside: avoid; }
.grafico .legenda { margin-top: 5px; text-align: center; }
.grafico .legenda ul { list-style: none; margin: 0; padding: 0; font-size: 9.5px; }
.grafico .legenda li { display: inline-block; margin: 0 6px; }
.grafico .legenda svg { display: inline-block; vertical-align: middle; margin-right: 3px; }

/* Uma linha, não uma caixa: três blocos vazios em caixa tracejada comiam
   180px de página nobre para dizer três vezes a mesma coisa. */
.vazio { margin: 2px 0 0; padding: 0; font-size: 10px; font-style: italic; color: #9ca3af; }
.rodape { margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9.5px; color: #9ca3af; }
`

/** Documento completo do relatório. Exportado para teste e pré-visualização. */
export function montarDocumentoRelatorio(rel: RelatorioPdf): string {
  const assinatura = rel.assinaturaHtml ? sanitizarAssinatura(rel.assinaturaHtml) : ''
  const emitido = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  const resumo = rel.resumo?.length
    ? `<section class="resumo">${rel.resumo
        .map(
          (i) => `<div class="cartao">
            <p class="rotulo">${escaparHtml(i.rotulo)}</p>
            <p class="valor"${i.cor ? ` style="color:${escaparHtml(i.cor)}"` : ''}>${escaparHtml(i.valor)}</p>
            ${i.detalhe ? `<p class="detalhe">${escaparHtml(i.detalhe)}</p>` : ''}
          </div>`
        )
        .join('')}</section>`
    : ''

  const artigo = (b: BlocoRelatorio) => `<article class="bloco">
      ${b.titulo ? `<h2>${escaparHtml(b.titulo)}</h2>` : ''}
      ${b.descricao ? `<p class="descricao">${escaparHtml(b.descricao)}</p>` : ''}
      ${b.html}
    </article>`

  // Dois blocos `metade` seguidos viram uma linha que não quebra; bloco de
  // largura cheia fica solto, livre para se partir entre páginas.
  const pedacos: string[] = []
  for (let i = 0; i < rel.blocos.length; i++) {
    const atual = rel.blocos[i]
    if (!atual.metade) {
      pedacos.push(artigo(atual))
      continue
    }
    const proximo = rel.blocos[i + 1]
    if (proximo?.metade) {
      pedacos.push(`<div class="linha">${artigo(atual)}${artigo(proximo)}</div>`)
      i++
    } else {
      pedacos.push(`<div class="linha">${artigo(atual)}<div class="bloco"></div></div>`)
    }
  }
  const blocos = pedacos.length ? `<section class="blocos">${pedacos.join('')}</section>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escaparHtml(rel.nomeArquivo || rel.titulo)}</title>
<style>${CSS_RELATORIO}</style>
</head>
<body>
<div class="pagina">
  <header class="cabecalho${assinatura ? '' : ' sem-marca'}">
    ${assinatura ? `<div class="marca"><div class="assinatura">${assinatura}</div></div>` : ''}
    <div class="identificacao">
      <h1 class="titulo">${escaparHtml(rel.titulo)}</h1>
      ${rel.subtitulo ? `<p class="subtitulo">${escaparHtml(rel.subtitulo)}</p>` : ''}
      ${rel.periodo ? `<p class="recorte">${rel.periodo}</p>` : ''}
      <p class="emitido">Emitido em ${escaparHtml(emitido)}</p>
    </div>
  </header>
  ${resumo}
  ${blocos}
  ${rel.notaRodape ? `<p class="rodape">${escaparHtml(rel.notaRodape)}</p>` : ''}
</div>
</body>
</html>`
}

/**
 * Ajusta a assinatura ao tamanho de um papel timbrado. Exportada para o
 * harness de pré-visualização do relatório.
 *
 * A assinatura é de E-MAIL: logo grande, fileira de ícones sociais e endereço.
 * A do Instituto Totem mede 287px — 28% da altura útil de uma A4 gastos antes
 * da primeira linha do relatório, e é o que empurrava o primeiro gráfico para a
 * página seguinte deixando meia folha em branco.
 *
 * Reduzir em escala (e não cortar) preserva a marca inteira: o que o usuário
 * salvou continua lá, só menor. O piso existe porque assinatura ilegível não é
 * timbre — abaixo dele o cabeçalho fica mais alto que o alvo, e tudo bem.
 */
export function ajustarCabecalho(
  doc: Document,
  alturaAlvo = 140,
  larguraAlvo = Math.round(LARGURA_PAPEL * 0.45),
  escalaMinima = 0.34
): void {
  const assinatura = doc.querySelector('.cabecalho .assinatura') as HTMLElement | null
  if (!assinatura) return

  const caixa = assinatura.getBoundingClientRect()
  if (!(caixa.height > 0) || !(caixa.width > 0)) return
  // Altura E largura: uma assinatura larga (a do Mageense tem 584px) cabe na
  // altura e ainda assim empurra o título para duas linhas.
  const escala = Math.max(
    Math.min(alturaAlvo / caixa.height, larguraAlvo / caixa.width, 1),
    escalaMinima
  )
  if (escala >= 1) return

  // A largura natural fica presa no elemento ANTES de a `.marca` encolher:
  // `transform` não reflui nada, mas um pai mais estreito reflui — e a
  // assinatura era remontada em duas linhas antes de ser reduzida.
  assinatura.style.width = `${Math.ceil(caixa.width)}px`
  assinatura.style.transform = `scale(${escala.toFixed(4)})`
  // `transform` não encolhe a caixa que o elemento ocupa no FLUXO. Sem fixar as
  // duas medidas o cabeçalho continua com os 287px de altura e os 520px de
  // largura, agora vazios; e pior, a `.marca` larga demais é comprimida pelo
  // flex, o conteúdo dela reflui mais alto do que foi medido e vaza por baixo
  // do `overflow:hidden` — foi assim que a linha de contato saiu cortada.
  const marca = assinatura.parentElement as HTMLElement | null
  if (marca) {
    marca.style.height = `${Math.ceil(caixa.height * escala)}px`
    marca.style.width = `${Math.ceil(caixa.width * escala)}px`
    marca.style.flex = '0 0 auto'
  }
}

/** Espera as imagens (logo da assinatura) carregarem — sem isso o PDF sai sem elas. */
function aguardarImagens(doc: Document, limiteMs = 6000): Promise<void> {
  const imagens = Array.from(doc.images).filter((img) => !img.complete)
  if (imagens.length === 0) return Promise.resolve()

  const carregadas = Promise.all(
    imagens.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          // Imagem quebrada não pode segurar o relatório: segue sem ela.
          img.addEventListener('error', () => resolve(), { once: true })
        })
    )
  ).then(() => undefined)

  return Promise.race([carregadas, new Promise<void>((r) => setTimeout(r, limiteMs))])
}

/**
 * Monta o relatório e abre o diálogo de impressão. Resolve depois de disparar
 * `print()` — o que o usuário faz no diálogo o navegador não conta pra gente.
 */
export async function exportarRelatorioPdf(rel: RelatorioPdf): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', 'Relatório para impressão')
  // Fora da tela COM tamanho real (A4 a 96dpi): iframe 0x0 ou display:none
  // deixa o layout sem viewport e alguns navegadores imprimem em branco.
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    throw new Error('Não foi possível preparar o relatório para impressão.')
  }

  doc.open()
  doc.write(montarDocumentoRelatorio(rel))
  doc.close()

  // Depois das imagens: a altura da assinatura só é real com o logo carregado.
  await aguardarImagens(doc)
  ajustarCabecalho(doc)

  let removido = false
  const remover = () => {
    if (removido) return
    removido = true
    // Um respiro antes de tirar o iframe: no Safari o afterprint chega antes de
    // o documento terminar de ser entregue à impressora.
    setTimeout(() => iframe.remove(), 500)
  }
  win.addEventListener('afterprint', remover, { once: true })
  // Rede de segurança: nem todo navegador emite afterprint em iframe.
  setTimeout(remover, 60_000)

  win.focus()
  win.print()
}
