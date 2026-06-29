import { Response, NextFunction } from 'express';
import { importacaoService } from './importacao.service';
import { AuthRequest } from '../../../middlewares/auth.middleware';

export const importacaoController = {
  async preview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Arquivo é obrigatório' });
      }

      const result = await importacaoService.preview(req.file.path);
      res.json(result);
    } catch (error: any) {
      if (error.message === 'Arquivo vazio') {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async importar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Arquivo é obrigatório' });
      }

      const empresaId = req.user!.empresa_id;
      const usuarioId = req.user!.id;
      const { funil_id, mapeamento } = req.body;

      if (!funil_id) {
        return res.status(400).json({ message: 'Funil é obrigatório' });
      }

      if (!mapeamento) {
        return res.status(400).json({ message: 'Mapeamento da coluna "nome" é obrigatório' });
      }

      // Parse mapeamento se vier como string
      const mapeamentoParsed = typeof mapeamento === 'string'
        ? JSON.parse(mapeamento)
        : mapeamento;

      if (!mapeamentoParsed.nome) {
        return res.status(400).json({ message: 'Mapeamento da coluna "nome" é obrigatório' });
      }

      const result = await importacaoService.importar(
        req.file.path,
        empresaId,
        usuarioId,
        parseInt(funil_id),
        mapeamentoParsed
      );

      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Arquivo vazio') ||
          error.message.includes('estágio de entrada')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }
};
