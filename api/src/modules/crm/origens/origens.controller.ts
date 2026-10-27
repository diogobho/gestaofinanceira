import { Request, Response, NextFunction } from 'express';
import { origensService } from './origens.service';

export const origensController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const origens = await origensService.list(empresaId);
      res.json(origens);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { nome, cor } = req.body;

      if (!nome || !nome.trim()) {
        return res.status(400).json({ message: 'nome é obrigatório' });
      }

      const origem = await origensService.create(empresaId, { nome, cor });
      res.status(201).json(origem);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ message: 'Já existe uma origem com este nome' });
      }
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { nome, cor } = req.body;

      const origem = await origensService.update(parseInt(id), empresaId, { nome, cor });
      if (!origem) {
        return res.status(404).json({ message: 'Origem não encontrada' });
      }
      res.json(origem);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ message: 'Já existe uma origem com este nome' });
      }
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const ok = await origensService.delete(parseInt(id), empresaId);
      if (!ok) {
        return res.status(404).json({ message: 'Origem não encontrada' });
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
};
