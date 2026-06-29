import { Request, Response, NextFunction } from 'express';
import { funisService } from './funis.service';

export const funisController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const tipo = req.query.tipo as 'aquisicao' | 'cx' | undefined;
      const funis = await funisService.list(empresaId, tipo);
      res.json(funis);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const funil = await funisService.getById(parseInt(id), empresaId);
      if (!funil) {
        return res.status(404).json({ message: 'Funil não encontrado' });
      }

      res.json(funil);
    } catch (error) {
      next(error);
    }
  },

  async getDefault(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const funil = await funisService.getOrCreateDefault(empresaId, usuarioId);
      res.json(funil);
    } catch (error) {
      next(error);
    }
  },

  async getDefaultCX(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const funil = await funisService.getOrCreateDefaultCX(empresaId, usuarioId);
      res.json(funil);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { nome, descricao, padrao, tipo, padrao_cx } = req.body;

      if (!nome) {
        return res.status(400).json({ message: 'Nome é obrigatório' });
      }

      const funil = await funisService.create(empresaId, usuarioId, { nome, descricao, padrao, tipo, padrao_cx });
      res.status(201).json(funil);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { nome, descricao, ativo, padrao, tipo, padrao_cx } = req.body;

      const funil = await funisService.update(parseInt(id), empresaId, {
        nome,
        descricao,
        ativo,
        padrao,
        tipo,
        padrao_cx
      });

      if (!funil) {
        return res.status(404).json({ message: 'Funil não encontrado' });
      }

      res.json(funil);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      await funisService.delete(parseInt(id), empresaId);
      res.status(204).send();
    } catch (error: any) {
      if (error.message.includes('Não é possível')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const stats = await funisService.getStats(parseInt(id), empresaId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
};
