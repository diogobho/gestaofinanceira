import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../../config/database';
import { instancia } from './canal/instancia';
import { ehPortaVirtual, contaAtivaDoUsuario } from './canal/contas';
import { temCapacidade } from '../../shared/capacidades';
import { whatsappProvisionService } from '../../services/whatsapp-provision.service';

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

      // Sem porta (conta anterior à provisão no cadastro, ou uma que falhou):
      // reserva agora e a instância sobe em segundo plano — a tela já faz poll do
      // status. Com porta, confere se a instância está no ar (no máximo a cada 5 min).
      const porta = await whatsappProvisionService.garantirWhatsApp(usuarioId);
      if (porta) user.whatsapp_porta = porta;

      // Conta com direito ao número oficial e ainda sem canal não recebe instância
      // Baileys sozinha (ver whatsapp-provision.service). A tela precisa saber que
      // isso é uma ESCOLHA pendente, não uma falha de provisão — senão volta a
      // dizer "entre em contato com o administrador" a quem acabou de assinar.
      const empresaId = (req as any).user?.empresa_id;
      const conta = await contaAtivaDoUsuario(usuarioId, empresaId);
      const podeOficial = empresaId ? await temCapacidade(empresaId, 'whatsapp_oficial') : false;

      return res.json({
        configurado: !!user.whatsapp_porta,
        porta: user.whatsapp_porta,
        conectado: user.whatsapp_conectado || false,
        ultimaConexao: user.whatsapp_ultima_conexao,
        canal: conta ? 'cloud_api' : user.whatsapp_porta ? 'baileys' : 'nenhum',
        podeOficial,
        // Só quem tem direito ao oficial pode estar sem canal por escolha; para o
        // resto, sem porta é falha de provisão, e o texto da tela é outro.
        aguardandoEscolhaDeCanal: !user.whatsapp_porta && podeOficial,
      });

    } catch (error: any) {
      console.error('Erro ao obter config WhatsApp:', error);
      return res.status(500).json({ error: 'Erro ao obter configuração' });
    }
  }

  /**
   * Provisiona a instância Baileys a pedido do usuário.
   *
   * Existe por causa da conta Enterprise: ela não ganha instância automática (o
   * canal dela é o oficial), mas o QR Code continua disponível — é o único lugar
   * onde há grupos e sincronização de contatos. Quem clica aqui está escolhendo.
   */
  async ativarQr(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;
      if (!usuarioId) return res.status(401).json({ error: 'Usuário não autenticado' });

      const porta = await whatsappProvisionService.garantirWhatsApp(usuarioId, { permitirQrNovo: true });
      if (!porta) {
        return res.status(409).json({
          error: 'Não foi possível preparar o QR Code agora. Tente de novo em alguns minutos.',
        });
      }
      if (ehPortaVirtual(porta)) {
        return res.status(409).json({
          error: 'Este usuário está no número oficial da Meta, que não usa QR Code. Desconecte o número oficial antes.',
        });
      }
      return res.json({ success: true, porta });
    } catch (error: any) {
      console.error('Erro ao ativar QR:', error);
      return res.status(500).json({ error: 'Erro ao preparar o QR Code' });
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
      const response = await instancia(porta).get(`/status`, { timeout: 5000 });

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
      const response = await instancia(porta).get(`/qr`, { timeout: 5000 });

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
      const response = await instancia(porta).get(`/qr-image`, {
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
      const response = await instancia(whatsapp_porta).post(`/send`,
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
      if (ehPortaVirtual(porta)) {
        return res.status(409).json({
          error: 'O número oficial não se desconecta por aqui: ele fica conectado na Meta. Para voltar ao QR Code, a DuoFuturo desliga o número oficial da empresa no painel da Cloud API.',
        });
      }
      if (porta) {
        try {
          await instancia(porta).post(`/logout`, {}, { timeout: 10000 });
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
   * Reconectar agora — a saída manual de um chip travado.
   *
   * Sem `novo`, tenta o MESMO número: é o caminho de quem teve o chip
   * desbloqueado pela Meta e não quer esperar a sonda automática da instância.
   * Com `novo: true`, apaga a sessão e volta a emitir QR Code para pareamento de
   * outro número — sem reiniciar processo, que era a única forma antes e trazia
   * a marca de banido de volta do disco.
   */
  async reconectar(req: Request, res: Response) {
    try {
      const usuarioId = (req as any).user?.userId;
      const novo = req.body?.novo === true;

      const result = await pool.query(
        'SELECT whatsapp_porta FROM usuarios WHERE id = $1',
        [usuarioId]
      );
      const porta = result.rows[0]?.whatsapp_porta;
      if (!porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const { data } = await instancia(porta).post(`/reconectar${novo ? '?novo=1' : ''}`,
        {}, { timeout: 15000 }
      );

      await pool.query('UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1', [usuarioId]);
      return res.json(data);

    } catch (error: any) {
      console.error('Erro ao reconectar WhatsApp:', error.message);
      return res.status(503).json({
        error: 'A instância de WhatsApp não respondeu ao pedido de reconexão',
        details: error.message,
      });
    }
  }

  /**
   * Reconectar o chip de um usuário da empresa (masterOnly)
   */
  async reconectarUsuario(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const userId = parseInt(req.params.userId, 10);
      const novo = req.body?.novo === true;

      const result = await pool.query(
        'SELECT whatsapp_porta FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true',
        [userId, empresaId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
      }
      const porta = result.rows[0]?.whatsapp_porta;
      if (!porta) {
        return res.status(404).json({ error: 'WhatsApp não configurado para este usuário' });
      }

      const { data } = await instancia(porta).post(`/reconectar${novo ? '?novo=1' : ''}`,
        {}, { timeout: 15000 }
      );

      await pool.query('UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1', [userId]);
      return res.json(data);

    } catch (error: any) {
      console.error('Erro ao reconectar WhatsApp do usuário:', error.message);
      return res.status(503).json({
        error: 'A instância de WhatsApp não respondeu ao pedido de reconexão',
        details: error.message,
      });
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
      if (ehPortaVirtual(porta)) {
        return res.status(409).json({
          error: 'O número oficial não se desconecta por aqui: ele fica conectado na Meta. Para voltar ao QR Code, a DuoFuturo desliga o número oficial da empresa no painel da Cloud API.',
        });
      }
      if (porta) {
        try {
          await instancia(porta).post(`/logout`, {}, { timeout: 10000 });
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

      const sql = `SELECT id, nome, email, whatsapp_porta, whatsapp_conectado, whatsapp_ultima_conexao
         FROM usuarios WHERE empresa_id = $1 AND ativo = true ORDER BY nome`;
      let result = await pool.query(sql, [empresaId]);

      // Quem da equipe ainda não tem porta ganha uma aqui (mesma regra do getConfig).
      // Numa empresa com direito ao número oficial isso devolve null de propósito:
      // o canal dela é o oficial, e quem quiser QR pede pelo botão.
      const semPorta = result.rows.filter((u: any) => !u.whatsapp_porta);
      if (semPorta.length) {
        await Promise.all(semPorta.map((u: any) => whatsappProvisionService.garantirWhatsApp(u.id)));
        result = await pool.query(sql, [empresaId]);
      }

      const podeOficial = empresaId ? await temCapacidade(empresaId, 'whatsapp_oficial') : false;

      return res.json(result.rows.map((u: any) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        configurado: !!u.whatsapp_porta,
        porta: u.whatsapp_porta,
        conectado: u.whatsapp_conectado || false,
        ultimaConexao: u.whatsapp_ultima_conexao,
        canal: ehPortaVirtual(u.whatsapp_porta) ? 'cloud_api' : u.whatsapp_porta ? 'baileys' : 'nenhum',
        podeOficial,
      })));

    } catch (error: any) {
      console.error('Erro ao listar usuários empresa:', error);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  }

  /**
   * Administrador pedindo o QR Code para um usuário da equipe (masterOnly).
   *
   * Mesma decisão do `ativarQr`, um nível acima: numa empresa com direito ao
   * número oficial ninguém ganha instância Baileys sozinho, e é o administrador
   * quem escolhe o canal de cada operador.
   */
  async ativarQrUsuario(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const userId = parseInt(req.params.userId, 10);
      const dono = await pool.query(
        'SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true',
        [userId, empresaId]
      );
      if (dono.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });

      const porta = await whatsappProvisionService.garantirWhatsApp(userId, { permitirQrNovo: true });
      if (!porta) {
        return res.status(409).json({ error: 'Não foi possível preparar o QR Code agora. Tente de novo em alguns minutos.' });
      }
      if (ehPortaVirtual(porta)) {
        return res.status(409).json({
          error: 'Este usuário está no número oficial da Meta, que não usa QR Code. Desconecte o número oficial antes.',
        });
      }
      return res.json({ success: true, porta });
    } catch (error: any) {
      console.error('Erro ao ativar QR do usuário:', error);
      return res.status(500).json({ error: 'Erro ao preparar o QR Code' });
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
        const response = await instancia(porta).get(`/status`, { timeout: 5000 });

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

      const response = await instancia(porta).get(`/qr-image`, {
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
