import { Request, Response } from 'express';
import { anotacoesService, CreateAnotacaoDto, UpdateAnotacaoDto } from './anotacoes.service';

export const anotacoesController = {
  async listByLead(req: Request, res: Response) {
    try {
      const leadId = parseInt(req.params.leadId);
      const empresaId = (req as any).user.empresa_id;

      const anotacoes = await anotacoesService.listByLead(leadId, empresaId);
      res.json(anotacoes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const empresaId = (req as any).user.empresa_id;

      const anotacao = await anotacoesService.getById(id, empresaId);

      if (!anotacao) {
        return res.status(404).json({ error: 'Anotação não encontrada' });
      }

      res.json(anotacao);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const data: CreateAnotacaoDto = req.body;

      const anotacao = await anotacoesService.create(empresaId, usuarioId, data);
      res.status(201).json(anotacao);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const empresaId = (req as any).user.empresa_id;
      const data: UpdateAnotacaoDto = req.body;

      const anotacao = await anotacoesService.update(id, empresaId, data);

      if (!anotacao) {
        return res.status(404).json({ error: 'Anotação não encontrada' });
      }

      res.json(anotacao);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const empresaId = (req as any).user.empresa_id;

      const deleted = await anotacoesService.delete(id, empresaId);

      if (!deleted) {
        return res.status(404).json({ error: 'Anotação não encontrada' });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
};
