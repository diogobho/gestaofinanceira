import { useTheme } from '@/contexts/ThemeContext'

/**
 * Paleta categórica do dashboard de integrações.
 *
 * Os hex NÃO são escolha de gosto: passaram no validador de paleta contra as
 * superfícies reais do app — `#ffffff` no claro e `#1f2937` (o fundo do Card) no
 * escuro. Nos dois modos: banda de luminosidade, piso de croma, separação sob
 * deuteranopia/protanopia e piso de visão normal, todos PASS.
 *
 *   claro:  pior par adjacente verde↔laranja ΔE 9,2 (deutan) · normal 27,6
 *   escuro: pior par adjacente verde↔laranja ΔE 9,4 (deutan) · normal 26,5
 *
 * O verde do modo claro fica em 2,82:1 contra o branco — abaixo de 3:1. O
 * validador marca isso como WARN "relief required", e o alívio exigido está no
 * desenho: toda série leva rótulo direto, a legenda mostra o valor e a tabela de
 * leads fica logo abaixo. A cor nunca responde sozinha. **Não trocar hex sem
 * rodar o validador de novo.**
 *
 * São CINCO cores porque cinco é o que passa junto. A sexta série e além caem em
 * `neutra` como "Outras" — dobra num neutro, nunca uma sexta cor inventada.
 */

export interface PaletaIntegracoes {
  series: string[]
  neutra: string
  grid: string
  eixo: string
  tooltipBg: string
  tooltipBorda: string
  tooltipTexto: string
  /** Fundo do Card no modo em uso — é contra ele que a paleta foi validada. */
  superficie: string
}

const CLARO: PaletaIntegracoes = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#a855f7', '#e34948'],
  neutra: '#9ca3af',
  grid: '#eef0f3',
  eixo: '#6b7280',
  tooltipBg: '#ffffff',
  tooltipBorda: '#e5e7eb',
  tooltipTexto: '#111827',
  superficie: '#ffffff',
}

const ESCURO: PaletaIntegracoes = {
  series: ['#3987e5', '#d95926', '#199e70', '#a855f7', '#e05252'],
  neutra: '#6b7280',
  grid: '#374151',
  eixo: '#9ca3af',
  tooltipBg: '#1f2937',
  tooltipBorda: '#374151',
  tooltipTexto: '#f3f4f6',
  superficie: '#1f2937',
}

export function usePaletaIntegracoes(): PaletaIntegracoes {
  const { theme } = useTheme()
  return theme === 'dark' ? ESCURO : CLARO
}

/** Quantas integrações ganham cor própria antes do resto virar "Outras". */
export const MAX_SERIES = 5

/**
 * Cor por integração, fixa.
 *
 * A regra que isto existe para cumprir: **a cor segue a entidade, nunca a
 * posição dela no ranking**. O mapa é montado a partir do volume no conjunto
 * INTEIRO (não no recorte filtrado) — então filtrar por funil, por período ou
 * por responsável muda quais séries aparecem, e nenhuma delas troca de cor no
 * caminho. Fosse pelo ranking do recorte, cada clique repintaria o gráfico e
 * comparar dois filtros seria impossível.
 */
export function mapaDeCores(
  ordemPorVolume: string[],
  paleta: PaletaIntegracoes
): Map<string, string> {
  const mapa = new Map<string, string>()
  ordemPorVolume.forEach((id, i) => {
    mapa.set(id, i < MAX_SERIES ? paleta.series[i] : paleta.neutra)
  })
  return mapa
}
