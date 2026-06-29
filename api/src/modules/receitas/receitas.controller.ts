import { Response } from 'express';
import { receitasService } from './receitas.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const receitasController = {
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

      const result = await receitasService.list(filters, page, pageSize);
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
      const result = await receitasService.getById(req.params.id, filters);
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
      const result = await receitasService.create(data);
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
      const result = await receitasService.update(req.params.id, req.body, filters);
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
      await receitasService.delete(req.params.id, filters);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ code: 'DELETE_ERROR', message: error.message });
    }
  },

  // NOVO: Listar receitas sem cliente
  async listSemCliente(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await receitasService.listSemCliente(filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ code: 'ERROR', message: error.message });
    }
  },

  // NOVO: Vincular cliente a receita
  async vincularCliente(req: AuthRequest, res: Response) {
    try {
      const { cliente_id } = req.body;

      if (!cliente_id) {
        return res.status(400).json({
          code: 'INVALID_DATA',
          message: 'Campo "cliente_id" é obrigatório'
        });
      }

      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };

      const result = await receitasService.vincularCliente(
        req.params.id,
        cliente_id,
        filters
      );

      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({
        code: 'VINCULAR_ERROR',
        message: error.message
      });
    }
  }
};
