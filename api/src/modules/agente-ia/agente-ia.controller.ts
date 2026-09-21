import { Request, Response, NextFunction } from 'express';
import { agenteIaService } from './agente-ia.service';
import { podeConfigurarAgenteIA } from '../../shared/roles';

export const agenteIaController = {

  async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      // A leitura também é do creator: o payload traz o system_prompt_extra inteiro, e
      // esconder a aba sem fechar a rota deixaria o prompt a um curl de distância.
      // Único consumidor é a própria aba "Configurar Agente".
      if (!podeConfigurarAgenteIA((req as any).user)) {
        return res.status(403).json({
          message: 'Apenas o usuário creator (dono da empresa) pode ver a configuração do agente de IA'
        });
      }
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
      // Follow-ups de IA que ficam esperando enquanto o agente está desligado.
      // A interface avisa o usuário para que a fila parada não passe despercebida.
      resp.followups_pausados = await agenteIaService.contarFollowupsPausados(empresaId);
      res.json(resp);
    } catch (err) {
      next(err);
    }
  },

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;

      // Configuração do agente é exclusiva do CREATOR (o dono da empresa) — o master
      // administra usuários e a operação, mas não reescreve o prompt, o tom nem troca a
      // chave de API. Antes qualquer master podia, e desde que um master passou a poder
      // promover outros, isso significaria espalhar o controle do agente junto.
      if (!podeConfigurarAgenteIA((req as any).user)) {
        return res.status(403).json({
          message: 'Apenas o usuário creator (dono da empresa) pode configurar o agente de IA'
        });
      }

      // `proativo_ativo`, `horario_proativo` e `min_horas_silencio` (migration 027) eram
      // lidos aqui e descartados pelo whitelist do upsertConfig — nenhum código lê essas
      // colunas: o "modo proativo" nunca chegou a existir. Removidos do payload para não
      // dar a impressão de que a tela configura algo.
      const {
        ativo, provider, api_key, gemini_api_key, modelo, nome_agente, tom,
        area_negocio, system_prompt_extra, max_tokens,
        contexto_mensagens, usuarios_habilitados, delay_segundos, pode_ficar_em_silencio
      } = req.body;

      const data: any = {
        ativo, provider, modelo, nome_agente, tom,
        area_negocio, system_prompt_extra, max_tokens,
        contexto_mensagens, usuarios_habilitados, delay_segundos,
        pode_ficar_em_silencio: pode_ficar_em_silencio === undefined ? undefined : !!pode_ficar_em_silencio,
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
