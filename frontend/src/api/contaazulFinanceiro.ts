import api from './client'

/** Conta Azul em Receitas e Despesas (migrations 106/107): contas a receber e a pagar da empresa. */
export interface ContaContaAzul {
  conexao_id: number
  nome: string
  documento?: string | null
  importando: boolean
  importar_desde?: string | null
  importar_ate?: string | null
  ultima_sync_em?: string | null
  ultima_alteracao_em?: string | null
  precisa_reconectar: boolean
  erro?: string | null
  receitas: number
  despesas: number
  ja_no_asaas: number
}

export interface StatusContaAzul {
  disponivel: boolean
  contas: ContaContaAzul[]
}

export const contaazulFinanceiroApi = {
  status: () => api.get<StatusContaAzul>('/contaazul-financeiro/status').then(r => r.data),
  /** Devolve a URL de login do Conta Azul; o navegador vai para lá e volta para Receitas ou Despesas. */
  conectar: (importar_desde: string, voltar_para: 'receitas' | 'despesas', substituir?: number) =>
    api.post<{ url: string }>('/contaazul-financeiro/conectar', { importar_desde, voltar_para, substituir }).then(r => r.data),
  ligarImportacao: (conexaoId: number, importar_desde: string) =>
    api.post<StatusContaAzul>(`/contaazul-financeiro/conexao/${conexaoId}/importar`, { importar_desde }).then(r => r.data),
  conferir: () => api.post<{ criada: number; atualizada: number; carregando: boolean }>('/contaazul-financeiro/conferir').then(r => r.data),
  desconectar: (conexaoId: number) => api.delete<StatusContaAzul>(`/contaazul-financeiro/conexao/${conexaoId}`).then(r => r.data),
}
