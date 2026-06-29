import api from './client';

export interface WhatsAppConfig {
  configurado: boolean;
  porta?: number;
  conectado: boolean;
  ultimaConexao?: string;
}

export interface WhatsAppUsuarioEmpresa {
  id: number;
  nome: string;
  email: string;
  configurado: boolean;
  porta?: number;
  conectado: boolean;
  ultimaConexao?: string;
}

export interface WhatsAppStatus {
  clientId: string;
  status: 'connected' | 'disconnected';
  hasQrCode: boolean;
  timestamp: string;
}

export interface WhatsAppQR {
  clientId: string;
  qrCode: string;
  hasQrCode: boolean;
}

export interface WhatsAppInstancia {
  id: number;
  empresa_id: number;
  nome: string;
  descricao?: string;
  porta: number;
  session_name?: string;
  status: 'desconectado' | 'conectando' | 'conectado' | 'erro';
  qrcode_data?: string;
  numero_conectado?: string;
  ultimo_ping?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export const whatsappApi = {
  /**
   * Obter configuração WhatsApp do usuário logado
   */
  async getConfig(): Promise<WhatsAppConfig> {
    const response = await api.get('/whatsapp/config');
    return response.data;
  },

  /**
   * Configurar porta WhatsApp
   */
  async setConfig(porta: number): Promise<{ success: boolean; porta: number }> {
    const response = await api.post('/whatsapp/config', { porta });
    return response.data;
  },

  /**
   * Obter status da conexão
   */
  async getStatus(): Promise<WhatsAppStatus> {
    const response = await api.get('/whatsapp/status');
    return response.data;
  },

  /**
   * Obter QR Code
   */
  async getQRCode(): Promise<WhatsAppQR> {
    const response = await api.get('/whatsapp/qr');
    return response.data;
  },

  /**
   * Obter URL da imagem do QR Code
   */
  getQRImageUrl(): string {
    const token = localStorage.getItem('token');
    return `${import.meta.env.VITE_API_URL}/whatsapp/qr-image?token=${token}`;
  },

  /**
   * Enviar mensagem de teste
   */
  async sendTest(numero: string): Promise<{ success: boolean }> {
    const response = await api.post('/whatsapp/test', { numero });
    return response.data;
  },

  /**
   * Desconectar WhatsApp
   */
  async disconnect(): Promise<{ success: boolean }> {
    const response = await api.post('/whatsapp/disconnect');
    return response.data;
  },

  /**
   * Listar todos os usuários da empresa com status WhatsApp (masterOnly)
   */
  async getEmpresaUsuarios(): Promise<WhatsAppUsuarioEmpresa[]> {
    const response = await api.get('/whatsapp/empresa/usuarios');
    return response.data;
  },

  /**
   * Obter status WhatsApp de um usuário específico da empresa (masterOnly)
   */
  async getUsuarioStatus(userId: number): Promise<WhatsAppStatus> {
    const response = await api.get(`/whatsapp/empresa/usuarios/${userId}/status`);
    return response.data;
  },

  /**
   * Obter URL da imagem do QR Code de um usuário específico (masterOnly)
   */
  getUsuarioQRImageUrl(userId: number): string {
    const token = localStorage.getItem('token');
    return `${import.meta.env.VITE_API_URL}/whatsapp/empresa/usuarios/${userId}/qr-image?token=${token}&t=${Date.now()}`;
  },

  /**
   * Desconectar WhatsApp de um usuário específico da empresa (masterOnly)
   */
  async disconnectUsuario(userId: number): Promise<{ success: boolean }> {
    const response = await api.post(`/whatsapp/empresa/usuarios/${userId}/disconnect`);
    return response.data;
  },
};

// API de Instâncias WhatsApp
export const instanciasApi = {
  async list(): Promise<WhatsAppInstancia[]> {
    const response = await api.get('/whatsapp/instancias');
    return response.data;
  },

  async getById(id: number): Promise<WhatsAppInstancia> {
    const response = await api.get(`/whatsapp/instancias/${id}`);
    return response.data;
  },

  async create(data: { nome: string; descricao?: string; porta: number }): Promise<WhatsAppInstancia> {
    const response = await api.post('/whatsapp/instancias', data);
    return response.data;
  },

  async update(id: number, data: { nome?: string; descricao?: string; ativo?: boolean }): Promise<WhatsAppInstancia> {
    const response = await api.put(`/whatsapp/instancias/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/whatsapp/instancias/${id}`);
  },

  async getStatus(id: number): Promise<{ status: string; qrcode?: string; numero?: string }> {
    const response = await api.get(`/whatsapp/instancias/${id}/status`);
    return response.data;
  },

  async getQRCode(id: number): Promise<{ qrcode?: string; status: string }> {
    const response = await api.get(`/whatsapp/instancias/${id}/qrcode`);
    return response.data;
  },

  async disconnect(id: number): Promise<void> {
    await api.post(`/whatsapp/instancias/${id}/disconnect`);
  },
};
