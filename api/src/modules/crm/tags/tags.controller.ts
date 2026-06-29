import { Request, Response, NextFunction } from 'express';
import { tagsService } from './tags.service';

export const tagsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const tags = await tagsService.list(empresaId);
      res.json(tags);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const tag = await tagsService.getById(parseInt(id), empresaId);
      if (!tag) {
        return res.status(404).json({ message: 'Tag não encontrada' });
      }

      res.json(tag);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { nome, cor } = req.body;

      if (!nome) {
        return res.status(400).json({ message: 'nome é obrigatório' });
      }

      const tag = await tagsService.create(empresaId, { nome, cor });
      res.status(201).json(tag);
    } catch (error: any) {
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ message: 'Já existe uma tag com este nome' });
      }
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { nome, cor } = req.body;

      const tag = await tagsService.update(parseInt(id), empresaId, { nome, cor });
      if (!tag) {
        return res.status(404).json({ message: 'Tag não encontrada' });
      }

      res.json(tag);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ message: 'Já existe uma tag com este nome' });
      }
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const deleted = await tagsService.delete(parseInt(id), empresaId);
      if (!deleted) {
        return res.status(404).json({ message: 'Tag não encontrada' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
};
