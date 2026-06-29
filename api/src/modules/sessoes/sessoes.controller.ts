import { Response } from 'express';
import { sessoesService } from './sessoes.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const sessoesController = {
  async list(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;

      // Multi-tenancy: passar usuario_id e funcao para filtrar dados
      const filters = {
        ...req.query,
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };

      const result = await sessoesService.list(filters, page, pageSize);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ code: 'ERROR', message: error.message });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await sessoesService.getById(req.params.id, filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ code: 'NOT_FOUND', message: error.message });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      // Multi-tenancy: adicionar usuario_id automaticamente
      const data = {
        ...req.body,
        usuario_id: req.user?.userId
      };
      const result = await sessoesService.create(data);
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'CREATE_ERROR', message: error.message });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await sessoesService.update(req.params.id, req.body, filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      await sessoesService.delete(req.params.id, filters);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ code: 'DELETE_ERROR', message: error.message });
    }
  }
};
