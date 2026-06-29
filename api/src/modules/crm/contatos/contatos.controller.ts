import { Response, NextFunction } from 'express';
import { contatosService } from './contatos.service';
import { leadsService } from '../leads/leads.service';
import { AuthRequest } from '../../../middlewares/auth.middleware';

export const contatosController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { grupos } = req.query;

      const contatos = await contatosService.list(empresaId, grupos !== 'true');
      res.json(contatos);
    } catch (error) {
      next(error);
    }
  },

  async listNaoConvertidos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { funil_id } = req.query;

      const contatos = await contatosService.listNaoConvertidos(
        empresaId,
        funil_id ? parseInt(funil_id as string) : undefined
      );
      res.json(contatos);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;

      const contato = await contatosService.getById(parseInt(id), empresaId);
      if (!contato) {
        return res.status(404).json({ message: 'Contato não encontrado' });
      }

      res.json(contato);
    } catch (error) {
      next(error);
    }
  },

  async sincronizar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const usuarioId = req.user!.userId;
      const empresaId = req.user!.empresa_id;

      const resultado = await contatosService.sincronizar(usuarioId, empresaId);
      res.json({
        success: true,
        ...resultado,
        message: `Sincronização concluída: ${resultado.novos} novos, ${resultado.atualizados} atualizados`
      });
    } catch (error: any) {
      // Erros esperados retornam 400
      if (error.message.includes('não configurado') ||
          error.message.includes('não está conectado') ||
          error.message.includes('não está rodando')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async enviarMensagem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const usuarioId = req.user!.userId;
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;
      const { mensagem, lead_id } = req.body;

      if (!mensagem) {
        return res.status(400).json({ message: 'mensagem é obrigatória' });
      }

      const resultado = await contatosService.enviarMensagem(
        usuarioId,
        empresaId,
        parseInt(id),
        mensagem,
        lead_id
      );

      if (!resultado.success) {
        return res.status(400).json({ message: resultado.error });
      }

      // Se tiver lead, registrar atividade
      if (lead_id) {
        await leadsService.registrarAtividade(
          lead_id,
          usuarioId,
          empresaId,
          'mensagem_enviada',
          `Mensagem enviada: "${mensagem.substring(0, 50)}${mensagem.length > 50 ? '...' : ''}"`,
          { mensagem, messageId: resultado.messageId }
        );
      }

      res.json(resultado);
    } catch (error: any) {
      if (error.message.includes('não encontrado') || error.message.includes('não configurado')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async getHistorico(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;
      const { limit } = req.query;

      const mensagens = await contatosService.getHistoricoMensagens(
        parseInt(id),
        empresaId,
        limit ? parseInt(limit as string) : 50
      );
      res.json(mensagens);
    } catch (error) {
      next(error);
    }
  },

  async enviarMedia(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const usuarioId = req.user!.userId;
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;
      const { caption, lead_id } = req.body;
      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({ message: 'Arquivo obrigatorio' });
      }

      const resultado = await contatosService.enviarMedia(
        usuarioId,
        empresaId,
        parseInt(id),
        file.path,
        file.originalname,
        file.mimetype,
        file.size,
        caption,
        lead_id ? parseInt(lead_id) : undefined
      );

      if (!resultado.success) {
        return res.status(400).json({ message: resultado.error });
      }

      // Registrar atividade se tiver lead
      if (lead_id) {
        await leadsService.registrarAtividade(
          parseInt(lead_id),
          usuarioId,
          empresaId,
          'mensagem_enviada',
          `Midia enviada: ${file.originalname}`,
          { filename: file.originalname, mimetype: file.mimetype, messageId: resultado.messageId }
        );
      }

      // Limpar arquivo temporario do multer
      const fs = require('fs');
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      res.json(resultado);
    } catch (error: any) {
      if (error.message.includes('nao encontrado') || error.message.includes('nao configurado')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async marcarLido(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;
      const { lead_id } = req.body;

      await contatosService.marcarLido(
        parseInt(id),
        empresaId,
        lead_id ? parseInt(lead_id) : undefined
      );

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  async registrarWebhook(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const usuarioId = req.user!.userId;
      const resultado = await contatosService.registrarWebhook(usuarioId);
      res.json(resultado);
    } catch (error) {
      next(error);
    }
  },

  async getGrupos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const usuarioId = req.user!.userId;
      const grupos = await contatosService.getGrupos(usuarioId);
      res.json({ success: true, grupos });
    } catch (error: any) {
      if (error.message.includes('não configurado') || error.message.includes('não conectado')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async getParticipantesGrupo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const usuarioId = req.user!.userId;
      const { groupId } = req.params;
      const data = await contatosService.getParticipantesGrupo(usuarioId, groupId);
      res.json({ success: true, ...data });
    } catch (error: any) {
      if (error.message.includes('não configurado')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async importarParticipantesComoLeads(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const usuarioId = req.user!.userId;
      const empresaId = req.user!.empresa_id;
      const { groupId } = req.params;
      const { funil_id, estagio_id, participantes, responsavel_id } = req.body;

      if (!funil_id) {
        return res.status(400).json({ message: 'funil_id é obrigatório' });
      }
      if (!participantes || !Array.isArray(participantes) || participantes.length === 0) {
        return res.status(400).json({ message: 'participantes é obrigatório (array de IDs)' });
      }

      const resultado = await contatosService.importarParticipantesComoLeads(
        usuarioId, empresaId, groupId, parseInt(funil_id), participantes,
        estagio_id ? parseInt(estagio_id) : undefined,
        responsavel_id ? parseInt(responsavel_id) : undefined
      );

      res.json({ success: true, ...resultado });
    } catch (error: any) {
      if (error.message.includes('não configurado') || error.message.includes('não possui estágio')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }
};
