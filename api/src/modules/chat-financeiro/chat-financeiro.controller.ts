import { Request, Response, NextFunction } from 'express';
import { chatFinanceiroService } from './chat-financeiro.service';

export const chatFinanceiroController = {

  async enviarMensagem(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { mensagem } = req.body;

      if (!mensagem || typeof mensagem !== 'string' || mensagem.trim() === '') {
        return res.status(400).json({ message: 'Mensagem é obrigatória' });
      }

      const resposta = await chatFinanceiroService.processar(
        user.id,
        user.empresa_id,
        user.nome,
        mensagem.trim(),
        user.nivel
      );

      res.json({ resposta });
    } catch (err: any) {
      if (err.message?.includes('API key não configurada') || err.message?.includes('chat desabilitado')) {
        return res.status(503).json({ message: err.message });
      }
      next(err);
    }
  },

  async getHistorico(req: Request, res: Response, next: NextFunction) {
    try {
      const usuarioId = (req as any).user.id;
      const limite = parseInt(req.query.limite as string) || 50;
      const historico = await chatFinanceiroService.getHistorico(usuarioId, limite);
      res.json(historico);
    } catch (err) {
      next(err);
    }
  },

  async limparHistorico(req: Request, res: Response, next: NextFunction) {
    try {
      const usuarioId = (req as any).user.id;
      await chatFinanceiroService.limparHistorico(usuarioId);
      res.json({ success: true, message: 'Histórico limpo com sucesso' });
    } catch (err) {
      next(err);
    }
  },

  async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const config = await chatFinanceiroService.getConfig(empresaId);
      res.json(config || {});
    } catch (err) {
      next(err);
    }
  },

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const nivel = (req as any).user.nivel;
      const tipo = (req as any).user.tipo_usuario;

      if (nivel !== 'super_admin' && tipo !== 'master') {
        return res.status(403).json({ message: 'Apenas administradores podem configurar o chat financeiro' });
      }

      const { ativo, max_tokens, contexto_mensagens } = req.body;
      const empresaId = (req as any).user?.empresa_id ?? null;
      const config = await chatFinanceiroService.upsertConfig(empresaId, { ativo, max_tokens, contexto_mensagens });
      res.json(config);
    } catch (err) {
      next(err);
    }
  },
};
