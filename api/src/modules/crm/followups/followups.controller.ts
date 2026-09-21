import { Request, Response } from 'express';
import fs from 'fs';
import { followupsService } from './followups.service';
import { getJanelaEmpresa, setJanelaEmpresa, conflitosDaEmpresa } from '../_shared/janela';

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
      // Motivo é opcional e vem no corpo do DELETE (a tela pede confirmação e oferece
      // o campo). Texto livre do usuário: entra só como texto, nunca como categoria.
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo : undefined;
      const followup = await followupsService.cancelar(id, empresaId, motivo);
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
      // Mesmos filtros da tela do dashboard. Datas só entram no formato
      // YYYY-MM-DD; qualquer outra coisa é ignorada em vez de virar SQL.
      const dataOk = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      const dados = await followupsService.metricas(empresaId, {
        funilId: req.query.funil_id ? parseInt(req.query.funil_id as string) : undefined,
        responsavelId: req.query.responsavel_id ? parseInt(req.query.responsavel_id as string) : undefined,
        dataInicio: dataOk(req.query.data_inicio),
        dataFim: dataOk(req.query.data_fim),
      });
      return res.json(dados);
    } catch (err: any) {
      console.error('Erro ao buscar métricas de follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao buscar métricas' });
    }
  },

  /**
   * Config de envio da empresa: intervalo anti-ban + JANELA OPERACIONAL (horário de
   * início/fim e dias da semana). A janela vale tanto para o follow-up agendado quanto
   * para o agente reativo — é uma só regra de "quando podemos falar com o lead".
   */
  async getConfig(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const [cfg, janela] = await Promise.all([
        followupsService.getConfigIntervalo(empresaId),
        getJanelaEmpresa(empresaId),
      ]);
      return res.json({
        intervalo_min_seg: cfg.min,
        intervalo_max_seg: cfg.max,
        janela_inicio: janela.inicio,
        janela_fim: janela.fim,
        janela_dias: janela.dias,
      });
    } catch (err: any) {
      console.error('Erro ao buscar config de follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao buscar configuração' });
    }
  },

  /** Atualiza intervalo anti-ban e/ou janela operacional da empresa. */
  async setConfig(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const { intervalo_min_seg, intervalo_max_seg, janela_inicio, janela_fim, janela_dias } = req.body;
      const mexeuNoIntervalo = intervalo_min_seg != null || intervalo_max_seg != null;
      const mexeuNaJanela = janela_inicio != null || janela_fim != null || janela_dias !== undefined;
      if (!mexeuNoIntervalo && !mexeuNaJanela) {
        return res.status(400).json({ error: 'Nada para atualizar' });
      }
      if (mexeuNoIntervalo && (intervalo_min_seg == null || intervalo_max_seg == null)) {
        return res.status(400).json({ error: 'intervalo_min_seg e intervalo_max_seg vão juntos' });
      }

      // Valores fora de formato voltam ao padrão dentro de normalizarJanela — uma janela
      // quebrada no banco significaria "nunca enviar" para a empresa inteira.
      const [cfg, janela] = await Promise.all([
        mexeuNoIntervalo
          ? followupsService.setConfigIntervalo(empresaId, Number(intervalo_min_seg), Number(intervalo_max_seg))
          : followupsService.getConfigIntervalo(empresaId),
        mexeuNaJanela
          ? setJanelaEmpresa(empresaId, {
              inicio: janela_inicio,
              fim: janela_fim,
              dias: Array.isArray(janela_dias) ? janela_dias : null,
            })
          : getJanelaEmpresa(empresaId),
      ]);

      // Estreitar a janela pode inviabilizar passos já configurados. Não recusamos a
      // mudança — o administrador pode estar corrigindo justamente uma política errada —
      // mas ele não pode descobrir depois, por follow-up que não sai: a lista dos
      // estágios afetados volta na resposta para a tela avisar na hora.
      const conflitos = mexeuNaJanela ? await conflitosDaEmpresa(empresaId, janela) : [];
      if (conflitos.length > 0) {
        console.warn(`[Followups] Empresa ${empresaId}: janela ${janela.inicio}-${janela.fim} ` +
          `conflita com ${conflitos.length} passo(s) de cadência: ` +
          conflitos.map((c) => `${c.estagio_nome}#${c.passo}`).join(', '));
      }

      return res.json({
        intervalo_min_seg: cfg.min,
        intervalo_max_seg: cfg.max,
        janela_inicio: janela.inicio,
        janela_fim: janela.fim,
        janela_dias: janela.dias,
        conflitos,
      });
    } catch (err: any) {
      console.error('Erro ao salvar config de follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
  },
};
