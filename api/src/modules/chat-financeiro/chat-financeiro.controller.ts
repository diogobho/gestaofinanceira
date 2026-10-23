import { Request, Response, NextFunction } from 'express';
import { chatFinanceiroService } from './chat-financeiro.service';
import { isAdminEmpresa } from '../../shared/roles';
import { duoRecarga } from './creditos';

export const chatFinanceiroController = {

  /** GET /chat-financeiro/creditos — saldo, pacotes, compras e extrato da empresa. */
  async getCreditos(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const painel = await duoRecarga.painel(Number(user.empresa_id));
      res.json({ ...painel, pode_comprar: isAdminEmpresa(user) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /chat-financeiro/creditos/comprar — recarga. Só quem administra a conta
   * compra (é dinheiro da empresa); o saldo, todos que usam o Duo veem.
   */
  async comprarCreditos(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!isAdminEmpresa(user)) {
        return res.status(403).json({ message: 'Só quem administra a conta pode comprar crédito.' });
      }
      const r = await duoRecarga.comprar(
        Number(user.empresa_id), Number(user.userId ?? user.id),
        Number(req.body?.valor), typeof req.body?.cpf_cnpj === 'string' ? req.body.cpf_cnpj : undefined
      );
      res.status(201).json(r);
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ code: err.code, message: err.message });
      if (err.message === 'Escolha um dos valores de recarga.') return res.status(400).json({ message: err.message });
      console.error('[Duo] compra de crédito', err?.response?.data || err.message);
      res.status(502).json({ message: 'Não foi possível gerar a cobrança agora. Tente de novo em instantes.' });
    }
  },

  async enviarMensagem(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { mensagem } = req.body;

      if (!mensagem || typeof mensagem !== 'string' || mensagem.trim() === '') {
        return res.status(400).json({ message: 'Mensagem é obrigatória' });
      }

      const resposta = await chatFinanceiroService.processar(
        Number(user.userId ?? user.id),
        Number(user.empresa_id),
        mensagem.trim().slice(0, 4000)
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
      if (!config) return res.json({});

      // getConfig faz merge com empresa_ia_credenciais — nunca devolver as chaves
      // em texto puro: esta rota é lida por qualquer usuário autenticado (o chat
      // consulta o `ativo` para saber se está desligado). Mesmo tratamento que o
      // agente-ia dá em agente-ia.controller.ts.
      res.json({
        ativo: config.ativo,
        max_tokens: config.max_tokens,
        contexto_mensagens: config.contexto_mensagens,
        provider: config.provider,
        modelo: config.modelo,
        api_key_configurada: !!config.api_key,
        gemini_api_key_configurada: !!config.gemini_api_key,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      // Chat interno segue como estava: master ou creator (a exclusividade do creator
      // vale só para a configuração do agente de WhatsApp).
      if (!isAdminEmpresa((req as any).user)) {
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
