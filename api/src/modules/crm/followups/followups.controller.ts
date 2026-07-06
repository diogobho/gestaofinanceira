import { Request, Response } from 'express';
import fs from 'fs';
import { followupsService } from './followups.service';

export const followupsController = {
  async criar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const usuarioId = (req as any).user?.id;
      const leadId = parseInt(req.params.leadId);
      const {
        agendado_para, tipo, mensagem, instrucao_ia,
        media_url, media_mimetype, media_filename,
        modo, atraso_dias, atraso_unidade, data_fixa, hora_envio, dias_semana,
      } = req.body;

      if (!tipo || !['manual', 'agente_ia'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo deve ser manual ou agente_ia' });
      }
      // Manual precisa de mensagem OU mídia (mídia sem legenda é válida).
      if (tipo === 'manual' && !mensagem && !media_url) {
        return res.status(400).json({ error: 'informe uma mensagem ou anexe uma mídia para o tipo manual' });
      }
      // Precisa de um instante (agendado_para direto) OU dos parâmetros do padrão.
      if (!agendado_para && modo === 'data' && !data_fixa) {
        return res.status(400).json({ error: 'data_fixa é obrigatória no modo data' });
      }

      const followup = await followupsService.criar({
        leadId, usuarioId, empresaId, tipo,
        mensagem, instrucaoIa: instrucao_ia,
        mediaUrl: media_url, mediaMimetype: media_mimetype, mediaFilename: media_filename,
        origem: 'lead',
        modo: modo || 'dias', atrasoDias: atraso_dias, atrasoUnidade: atraso_unidade, dataFixa: data_fixa,
        horaEnvio: hora_envio, diasSemana: dias_semana,
        agendadoPara: agendado_para,
      });
      return res.status(201).json(followup);
    } catch (err: any) {
      console.error('Erro ao criar follow-up:', err);
      return res.status(500).json({ error: 'Erro ao criar follow-up' });
    }
  },

  // Recebe o arquivo (multipart, campo "file"), armazena e devolve a referência de mídia
  // para ser salva na config do agendamento / no follow-up.
  async uploadMedia(req: Request, res: Response) {
    const file = (req as any).file;
    try {
      const empresaId = (req as any).user?.empresa_id;
      if (!file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }
      const media = await followupsService.salvarMidiaUpload(
        empresaId, file.path, file.originalname, file.mimetype
      );
      return res.status(201).json(media);
    } catch (err: any) {
      console.error('Erro no upload de mídia do follow-up:', err);
      return res.status(500).json({ error: err.message || 'Erro ao subir mídia' });
    } finally {
      // Limpa o arquivo temporário do multer (já foi copiado para a pasta da empresa).
      if (file?.path) fs.promises.unlink(file.path).catch(() => {});
    }
  },

  async listar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const leadId = parseInt(req.params.leadId);
      const followups = await followupsService.listarPorLead(leadId, empresaId);
      return res.json(followups);
    } catch (err: any) {
      console.error('Erro ao listar follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao listar follow-ups' });
    }
  },

  async listarTodos(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const filtro = (req.query.filtro as 'hoje' | 'semana' | 'atrasados' | 'todos') || 'hoje';
      const status = req.query.status as string | undefined;
      const funilTipo = req.query.funil_tipo as 'aquisicao' | 'cx' | undefined;
      const followups = await followupsService.listarTodos(empresaId, filtro, status, funilTipo);
      return res.json(followups);
    } catch (err: any) {
      console.error('Erro ao listar todos follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao listar follow-ups' });
    }
  },

  async cancelar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const id = parseInt(req.params.id);
      const followup = await followupsService.cancelar(id, empresaId);
      if (!followup) return res.status(404).json({ error: 'Follow-up não encontrado ou já processado' });
      return res.json(followup);
    } catch (err: any) {
      console.error('Erro ao cancelar follow-up:', err);
      return res.status(500).json({ error: 'Erro ao cancelar follow-up' });
    }
  },

  async reagendar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const id = parseInt(req.params.id);
      const { agendado_para } = req.body;
      if (!agendado_para) {
        return res.status(400).json({ error: 'agendado_para é obrigatório' });
      }
      const followup = await followupsService.reagendar(id, empresaId, agendado_para);
      if (!followup) return res.status(404).json({ error: 'Follow-up não encontrado ou não pode ser reagendado' });
      return res.json(followup);
    } catch (err: any) {
      console.error('Erro ao reagendar follow-up:', err);
      return res.status(500).json({ error: 'Erro ao reagendar follow-up' });
    }
  },

  async metricas(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const dados = await followupsService.metricas(empresaId);
      return res.json(dados);
    } catch (err: any) {
      console.error('Erro ao buscar métricas de follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao buscar métricas' });
    }
  },
};
