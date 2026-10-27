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
  /** Liberação provisória do disparo em massa pelo QR (16/10/2026). */
  disparoQrLiberado?: boolean
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
  motivoRecusa: string | null
}

export interface BotaoModelo {
  tipo: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
  texto: string
  url?: string
  telefone?: string
}

export interface NovoModelo {
  nome: string
  categoria: 'MARKETING' | 'UTILITY'
  idioma: string
  corpo: string
  exemplos: string[]
  cabecalho?: string
  exemploCabecalho?: string
  rodape?: string
  botoes: BotaoModelo[]
}

/** O que a Meta diz sobre o número (`health_status` + limites). */
export interface SaudeNumero {
  numero: string | null
  nomeExibido: string | null
  statusNome: string | null
  nomeNovo: string | null
  statusNomeNovo: string | null
  qualidade: string | null
  limite: string | null
  verificacao: string | null
  status: string | null
  modo: string | null
  podeEnviar: string | null
  pendencias: { nivel: string; podeEnviar: string; motivo: string; solucao: string | null }[]
}

export interface PerfilComercial {
  about?: string
  address?: string
  description?: string
  email?: string
  websites?: string[]
  vertical?: string
  profile_picture_url?: string
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
  /** Portfólio da Meta da empresa (097): onde entram todos os números, com um cartão só. */
  portfolio: {
    nome: string | null
    businessId: string
    wabaId: string
    /** true = a Meta acusa problema na forma de pagamento; null = não deu para saber. */
    pagamentoPendente: boolean | null
  } | null
  /** Dono da conta (creator) ou DuoFuturo: quem pode fazer a primeira conexão. */
  podeDefinirPortfolio: boolean
  /** Nome do dono da conta, quando o portfólio ainda não existe. */
  donoDaConta: string | null
  embeddedSignup: {
    configurado: boolean
    /** Variáveis que faltam no .env da API. Só a DuoFuturo resolve. */
    faltando: string[]
    appId: string | null
    configId: string | null
    graphVersion: string
    /** Versão do Embedded Signup da configuração: 'v4' (extras vazio) ou anterior. */
    versao?: string
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
    /** Conectado num portfólio da Meta que não é o da empresa. */
    foraDoPortfolio?: boolean
    /** O número segue no app WhatsApp Business do celular (coexistência). */
    coexistencia?: boolean
    /** Importação do histórico do app — só na coexistência. */
    historico?: {
      status: 'importando' | 'concluido' | 'recusado' | null
      progresso: number | null
      mensagens: number
      erro: string | null
    } | null
  } | null
}

export const canalWhatsappApi = {
  getCanal: async (): Promise<CanalWhatsApp> => (await api.get('/whatsapp/canal')).data,

  getOficial: async (): Promise<CanalOficial> => (await api.get('/whatsapp/canal/oficial')).data,

  /**
   * Conclui o Embedded Signup. O `code` da janela vive ~30 segundos — mandar
   * direto, sem guardar e sem confirmar em outra tela.
   */
  conectarOficial: async (dados: {
    code: string
    waba_id: string
    /** Na coexistência a Meta pode não informar — o servidor procura na conta. */
    phone_number_id?: string
    usuario_id?: number
    coexistencia?: boolean
  }) =>
    (await api.post('/whatsapp/canal/oficial/conectar', dados)).data,

  /** Número novo na conta da empresa, sem janela da Meta: passo 1, o código. */
  pedirCodigoNumero: async (dados: { numero: string; nome_exibicao: string; metodo: 'SMS' | 'VOICE'; usuario_id?: number }) =>
    (await api.post('/whatsapp/canal/oficial/numero/codigo', dados)).data as { phone_number_id: string },

  /** Passo 2: confere o código e liga o número no usuário. */
  verificarNumero: async (dados: { phone_number_id: string; codigo: string; usuario_id?: number }) =>
    (await api.post('/whatsapp/canal/oficial/numero/verificar', dados)).data,

  /** Registra no servidor o que a janela da Meta respondeu (erro, abandono, passo atual). */
  registrarEventoJanela: (evento: string, dados: unknown, alvo?: number) =>
    api.post('/whatsapp/canal/oficial/evento-janela', { evento, dados, alvo }).catch(() => {}),

  desconectarOficial: async (contaId?: number) =>
    (await api.post('/whatsapp/canal/oficial/desconectar', contaId ? { conta_id: contaId } : {})).data,

  getSaude: async (): Promise<{ saude: SaudeNumero; wabaId: string }> =>
    (await api.get('/whatsapp/canal/oficial/saude')).data,

  getPerfil: async (): Promise<{ perfil: PerfilComercial; podeEditar: boolean }> =>
    (await api.get('/whatsapp/canal/oficial/perfil')).data,

  salvarPerfil: async (perfil: Omit<PerfilComercial, 'profile_picture_url'>) =>
    (await api.put('/whatsapp/canal/oficial/perfil', perfil)).data,

  trocarFoto: async (arquivo: File) => {
    const form = new FormData()
    form.append('foto', arquivo)
    return (
      await api.post('/whatsapp/canal/oficial/perfil/foto', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    ).data
  },

  criarModelo: async (modelo: NovoModelo) => (await api.post('/whatsapp/canal/modelos', modelo)).data,

  /** Texto editado no fluxo vira versão nova na Meta (`_v2`…); devolve o nome e os campos. */
  novaVersaoModelo: async (dados: { nome: string; texto: string; campos?: string[] }): Promise<{ nome: string; idioma: string; variaveis: string[]; status: string }> =>
    (await api.post('/whatsapp/canal/modelos/nova-versao', dados)).data,

  excluirModelo: async (nome: string, id?: string) =>
    (await api.delete(`/whatsapp/canal/modelos/${encodeURIComponent(nome)}`, { params: id ? { id } : {} })).data,

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
