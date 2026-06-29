import { Response, NextFunction } from 'express';
import { instanciasService } from './instancias.service';
import { AuthRequest } from '../../../middlewares/auth.middleware';

export const instanciasController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const instancias = await instanciasService.list(empresaId);
      res.json(instancias);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;

      const instancia = await instanciasService.getById(parseInt(id), empresaId);
      if (!instancia) {
        return res.status(404).json({ message: 'Instância não encontrada' });
      }

      res.json(instancia);
    } catch (error) {
      next(error);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { nome, descricao, porta } = req.body;

      if (!nome) {
        return res.status(400).json({ message: 'Nome é obrigatório' });
      }
      if (!porta) {
        return res.status(400).json({ message: 'Porta é obrigatória' });
      }

      const instancia = await instanciasService.create(empresaId, { nome, descricao, porta });
      res.status(201).json(instancia);
    } catch (error: any) {
      if (error.message.includes('já está em uso')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;
      const { nome, descricao, ativo } = req.body;

      const instancia = await instanciasService.update(parseInt(id), empresaId, { nome, descricao, ativo });
      if (!instancia) {
        return res.status(404).json({ message: 'Instância não encontrada' });
      }

      res.json(instancia);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;

      const deleted = await instanciasService.delete(parseInt(id), empresaId);
      if (!deleted) {
        return res.status(404).json({ message: 'Instância não encontrada' });
      }

      res.json({ message: 'Instância deletada com sucesso' });
    } catch (error: any) {
      if (error.message.includes('contatos associados')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async getStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;

      const status = await instanciasService.getStatus(parseInt(id), empresaId);
      res.json(status);
    } catch (error: any) {
      if (error.message.includes('não encontrada')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  async getQRCode(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;

      const result = await instanciasService.getQRCode(parseInt(id), empresaId);
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('não encontrada')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(400).json({ message: error.message });
    }
  },

  async disconnect(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { id } = req.params;

      await instanciasService.disconnect(parseInt(id), empresaId);
      res.json({ message: 'Desconectado com sucesso' });
    } catch (error: any) {
      if (error.message.includes('não encontrada')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(400).json({ message: error.message });
    }
  }
};
