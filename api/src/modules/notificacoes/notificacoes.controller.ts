import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { notificacoesService } from './notificacoes.service';

export const notificacoesController = {
  async list(req: AuthRequest, res: Response) {
    try {
      const filters = {
        ...req.query,
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };

      const result = await notificacoesService.list(filters);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };

      const notificacao = await notificacoesService.getById(id, filters);
      res.json(notificacao);
    } catch (error: any) {
      res.status(404).json({ message: error.message });
    }
  },

  async getStats(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };

      const stats = await notificacoesService.getStats(filters);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  async getByCliente(req: AuthRequest, res: Response) {
    try {
      const { clienteId } = req.params;
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };

      const notificacoes = await notificacoesService.getByCliente(parseInt(clienteId), filters);
      res.json(notificacoes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
};
