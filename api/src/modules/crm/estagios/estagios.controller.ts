import { Request, Response, NextFunction } from 'express';
import { estagiosService } from './estagios.service';

export const estagiosController = {
  async listByFunil(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { funilId } = req.params;

      const estagios = await estagiosService.listByFunil(parseInt(funilId), empresaId);
      res.json(estagios);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const estagio = await estagiosService.getById(parseInt(id), empresaId);
      if (!estagio) {
        return res.status(404).json({ message: 'Estágio não encontrado' });
      }

      res.json(estagio);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { funilId } = req.params;
      const { nome, descricao, cor, icone, is_entrada, is_ganho, is_perdido } = req.body;

      if (!nome) {
        return res.status(400).json({ message: 'Nome é obrigatório' });
      }

      const estagio = await estagiosService.create(parseInt(funilId), empresaId, {
        nome,
        descricao,
        cor,
        icone,
        is_entrada,
        is_ganho,
        is_perdido
      });

      res.status(201).json(estagio);
    } catch (error: any) {
      if (error.message === 'Funil não encontrado') {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { nome, descricao, cor, icone, is_entrada, is_ganho, is_perdido, agente_ia_ativo, instrucoes_agente_ia, estagio_apos_resposta_id, followup_config } = req.body;

      const estagio = await estagiosService.update(parseInt(id), empresaId, {
        nome,
        descricao,
        cor,
        icone,
        is_entrada,
        is_ganho,
        is_perdido,
        agente_ia_ativo,
        instrucoes_agente_ia,
        estagio_apos_resposta_id,
        followup_config
      });

      if (!estagio) {
        return res.status(404).json({ message: 'Estágio não encontrado' });
      }

      res.json(estagio);
    } catch (error) {
      next(error);
    }
  },

  async reorder(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { funilId } = req.params;
      const { estagios } = req.body;

      if (!Array.isArray(estagios)) {
        return res.status(400).json({ message: 'estagios deve ser um array' });
      }

      await estagiosService.reorder(parseInt(funilId), empresaId, estagios);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'Funil não encontrado') {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      await estagiosService.delete(parseInt(id), empresaId);
      res.status(204).send();
    } catch (error: any) {
      if (error.message.includes('Não é possível')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }
};
