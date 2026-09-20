import api from './client'

/**
 * Canal de WhatsApp da empresa: número oficial (Cloud API da Meta) ou QR Code.
 *
 * No oficial valem duas regras da Meta que o QR Code não tem:
 *  - janela de 24h: só dá para mandar texto livre até 24h depois da última mensagem
 *    DO CLIENTE; fora dela, só modelo aprovado;
 *  - modelo aprovado: o texto é o da Meta, e o CRM só preenche as variáveis.
 */

export interface CanalWhatsApp {
  provedor: 'cloud_api' | 'baileys'
  numero?: string | null
  nomeExibicao?: string | null
  conectado?: boolean
  qualidade?: string | null
  erro?: string | null
  ativadoEm?: string | null
}

export interface ModeloWhatsApp {
  id: string
  nome: string
  idioma: string
  categoria: string
  status: string
  formato: 'POSITIONAL' | 'NAMED'
  cabecalho: string | null
  corpo: string
  rodape: string | null
  botoes: string[]
  variaveis: string[]
  variavelCabecalho: string | null
  suportado: boolean
  motivoNaoSuportado: string | null
}

export interface JanelaWhatsApp {
  provedor: 'cloud_api' | 'baileys'
  aberta: boolean
  ultimaEntrada?: string | null
  restaSegundos?: number
}

/** O que o CRM grava para mandar um modelo com variáveis do card ([Nome]…). */
export interface ModeloConfigurado {
  nome: string
  idioma?: string
  variaveis: string[]
  cabecalho?: string | null
}

/** Estado do canal oficial DESTE usuário e da janela do Embedded Signup. */
export interface CanalOficial {
  embeddedSignup: {
    configurado: boolean
    /** Variáveis que faltam no .env da API. Só a DuoFuturo resolve. */
    faltando: string[]
    appId: string | null
    configId: string | null
    graphVersion: string
  }
  conta: {
    id: number
    numero: string | null
    nomeExibicao: string | null
    ativo: boolean
    origem: string
    qualidade: string | null
    conectado: boolean
    erro: string | null
    /** O número é deste usuário (e não o da empresa inteira). */
    meu: boolean
    daEmpresa: boolean
  } | null
}

export const canalWhatsappApi = {
  getCanal: async (): Promise<CanalWhatsApp> => (await api.get('/whatsapp/canal')).data,

  getOficial: async (): Promise<CanalOficial> => (await api.get('/whatsapp/canal/oficial')).data,

  /**
   * Conclui o Embedded Signup. O `code` da janela vive ~30 segundos — mandar
   * direto, sem guardar e sem confirmar em outra tela.
   */
  conectarOficial: async (dados: { code: string; waba_id: string; phone_number_id: string; usuario_id?: number }) =>
    (await api.post('/whatsapp/canal/oficial/conectar', dados)).data,

  desconectarOficial: async () => (await api.post('/whatsapp/canal/oficial/desconectar')).data,

  getModelos: async (forcar = false): Promise<ModeloWhatsApp[]> =>
    (await api.get('/whatsapp/canal/modelos', { params: forcar ? { forcar: 1 } : {} })).data.modelos ?? [],

  getJanela: async (params: { lead_id?: number; contato_id?: number }): Promise<JanelaWhatsApp> =>
    (await api.get('/whatsapp/canal/janela', { params })).data,

  enviarModeloLead: async (
    leadId: number,
    pedido: { nome: string; idioma?: string; valores: { corpo: string[]; cabecalho?: string | null } }
  ) => (await api.post(`/crm/leads/${leadId}/whatsapp/modelo`, pedido)).data,
}

/** Texto do modelo com os valores no lugar das variáveis — a prévia da tela. */
export function previaModelo(m: ModeloWhatsApp, corpo: string[], cabecalho?: string | null): string {
  const trocar = (texto: string, nomes: string[], vals: string[]) =>
    texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (inteiro, nome) => {
      const i = nomes.indexOf(nome)
      return i >= 0 && vals[i] ? vals[i] : inteiro
    })
  return [
    m.cabecalho ? trocar(m.cabecalho, m.variavelCabecalho ? [m.variavelCabecalho] : [], [cabecalho || '']) : null,
    trocar(m.corpo, m.variaveis, corpo),
    m.rodape,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function formatarNumeroBR(digitos?: string | null): string {
  const d = String(digitos || '').replace(/\D/g, '')
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : ''
}
