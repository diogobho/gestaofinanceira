import api from './client';

export interface ConexaoPluggy {
  id: string;
  pluggy_item_id: string;
  instituicao: string;
  status: string;
  ultima_sync_em: string | null;
  importar_cartao: boolean;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export const pluggyApi = {
  async getConnectToken(): Promise<{ accessToken: string; includeSandbox: boolean }> {
    const { data } = await api.get<{ accessToken: string; includeSandbox: boolean }>('/pluggy/connect-token');
    return data;
  },

  async registrarItem(itemId: string): Promise<ConexaoPluggy> {
    const { data } = await api.post<ConexaoPluggy>('/pluggy/items', { itemId });
    return data;
  },

  async listarConexoes(): Promise<ConexaoPluggy[]> {
    const { data } = await api.get<ConexaoPluggy[]>('/pluggy/conexoes');
    return data;
  },

  async syncManual(conexaoId: string): Promise<void> {
    await api.post(`/pluggy/conexoes/${conexaoId}/sync`);
  },

  async atualizarConexao(conexaoId: string, data: { importar_cartao: boolean }): Promise<ConexaoPluggy> {
    const { data: res } = await api.patch<ConexaoPluggy>(`/pluggy/conexoes/${conexaoId}`, data);
    return res;
  },

  async desativarConexao(conexaoId: string): Promise<void> {
    await api.delete(`/pluggy/conexoes/${conexaoId}`);
  },
};
