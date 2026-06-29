import { query } from '../../../config/database';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = '/var/www/apps/gestao_financeira/uploads/whatsapp';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'crm-whatsapp-webhook-secret-2024';

// Normaliza números brasileiros para o formato padrão do WhatsApp (13 dígitos: 55+DDD+9 dígitos).
// Números com 12 dígitos (55+DDD+8 dígitos — formato antigo) recebem o 9º dígito após o DDD.
function normalizarTelefoneBR(digits: string): string {
  if (digits.startsWith('55')) {
    const semPais = digits.slice(2);
    if (semPais.length === 10) return `55${semPais.slice(0, 2)}9${semPais.slice(2)}`;
    if (semPais.length === 11) return digits;
    return digits;
  }
  if (digits.length === 10) return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (digits.length === 11) return `55${digits}`;
  return digits;
}

export interface ContatoWhatsApp {
  id: number;
  usuario_id: number;
  empresa_id: number;
  whatsapp_id: string;
  numero: string;
  nome?: string;
  nome_push?: string;
  foto_url?: string;
  is_grupo: boolean;
  ultima_mensagem?: string;
  ultima_mensagem_at?: Date;
  sincronizado_at: Date;
  created_at: Date;
  updated_at: Date;
}

export const contatosService = {
  // Lista contatos da empresa (não apenas do usuário)
  async list(empresaId: number, apenasIndividuais = true): Promise<ContatoWhatsApp[]> {
    let whereGrupo = '';
    if (apenasIndividuais) {
      whereGrupo = 'AND is_grupo = false';
    }

    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM historico_mensagens hm WHERE hm.contato_whatsapp_id = c.id) as total_mensagens,
        (SELECT COUNT(*) FROM leads l WHERE l.contato_whatsapp_id = c.id) as total_leads
       FROM contatos_whatsapp c
       WHERE c.empresa_id = $1 ${whereGrupo}
       ORDER BY c.ultima_mensagem_at DESC NULLS LAST, c.nome ASC`,
      [empresaId]
    );
    return result.rows;
  },

  async listNaoConvertidos(empresaId: number, funilId?: number): Promise<ContatoWhatsApp[]> {
    let whereExtra = '';
    const params: any[] = [empresaId];

    if (funilId) {
      whereExtra = `
        AND c.id NOT IN (
          SELECT contato_whatsapp_id FROM leads
          WHERE funil_id = $2 AND contato_whatsapp_id IS NOT NULL
        )
      `;
      params.push(funilId);
    } else {
      whereExtra = `
        AND c.id NOT IN (
          SELECT contato_whatsapp_id FROM leads
          WHERE contato_whatsapp_id IS NOT NULL
        )
      `;
    }

    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM historico_mensagens hm WHERE hm.contato_whatsapp_id = c.id) as total_mensagens
       FROM contatos_whatsapp c
       WHERE c.empresa_id = $1
         AND c.is_grupo = false
         ${whereExtra}
       ORDER BY c.ultima_mensagem_at DESC NULLS LAST, c.nome ASC`,
      params
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<ContatoWhatsApp | null> {
    const result = await query(
      `SELECT * FROM contatos_whatsapp WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async getByNumero(numero: string, empresaId: number): Promise<ContatoWhatsApp | null> {
    const result = await query(
      `SELECT * FROM contatos_whatsapp WHERE numero = $1 AND empresa_id = $2`,
      [numero, empresaId]
    );
    return result.rows[0] || null;
  },

  async sincronizar(usuarioId: number, empresaId: number): Promise<{ total: number; novos: number; atualizados: number }> {
    // Buscar porta WhatsApp do usuário
    const configResult = await query(
      `SELECT whatsapp_porta, whatsapp_conectado FROM usuarios WHERE id = $1`,
      [usuarioId]
    );

    const config = configResult.rows[0];
    if (!config?.whatsapp_porta) {
      throw new Error('WhatsApp não configurado. Configure a porta nas configurações.');
    }

    const porta = config.whatsapp_porta;

    // Verificar status da conexão
    try {
      const statusResponse = await axios.get(`http://localhost:${porta}/status`, {
        timeout: 5000
      });

      // API retorna { status: "connected" } ou { connected: true }
      const isConnected = statusResponse.data.status === 'connected' || statusResponse.data.connected === true;
      if (!isConnected) {
        throw new Error('WhatsApp não está conectado. Escaneie o QR Code primeiro.');
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Serviço WhatsApp não está rodando. Inicie o serviço primeiro.');
      }
      throw error;
    }

    // Buscar contatos/chats do WhatsApp (com fotos)
    let chats: any[] = [];
    try {
      const chatsResponse = await axios.get(`http://localhost:${porta}/chats`, {
        params: { photos: 'true' },
        timeout: 120000  // 2 minutos para buscar fotos
      });

      if (!chatsResponse.data.success) {
        throw new Error('Erro ao buscar contatos do WhatsApp');
      }

      chats = chatsResponse.data.chats || [];
    } catch (error: any) {
      if (error.code === 'ETIMEDOUT') {
        throw new Error('Timeout ao buscar contatos. Tente novamente.');
      }
      throw error;
    }

    let novos = 0;
    let atualizados = 0;

    for (const chat of chats) {
      // Extrair número do ID (5524988344048@c.us -> 5524988344048)
      const numero = chat.id.replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
      const isGrupo = chat.id.includes('@g.us');

      // Upsert contato (agora com empresa_id)
      const result = await query(
        `INSERT INTO contatos_whatsapp (
          usuario_id, empresa_id, whatsapp_id, numero, nome, nome_push, foto_url, is_grupo,
          ultima_mensagem, ultima_mensagem_at, sincronizado_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        ON CONFLICT (usuario_id, whatsapp_id)
        DO UPDATE SET
          nome = COALESCE(EXCLUDED.nome, contatos_whatsapp.nome),
          nome_push = COALESCE(EXCLUDED.nome_push, contatos_whatsapp.nome_push),
          foto_url = COALESCE(EXCLUDED.foto_url, contatos_whatsapp.foto_url),
          ultima_mensagem = COALESCE(EXCLUDED.ultima_mensagem, contatos_whatsapp.ultima_mensagem),
          ultima_mensagem_at = COALESCE(EXCLUDED.ultima_mensagem_at, contatos_whatsapp.ultima_mensagem_at),
          sincronizado_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted`,
        [
          usuarioId,
          empresaId,
          chat.id,
          numero,
          chat.name || null,
          chat.pushname || chat.name || null,
          chat.profilePicUrl || null,
          isGrupo,
          chat.lastMessage?.body || null,
          chat.lastMessage?.timestamp ? new Date(chat.lastMessage.timestamp * 1000) : null
        ]
      );

      if (result.rows[0].inserted) {
        novos++;
      } else {
        atualizados++;
      }
    }

    return {
      total: chats.length,
      novos,
      atualizados
    };
  },

  async findOrCreateByNumero(numero: string, usuarioId: number, empresaId: number): Promise<ContatoWhatsApp> {
    const originalDigits = numero.replace(/\D/g, '');

    if (!originalDigits) {
      throw new Error('Numero de telefone invalido');
    }

    // Normaliza para o formato padrão BR do WhatsApp (55+DDD+9 dígitos = 13 dígitos).
    // Números de 12 dígitos (formato antigo sem o 9º dígito) são corrigidos automaticamente.
    const numeroLimpo = normalizarTelefoneBR(originalDigits);

    // Busca pelo número normalizado (13 dígitos) OU pelo original (para contatos sincronizados do WhatsApp)
    const existing = await query(
      `SELECT * FROM contatos_whatsapp WHERE (numero = $1 OR numero = $2) AND empresa_id = $3 LIMIT 1`,
      [numeroLimpo, originalDigits, empresaId]
    );
    if (existing.rows[0]) return existing.rows[0];

    const whatsappId = `${numeroLimpo}@c.us`;

    const result = await query(
      `INSERT INTO contatos_whatsapp (
        usuario_id, empresa_id, whatsapp_id, numero, is_grupo, sincronizado_at
      ) VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP)
      ON CONFLICT (usuario_id, whatsapp_id)
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [usuarioId, empresaId, whatsappId, numeroLimpo]
    );

    return result.rows[0];
  },

  async enviarMensagem(
    usuarioId: number,
    empresaId: number,
    contatoId: number,
    mensagem: string,
    leadId?: number
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Buscar contato (verificando empresa)
    const contato = await this.getById(contatoId, empresaId);
    if (!contato) {
      throw new Error('Contato não encontrado');
    }

    // Buscar porta WhatsApp
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );

    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) {
      throw new Error('WhatsApp não configurado');
    }

    // Enviar mensagem usando whatsapp_id como chatId (suporta @c.us, @g.us, @lid)
    try {
      const response = await axios.post(`http://localhost:${porta}/send`, {
        number: contato.whatsapp_id,
        message: mensagem
      }, {
        timeout: 30000
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao enviar mensagem');
      }

      // Registrar no histórico (com empresa_id)
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          whatsapp_message_id, direcao, tipo, conteudo, enviado_at
        ) VALUES ($1, $2, $3, $4, $5, 'saida', 'texto', $6, CURRENT_TIMESTAMP)`,
        [
          leadId || null,
          contatoId,
          usuarioId,
          empresaId,
          response.data.messageId || null,
          mensagem
        ]
      );

      // Atualizar data do ultimo contato e marcar aguardando resposta
      if (leadId) {
        await query(
          `UPDATE leads SET data_ultimo_contato = CURRENT_TIMESTAMP, aguardando_resposta = true WHERE id = $1`,
          [leadId]
        );
      }

      return {
        success: true,
        messageId: response.data.messageId
      };
    } catch (error: any) {
      // Registrar erro no histórico
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          direcao, tipo, conteudo, erro, enviado_at
        ) VALUES ($1, $2, $3, $4, 'saida', 'texto', $5, $6, CURRENT_TIMESTAMP)`,
        [
          leadId || null,
          contatoId,
          usuarioId,
          empresaId,
          mensagem,
          error.message
        ]
      );

      return {
        success: false,
        error: error.message
      };
    }
  },

  async getHistoricoMensagens(contatoId: number, empresaId: number, limit = 50): Promise<any[]> {
    const result = await query(
      `SELECT hm.*, u.nome as usuario_nome
       FROM historico_mensagens hm
       LEFT JOIN usuarios u ON hm.usuario_id = u.id
       WHERE hm.contato_whatsapp_id = $1 AND hm.empresa_id = $2
       ORDER BY hm.enviado_at DESC
       LIMIT $3`,
      [contatoId, empresaId, limit]
    );
    return result.rows;
  },

  async enviarMedia(
    usuarioId: number,
    empresaId: number,
    contatoId: number,
    filePath: string,
    originalFilename: string,
    mimetype: string,
    fileSize: number,
    caption?: string,
    leadId?: number
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const contato = await this.getById(contatoId, empresaId);
    if (!contato) {
      throw new Error('Contato nao encontrado');
    }

    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) {
      throw new Error('WhatsApp nao configurado');
    }

    // Mover arquivo para pasta da empresa
    const empresaDir = path.join(UPLOADS_DIR, String(empresaId));
    if (!fs.existsSync(empresaDir)) {
      fs.mkdirSync(empresaDir, { recursive: true });
    }

    const ext = path.extname(originalFilename) || '';
    const safeFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destPath = path.join(empresaDir, safeFilename);
    fs.copyFileSync(filePath, destPath);

    // Converter para base64
    const fileBuffer = fs.readFileSync(destPath);
    const base64 = fileBuffer.toString('base64');

    // Determinar tipo da mensagem
    let tipo = 'documento';
    if (mimetype.startsWith('image/')) tipo = 'imagem';
    else if (mimetype.startsWith('audio/')) tipo = 'audio';
    else if (mimetype.startsWith('video/')) tipo = 'video';

    const mediaUrl = `/uploads/whatsapp/${empresaId}/${safeFilename}`;

    try {
      const response = await axios.post(`http://localhost:${porta}/send-media`, {
        number: contato.whatsapp_id,
        media: base64,
        mimetype,
        filename: originalFilename,
        caption: caption || undefined
      }, {
        timeout: 60000
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao enviar midia');
      }

      // Registrar no historico
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          whatsapp_message_id, direcao, tipo, conteudo,
          media_url, media_filename, media_mimetype, media_tamanho,
          enviado_at
        ) VALUES ($1, $2, $3, $4, $5, 'saida', $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
        [
          leadId || null,
          contatoId,
          usuarioId,
          empresaId,
          response.data.messageId || null,
          tipo,
          caption || null,
          mediaUrl,
          originalFilename,
          mimetype,
          fileSize
        ]
      );

      // Atualizar lead
      if (leadId) {
        await query(
          `UPDATE leads SET
            data_ultimo_contato = CURRENT_TIMESTAMP,
            aguardando_resposta = true
          WHERE id = $1`,
          [leadId]
        );
      }

      return { success: true, messageId: response.data.messageId };
    } catch (error: any) {
      // Registrar erro
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          direcao, tipo, conteudo, media_url, media_filename, media_mimetype, media_tamanho,
          erro, enviado_at
        ) VALUES ($1, $2, $3, $4, 'saida', $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
        [
          leadId || null, contatoId, usuarioId, empresaId,
          tipo, caption || null,
          mediaUrl, originalFilename, mimetype, fileSize,
          error.message
        ]
      );

      return { success: false, error: error.message };
    }
  },

  async marcarLido(contatoId: number, empresaId: number, leadId?: number): Promise<void> {
    // Marcar mensagens de entrada como lidas (filtrar por empresa)
    await query(
      `UPDATE historico_mensagens SET lido_at = CURRENT_TIMESTAMP
       WHERE contato_whatsapp_id = $1 AND empresa_id = $2 AND direcao = 'entrada' AND lido_at IS NULL`,
      [contatoId, empresaId]
    );

    // Zerar contador no contato
    await query(
      `UPDATE contatos_whatsapp SET mensagens_nao_lidas = 0 WHERE id = $1 AND empresa_id = $2`,
      [contatoId, empresaId]
    );

    // Zerar contador no lead se informado
    if (leadId) {
      await query(
        `UPDATE leads SET mensagens_nao_lidas = 0 WHERE id = $1`,
        [leadId]
      );
    }
  },

  async registrarWebhook(usuarioId: number): Promise<{ success: boolean; error?: string }> {
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) {
      return { success: false, error: 'WhatsApp nao configurado' };
    }

    try {
      const webhookUrl = `http://localhost:4100/api/crm/webhook/whatsapp`;
      await axios.post(`http://localhost:${porta}/webhook/register`, {
        url: webhookUrl,
        secret: WEBHOOK_SECRET
      }, { timeout: 5000 });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getGrupos(usuarioId: number): Promise<any[]> {
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) throw new Error('WhatsApp não configurado');

    try {
      const response = await axios.get(`http://localhost:${porta}/groups`, { timeout: 30000 });
      if (!response.data.success) throw new Error('Erro ao buscar grupos do WhatsApp');
      return response.data.groups || [];
    } catch (error: any) {
      if (error.response?.status === 503 || error.response?.data?.error?.includes('não conectado')) {
        throw new Error('WhatsApp não conectado');
      }
      throw error;
    }
  },

  async getParticipantesGrupo(usuarioId: number, groupId: string): Promise<any> {
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) throw new Error('WhatsApp não configurado');

    const encodedId = encodeURIComponent(groupId);
    const response = await axios.get(`http://localhost:${porta}/groups/${encodedId}/participants`, {
      timeout: 15000
    });
    if (!response.data.success) throw new Error('Erro ao buscar participantes do grupo');
    return response.data;
  },

  async importarParticipantesComoLeads(
    usuarioId: number,
    empresaId: number,
    groupId: string,
    funilId: number,
    participanteIds: Array<string | { id: string; number?: string }>,
    estagioIdParam?: number,
    responsavelId?: number
  ): Promise<{ criados: number; jaExistem: number }> {
    let criados = 0;
    let jaExistem = 0;

    let estagioId: number;

    if (estagioIdParam) {
      // Validar que o estágio pertence ao funil
      const estagioResult = await query(
        `SELECT id FROM estagios_funil WHERE id = $1 AND funil_id = $2 LIMIT 1`,
        [estagioIdParam, funilId]
      );
      if (!estagioResult.rows[0]) {
        throw new Error('Estágio não pertence ao funil informado');
      }
      estagioId = estagioIdParam;
    } else {
      // Usar estágio de entrada do funil
      const estagioResult = await query(
        `SELECT id FROM estagios_funil WHERE funil_id = $1 AND is_entrada = true LIMIT 1`,
        [funilId]
      );
      if (!estagioResult.rows[0]) {
        throw new Error('Funil não possui estágio de entrada configurado');
      }
      estagioId = estagioResult.rows[0].id;
    }

    for (const participante of participanteIds) {
      const participantId = typeof participante === 'string' ? participante : participante.id;
      // Participantes @lid usam Meta ID — usar o campo number que contém o telefone real
      const phoneFromNumber = typeof participante === 'object' && participante.number ? participante.number.replace(/\D/g, '') : null;
      const numero = phoneFromNumber || participantId.replace(/@.*$/, '');
      // Rejeitar se não parecer telefone válido (IDs do Meta com 15+ dígitos sem number)
      if (!phoneFromNumber && numero.replace(/\D/g, '').length > 15) continue;

      // Verificar se já existe lead com esse número
      const numerosVariantes = [numero];
      if (numero.startsWith('55') && numero.length >= 12) numerosVariantes.push(numero.slice(2));
      else numerosVariantes.push(`55${numero}`);

      const leadExistente = await query(
        `SELECT l.id FROM leads l
         LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
         WHERE l.empresa_id = $1
           AND l.arquivado = false
           AND (
             cw.numero = ANY($2::text[])
             OR REGEXP_REPLACE(COALESCE(l.telefone, ''), '[^0-9]', '', 'g') = ANY($2::text[])
           )
         LIMIT 1`,
        [empresaId, numerosVariantes]
      );

      if (leadExistente.rows[0]) {
        jaExistem++;
        continue;
      }

      // Criar contato WhatsApp se não existir
      const whatsappId = `${numero}@c.us`;
      const contatoResult = await query(
        `INSERT INTO contatos_whatsapp (usuario_id, empresa_id, whatsapp_id, numero, is_grupo, sincronizado_at)
         VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP)
         ON CONFLICT (usuario_id, whatsapp_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [usuarioId, empresaId, whatsappId, numero]
      );
      const contatoId = contatoResult.rows[0].id;

      // Criar lead vinculado ao contato
      await query(
        `INSERT INTO leads (
           usuario_id, empresa_id, funil_id, estagio_id,
           contato_whatsapp_id, nome, telefone, origem, temperatura, responsavel_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'whatsapp', 'frio', $8)`,
        [
          usuarioId, empresaId, funilId, estagioId,
          contatoId,
          `Participante ${numero}`,
          numero,
          responsavelId || null
        ]
      );

      criados++;
    }

    return { criados, jaExistem };
  }
};
