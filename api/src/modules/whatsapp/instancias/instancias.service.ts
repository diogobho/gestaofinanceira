import { query } from '../../../config/database';
import axios from 'axios';

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
  ultimo_ping?: Date;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateInstanciaDto {
  nome: string;
  descricao?: string;
  porta: number;
}

export interface UpdateInstanciaDto {
  nome?: string;
  descricao?: string;
  ativo?: boolean;
}

export const instanciasService = {
  async list(empresaId: number): Promise<WhatsAppInstancia[]> {
    const result = await query(
      `SELECT * FROM whatsapp_instancias
       WHERE empresa_id = $1
       ORDER BY created_at ASC`,
      [empresaId]
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<WhatsAppInstancia | null> {
    const result = await query(
      `SELECT * FROM whatsapp_instancias WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async getByPorta(porta: number): Promise<WhatsAppInstancia | null> {
    const result = await query(
      `SELECT * FROM whatsapp_instancias WHERE porta = $1`,
      [porta]
    );
    return result.rows[0] || null;
  },

  async create(empresaId: number, data: CreateInstanciaDto): Promise<WhatsAppInstancia> {
    // Verificar se porta já está em uso
    const existente = await this.getByPorta(data.porta);
    if (existente) {
      throw new Error(`A porta ${data.porta} já está em uso por outra instância`);
    }

    const result = await query(
      `INSERT INTO whatsapp_instancias (empresa_id, nome, descricao, porta, session_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        empresaId,
        data.nome,
        data.descricao || null,
        data.porta,
        `session_${empresaId}_${Date.now()}`
      ]
    );
    return result.rows[0];
  },

  async update(id: number, empresaId: number, data: UpdateInstanciaDto): Promise<WhatsAppInstancia | null> {
    const instancia = await this.getById(id, empresaId);
    if (!instancia) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.nome !== undefined) {
      fields.push(`nome = $${paramCount++}`);
      values.push(data.nome);
    }
    if (data.descricao !== undefined) {
      fields.push(`descricao = $${paramCount++}`);
      values.push(data.descricao);
    }
    if (data.ativo !== undefined) {
      fields.push(`ativo = $${paramCount++}`);
      values.push(data.ativo);
    }

    if (fields.length === 0) return instancia;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, empresaId);

    const result = await query(
      `UPDATE whatsapp_instancias SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND empresa_id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const instancia = await this.getById(id, empresaId);
    if (!instancia) return false;

    // Verificar se tem contatos ou mensagens associados
    const contatosResult = await query(
      `SELECT COUNT(*) FROM contatos_whatsapp WHERE whatsapp_instancia_id = $1`,
      [id]
    );
    if (parseInt(contatosResult.rows[0].count) > 0) {
      throw new Error('Não é possível deletar instância com contatos associados');
    }

    await query(`DELETE FROM whatsapp_instancias WHERE id = $1`, [id]);
    return true;
  },

  async getStatus(id: number, empresaId: number): Promise<{ status: string; qrcode?: string; numero?: string }> {
    const instancia = await this.getById(id, empresaId);
    if (!instancia) {
      throw new Error('Instância não encontrada');
    }

    try {
      const response = await axios.get(`http://localhost:${instancia.porta}/status`, {
        timeout: 5000
      });

      const isConnected = response.data.status === 'connected' || response.data.connected === true;
      const status = isConnected ? 'conectado' : 'desconectado';

      // Atualizar status no banco
      await query(
        `UPDATE whatsapp_instancias SET status = $1, ultimo_ping = CURRENT_TIMESTAMP WHERE id = $2`,
        [status, id]
      );

      return {
        status,
        numero: response.data.number || instancia.numero_conectado
      };
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        await query(`UPDATE whatsapp_instancias SET status = 'desconectado' WHERE id = $1`, [id]);
        return { status: 'desconectado' };
      }
      throw error;
    }
  },

  async getQRCode(id: number, empresaId: number): Promise<{ qrcode?: string; status: string }> {
    const instancia = await this.getById(id, empresaId);
    if (!instancia) {
      throw new Error('Instância não encontrada');
    }

    try {
      const response = await axios.get(`http://localhost:${instancia.porta}/qrcode`, {
        timeout: 30000
      });

      if (response.data.qrcode) {
        // Salvar QR code no banco
        await query(
          `UPDATE whatsapp_instancias SET qrcode_data = $1, status = 'conectando' WHERE id = $2`,
          [response.data.qrcode, id]
        );

        return {
          qrcode: response.data.qrcode,
          status: 'conectando'
        };
      }

      return { status: response.data.status || 'desconectado' };
    } catch (error: any) {
      throw new Error(`Erro ao obter QR Code: ${error.message}`);
    }
  },

  async disconnect(id: number, empresaId: number): Promise<boolean> {
    const instancia = await this.getById(id, empresaId);
    if (!instancia) {
      throw new Error('Instância não encontrada');
    }

    try {
      await axios.post(`http://localhost:${instancia.porta}/disconnect`, {}, {
        timeout: 10000
      });

      await query(
        `UPDATE whatsapp_instancias SET status = 'desconectado', qrcode_data = NULL, numero_conectado = NULL WHERE id = $1`,
        [id]
      );

      return true;
    } catch (error: any) {
      throw new Error(`Erro ao desconectar: ${error.message}`);
    }
  },

  // Obter instância padrão da empresa (primeira ativa)
  async getDefault(empresaId: number): Promise<WhatsAppInstancia | null> {
    const result = await query(
      `SELECT * FROM whatsapp_instancias
       WHERE empresa_id = $1 AND ativo = true
       ORDER BY created_at ASC
       LIMIT 1`,
      [empresaId]
    );
    return result.rows[0] || null;
  }
};
