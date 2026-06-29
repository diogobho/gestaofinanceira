import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../../config/database';

export class WhatsAppController {
  /**
   * Obter configuração WhatsApp do usuário logado
   */
  async getConfig(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;

      if (!usuarioId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const result = await pool.query(
        'SELECT whatsapp_porta, whatsapp_conectado, whatsapp_ultima_conexao FROM usuarios WHERE id = $1',
        [usuarioId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const user = result.rows[0];

      return res.json({
        configurado: !!user.whatsapp_porta,
        porta: user.whatsapp_porta,
        conectado: user.whatsapp_conectado || false,
        ultimaConexao: user.whatsapp_ultima_conexao
      });

    } catch (error: any) {
      console.error('Erro ao obter config WhatsApp:', error);
      return res.status(500).json({ error: 'Erro ao obter configuração' });
    }
  }

  /**
   * Configurar porta WhatsApp do usuário
   * Apenas admin pode alterar
   */
  async setConfig(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;
      const { porta } = req.body;

      if (!usuarioId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      if (!porta || porta < 3000 || porta > 4000) {
        return res.status(400).json({ error: 'Porta inválida' });
      }

      // Verificar se porta já está em uso por outro usuário
      const existente = await pool.query(
        'SELECT id FROM usuarios WHERE whatsapp_porta = $1 AND id != $2',
        [porta, usuarioId]
      );

      if (existente.rows.length > 0) {
        return res.status(400).json({ error: 'Porta já está em uso por outro usuário' });
      }

      await pool.query(
        'UPDATE usuarios SET whatsapp_porta = $1 WHERE id = $2',
        [porta, usuarioId]
      );

      return res.json({ success: true, porta });

    } catch (error: any) {
      console.error('Erro ao configurar WhatsApp:', error);
      return res.status(500).json({ error: 'Erro ao configurar' });
    }
  }

  /**
   * Obter status da conexão WhatsApp
   */
  async getStatus(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;

      const result = await pool.query(
        'SELECT whatsapp_porta FROM usuarios WHERE id = $1',
        [usuarioId]
      );

      if (result.rows.length === 0 || !result.rows[0].whatsapp_porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const porta = result.rows[0].whatsapp_porta;

      // Fazer proxy para instância WhatsApp
      const response = await axios.get(`http://localhost:${porta}/status`, { timeout: 5000 });

      // Atualizar status no banco
      if (response.data.status === 'connected') {
        await pool.query(
          'UPDATE usuarios SET whatsapp_conectado = TRUE, whatsapp_ultima_conexao = NOW() WHERE id = $1',
          [usuarioId]
        );
      } else {
        await pool.query(
          'UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1',
          [usuarioId]
        );
      }

      return res.json(response.data);

    } catch (error: any) {
      console.error('Erro ao obter status:', error);

      // Atualizar como desconectado
      await pool.query(
        'UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1',
        [(req as any).user?.userId]
      );

      return res.status(503).json({
        error: 'Erro ao conectar com WhatsApp',
        details: error.message
      });
    }
  }

  /**
   * Obter QR Code
   */
  async getQRCode(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;

      const result = await pool.query(
        'SELECT whatsapp_porta FROM usuarios WHERE id = $1',
        [usuarioId]
      );

      if (result.rows.length === 0 || !result.rows[0].whatsapp_porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const porta = result.rows[0].whatsapp_porta;

      // Fazer proxy para instância WhatsApp
      const response = await axios.get(`http://localhost:${porta}/qr`, { timeout: 5000 });

      return res.json(response.data);

    } catch (error: any) {
      console.error('Erro ao obter QR Code:', error);
      return res.status(503).json({
        error: 'Erro ao obter QR Code',
        details: error.message
      });
    }
  }

  /**
   * Obter QR Code como imagem
   */
  async getQRImage(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;

      const result = await pool.query(
        'SELECT whatsapp_porta FROM usuarios WHERE id = $1',
        [usuarioId]
      );

      if (result.rows.length === 0 || !result.rows[0].whatsapp_porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const porta = result.rows[0].whatsapp_porta;

      // Fazer proxy para instância WhatsApp
      const response = await axios.get(`http://localhost:${porta}/qr-image`, {
        timeout: 5000,
        responseType: 'arraybuffer'
      });

      res.set('Content-Type', 'image/png');
      return res.send(response.data);

    } catch (error: any) {
      console.error('Erro ao obter QR Image:', error);
      return res.status(503).json({
        error: 'Erro ao obter imagem do QR Code',
        details: error.message
      });
    }
  }

  /**
   * Enviar mensagem de teste
   */
  async sendTest(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;
      const { numero } = req.body;

      if (!numero) {
        return res.status(400).json({ error: 'Número não informado' });
      }

      const result = await pool.query(
        'SELECT whatsapp_porta, nome FROM usuarios WHERE id = $1',
        [usuarioId]
      );

      if (result.rows.length === 0 || !result.rows[0].whatsapp_porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const { whatsapp_porta, nome } = result.rows[0];

      const mensagem = `🧪 Teste de Conexão WhatsApp

Olá! Este é um teste do sistema de notificações.

📅 ${new Date().toLocaleString('pt-BR')}
👤 Usuário: ${nome}

✅ Se você recebeu esta mensagem, seu WhatsApp está conectado e funcionando corretamente!

_Sistema DuoFuturo - Gestão Financeira_`;

      // Enviar via WhatsApp
      const response = await axios.post(
        `http://localhost:${whatsapp_porta}/send`,
        { number: numero, message: mensagem },
        { timeout: 10000 }
      );

      return res.json(response.data);

    } catch (error: any) {
      console.error('Erro ao enviar teste:', error);
      return res.status(503).json({
        error: 'Erro ao enviar mensagem',
        details: error.message
      });
    }
  }

  /**
   * Desconectar WhatsApp (logout real + atualiza DB)
   */
  async disconnect(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;

      const result = await pool.query(
        'SELECT whatsapp_porta FROM usuarios WHERE id = $1',
        [usuarioId]
      );

      const porta = result.rows[0]?.whatsapp_porta;
      if (porta) {
        try {
          await axios.post(`http://localhost:${porta}/logout`, {}, { timeout: 10000 });
        } catch (e: any) {
          console.warn(`Erro ao chamar logout na porta ${porta}:`, e.message);
        }
      }

      await pool.query(
        'UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1',
        [usuarioId]
      );

      return res.json({ success: true, message: 'WhatsApp desconectado' });

    } catch (error: any) {
      console.error('Erro ao desconectar:', error);
      return res.status(500).json({ error: 'Erro ao desconectar' });
    }
  }

  /**
   * Desconectar WhatsApp de um usuário específico da empresa (masterOnly)
   */
  async disconnectUsuario(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const userId = parseInt(req.params.userId, 10);

      const result = await pool.query(
        'SELECT id, whatsapp_porta FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true',
        [userId, empresaId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
      }

      const porta = result.rows[0]?.whatsapp_porta;
      if (porta) {
        try {
          await axios.post(`http://localhost:${porta}/logout`, {}, { timeout: 10000 });
        } catch (e: any) {
          console.warn(`Erro ao chamar logout na porta ${porta}:`, e.message);
        }
      }

      await pool.query(
        'UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1',
        [userId]
      );

      return res.json({ success: true, message: 'WhatsApp desconectado' });

    } catch (error: any) {
      console.error('Erro ao desconectar usuário:', error);
      return res.status(500).json({ error: 'Erro ao desconectar' });
    }
  }

  /**
   * Listar todos os usuários da empresa com status WhatsApp (masterOnly)
   */
  async getEmpresaUsuarios(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;

      const result = await pool.query(
        `SELECT id, nome, email, whatsapp_porta, whatsapp_conectado, whatsapp_ultima_conexao
         FROM usuarios WHERE empresa_id = $1 AND ativo = true ORDER BY nome`,
        [empresaId]
      );

      return res.json(result.rows.map((u: any) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        configurado: !!u.whatsapp_porta,
        porta: u.whatsapp_porta,
        conectado: u.whatsapp_conectado || false,
        ultimaConexao: u.whatsapp_ultima_conexao,
      })));

    } catch (error: any) {
      console.error('Erro ao listar usuários empresa:', error);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  }

  /**
   * Obter status WhatsApp de um usuário específico da empresa (masterOnly)
   */
  async getUsuarioStatus(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const userId = parseInt(req.params.userId, 10);

      const result = await pool.query(
        'SELECT id, whatsapp_porta FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true',
        [userId, empresaId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
      }

      const user = result.rows[0];

      if (!user.whatsapp_porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const porta = user.whatsapp_porta;

      try {
        const response = await axios.get(`http://localhost:${porta}/status`, { timeout: 5000 });

        // Atualizar status no banco
        if (response.data.status === 'connected') {
          await pool.query(
            'UPDATE usuarios SET whatsapp_conectado = TRUE, whatsapp_ultima_conexao = NOW() WHERE id = $1',
            [userId]
          );
        } else {
          await pool.query(
            'UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1',
            [userId]
          );
        }

        return res.json(response.data);
      } catch (proxyError: any) {
        await pool.query(
          'UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1',
          [userId]
        );
        return res.status(503).json({
          error: 'Erro ao conectar com WhatsApp',
          details: proxyError.message
        });
      }

    } catch (error: any) {
      console.error('Erro ao obter status do usuário:', error);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }

  /**
   * Obter QR Code como imagem de um usuário específico da empresa (masterOnly)
   */
  async getUsuarioQRImage(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const userId = parseInt(req.params.userId, 10);

      const result = await pool.query(
        'SELECT id, whatsapp_porta FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true',
        [userId, empresaId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
      }

      const user = result.rows[0];

      if (!user.whatsapp_porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const porta = user.whatsapp_porta;

      const response = await axios.get(`http://localhost:${porta}/qr-image`, {
        timeout: 5000,
        responseType: 'arraybuffer'
      });

      res.set('Content-Type', 'image/png');
      return res.send(response.data);

    } catch (error: any) {
      console.error('Erro ao obter QR Image do usuário:', error);
      return res.status(503).json({
        error: 'Erro ao obter imagem do QR Code',
        details: error.message
      });
    }
  }
}

export default new WhatsAppController();
