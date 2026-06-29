import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { pluggyService } from './pluggy.service';
import { enqueueSync } from './pluggy.queue';
import { env } from '../../config/env';

export const pluggyController = {
  async getConnectToken(req: AuthRequest, res: Response) {
    try {
      const accessToken = await pluggyService.getConnectToken(req.user!.userId);
      return res.json({ accessToken, includeSandbox: env.PLUGGY_SANDBOX });
    } catch (err: any) {
      return res.status(500).json({ code: 'ERROR', message: err.message });
    }
  },

  async registrarItem(req: AuthRequest, res: Response) {
    try {
      const { itemId } = req.body;
      if (!itemId) return res.status(400).json({ code: 'MISSING_ITEM_ID', message: 'itemId é obrigatório' });

      const conexao = await pluggyService.registrarConexao(req.user!.userId, itemId);
      await enqueueSync(itemId);

      return res.status(201).json(conexao);
    } catch (err: any) {
      return res.status(400).json({ code: 'ERROR', message: err.message });
    }
  },

  async listarConexoes(req: AuthRequest, res: Response) {
    try {
      const conexoes = await pluggyService.listarConexoes(req.user!.userId);
      return res.json(conexoes);
    } catch (err: any) {
      return res.status(500).json({ code: 'ERROR', message: err.message });
    }
  },

  async syncManual(req: AuthRequest, res: Response) {
    try {
      const conexoes = await pluggyService.listarConexoes(req.user!.userId);
      const conexao = conexoes.find((c: any) => c.id === req.params.id);
      if (!conexao) return res.status(404).json({ code: 'NOT_FOUND', message: 'Conexão não encontrada' });

      await enqueueSync(conexao.pluggy_item_id);
      return res.json({ message: 'Sincronização enfileirada' });
    } catch (err: any) {
      return res.status(500).json({ code: 'ERROR', message: err.message });
    }
  },

  async atualizarConexao(req: AuthRequest, res: Response) {
    try {
      const { importar_cartao } = req.body;
      if (typeof importar_cartao !== 'boolean') {
        return res.status(400).json({ code: 'INVALID_BODY', message: 'importar_cartao (boolean) é obrigatório' });
      }

      const conexao = await pluggyService.atualizarConexao(req.params.id, req.user!.userId, { importar_cartao });

      // Reenfileirar sync para refletir a mudança (importar/remover cartão)
      await enqueueSync(conexao.pluggy_item_id);

      return res.json(conexao);
    } catch (err: any) {
      return res.status(400).json({ code: 'ERROR', message: err.message });
    }
  },

  async desativarConexao(req: AuthRequest, res: Response) {
    try {
      await pluggyService.desativarConexao(req.params.id, req.user!.userId);
      return res.status(204).send();
    } catch (err: any) {
      return res.status(400).json({ code: 'ERROR', message: err.message });
    }
  },
};
