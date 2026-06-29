import { Request, Response, NextFunction } from 'express';
import { agenteIaService } from './agente-ia.service';

export const agenteIaController = {

  async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const config = await agenteIaService.getConfig(empresaId);
      // Mascarar API keys na resposta
      const resp: any = { ...config, api_key_configurada: false, gemini_api_key_configurada: false };
      if (config?.api_key) {
        resp.api_key = config.api_key.substring(0, 8) + '••••••••••••••••••••' + config.api_key.slice(-4);
        resp.api_key_configurada = true;
      } else {
        resp.api_key = null;
      }
      if (config?.gemini_api_key) {
        resp.gemini_api_key = '••••••••••••••••••••';
        resp.gemini_api_key_configurada = true;
      } else {
        resp.gemini_api_key = null;
      }
      res.json(resp);
    } catch (err) {
      next(err);
    }
  },

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const nivel = (req as any).user.nivel;
      const tipo = (req as any).user.tipo_usuario;

      // Apenas super_admin ou master pode configurar
      if (nivel !== 'super_admin' && tipo !== 'master') {
        return res.status(403).json({ message: 'Apenas administradores podem configurar o agente de IA' });
      }

      const {
        ativo, provider, api_key, gemini_api_key, modelo, nome_agente, tom,
        area_negocio, system_prompt_extra, max_tokens,
        contexto_mensagens, usuarios_habilitados, delay_segundos,
        proativo_ativo, horario_proativo, min_horas_silencio
      } = req.body;

      const data: any = {
        ativo, provider, modelo, nome_agente, tom,
        area_negocio, system_prompt_extra, max_tokens,
        contexto_mensagens, usuarios_habilitados, delay_segundos,
        proativo_ativo, horario_proativo, min_horas_silencio
      };
      if (api_key && !api_key.includes('•')) {
        data.api_key = api_key;
      }
      if (gemini_api_key && !gemini_api_key.includes('•')) {
        data.gemini_api_key = gemini_api_key;
      }

      const config = await agenteIaService.upsertConfig(empresaId, data);
      res.json({
        ...config,
        api_key: config.api_key ? '••••••••' : null,
        api_key_configurada: !!config.api_key,
        gemini_api_key: config.gemini_api_key ? '••••••••' : null,
        gemini_api_key_configurada: !!config.gemini_api_key,
      });
    } catch (err) {
      next(err);
    }
  },

  async toggleEstagio(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const estagioId = parseInt(req.params.estagioId);
      const { ativo } = req.body;

      await agenteIaService.toggleEstagio(estagioId, empresaId, ativo);
      res.json({ success: true, ativo });
    } catch (err) {
      next(err);
    }
  },

  async toggleLead(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const leadId = parseInt(req.params.leadId);
      const { ativo } = req.body; // null = herdar do estágio, true/false = override

      await agenteIaService.toggleLead(leadId, empresaId, ativo);
      res.json({ success: true, ativo });
    } catch (err) {
      next(err);
    }
  },

  async getLeadStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const leadId = parseInt(req.params.leadId);

      const status = await agenteIaService.getLeadStatus(leadId, empresaId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }
};
