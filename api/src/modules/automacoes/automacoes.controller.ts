import { Response, NextFunction } from 'express';
import { automacoesService, LIMITE_AUTOMACOES_POR_GRUPO, ListFilters, TipoAcao, ContextoTipo } from './automacoes.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

function parseFilters(req: AuthRequest): ListFilters {
  const f: ListFilters = {};
  const q = req.query;
  if (q.tipo_acao)         f.tipo_acao = q.tipo_acao as TipoAcao;
  if (q.contexto_tipo)     f.contexto_tipo = q.contexto_tipo as ContextoTipo;
  if (q.funil_id)          f.funil_id = parseInt(q.funil_id as string, 10);
  if (q.funil_tipo)        f.funil_tipo = q.funil_tipo as 'aquisicao' | 'cx';
  if (q.estagio_id)        f.estagio_id = parseInt(q.estagio_id as string, 10);
  if (q.lead_id)           f.lead_id = parseInt(q.lead_id as string, 10);
  if (q.grupo_whatsapp_id) f.grupo_whatsapp_id = q.grupo_whatsapp_id as string;
  if (q.grupo_id)          f.grupo_whatsapp_id = q.grupo_id as string;
  if (q.ativa !== undefined) f.ativa = q.ativa === 'true';
  return f;
}

export const automacoesController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const filtros = parseFilters(req);
      const data = await automacoesService.list(empresaId, filtros);
      res.json({ success: true, data, limite_por_grupo: LIMITE_AUTOMACOES_POR_GRUPO });
    } catch (err) {
      next(err);
    }
  },

  async stats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const data = await automacoesService.getEstatisticas(empresaId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const id = parseInt(req.params.id);
      const item = await automacoesService.getById(id, empresaId);
      if (!item) return res.status(404).json({ success: false, error: 'Automação não encontrada' });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },

  async listExecucoes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const id = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const data = await automacoesService.listExecucoes(id, empresaId, limit);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const usuarioId = req.user!.userId;
      const body = req.body || {};

      // Compat: aceita formato legacy { grupo_whatsapp_id, mensagem, ... } sem tipo_acao
      let input = body;
      if (!body.tipo_acao && body.grupo_whatsapp_id && body.mensagem) {
        input = {
          nome: body.nome,
          tipo_acao: 'envio_mensagem_grupo',
          grupo_whatsapp_id: body.grupo_whatsapp_id,
          ativa: body.ativa,
          config: {
            mensagem: body.mensagem,
            grupo_nome: body.grupo_nome,
            delay_segundos: body.delay_segundos,
            enviar_para: body.enviar_para
          }
        };
      }

      if (!input.nome || !input.tipo_acao) {
        return res.status(400).json({ success: false, error: 'Campos obrigatórios: nome, tipo_acao' });
      }

      const data = await automacoesService.create(usuarioId, empresaId, input);
      res.status(201).json({ success: true, data });
    } catch (err: any) {
      if (err.message?.includes('Limite') || err.message?.includes('contexto') || err.message?.includes('tipo_acao') || err.message?.includes('config.mensagem')) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next(err);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const id = parseInt(req.params.id);
      const body = req.body || {};

      // Compat legacy: mensagem/delay_segundos/enviar_para vão pra config
      const input: any = {
        nome: body.nome,
        descricao: body.descricao,
        ativa: body.ativa
      };
      const cfg: Record<string, unknown> = {};
      if (body.config) Object.assign(cfg, body.config);
      if (body.mensagem !== undefined) cfg.mensagem = body.mensagem;
      if (body.grupo_nome !== undefined) cfg.grupo_nome = body.grupo_nome;
      if (body.delay_segundos !== undefined) cfg.delay_segundos = body.delay_segundos;
      if (body.enviar_para !== undefined) cfg.enviar_para = body.enviar_para;
      if (body.instrucoes !== undefined) cfg.instrucoes = body.instrucoes;
      if (Object.keys(cfg).length > 0) input.config = cfg;

      const data = await automacoesService.update(id, empresaId, input);
      if (!data) return res.status(404).json({ success: false, error: 'Automação não encontrada' });
      res.json({ success: true, data });
    } catch (err: any) {
      if (err.message?.includes('Limite')) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next(err);
    }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const id = parseInt(req.params.id);
      const ok = await automacoesService.delete(id, empresaId);
      if (!ok) return res.status(404).json({ success: false, error: 'Automação não encontrada' });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  async toggle(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const id = parseInt(req.params.id);
      const data = await automacoesService.toggle(id, empresaId);
      if (!data) return res.status(404).json({ success: false, error: 'Automação não encontrada' });
      res.json({ success: true, data });
    } catch (err: any) {
      if (err.message?.includes('Limite')) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next(err);
    }
  }
};
