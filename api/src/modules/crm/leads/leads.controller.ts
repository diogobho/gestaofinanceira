import { Request, Response, NextFunction } from 'express';
import { leadsService, FiltrosLead } from './leads.service';
import { contatosService } from '../contatos/contatos.service';

export const leadsController = {
  async listByFunil(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { funilId } = req.params;
      const {
        arquivados,
        estagio_id,
        responsavel_id,
        temperatura,
        origem,
        com_tarefa_atrasada,
        com_tarefa_hoje,
        sem_tarefa,
        aguardando_resposta,
        com_mensagens_nao_lidas,
        search
      } = req.query;

      const filtros: FiltrosLead = {
        arquivado: arquivados === 'true',
        estagio_id: estagio_id ? parseInt(estagio_id as string) : undefined,
        responsavel_id: responsavel_id ? parseInt(responsavel_id as string) : undefined,
        temperatura: temperatura as string,
        origem: origem ? (origem as string).trim() : undefined,
        com_tarefa_atrasada: com_tarefa_atrasada === 'true',
        com_tarefa_hoje: com_tarefa_hoje === 'true',
        sem_tarefa: sem_tarefa === 'true',
        aguardando_resposta: aguardando_resposta === 'true' ? true : (aguardando_resposta === 'false' ? false : undefined),
        com_mensagens_nao_lidas: com_mensagens_nao_lidas === 'true',
        search: search ? (search as string).trim() : undefined
      };

      const leads = await leadsService.listByFunil(parseInt(funilId), empresaId, filtros);

      // Adicionar status visual das tarefas
      const leadsComStatus = leads.map(lead => ({
        ...lead,
        status_tarefa: leadsService.getStatusTarefa(lead)
      }));

      res.json(leadsComStatus);
    } catch (error) {
      next(error);
    }
  },

  async listByEstagio(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { estagioId } = req.params;
      const {
        arquivados, responsavel_id, temperatura, origem,
        com_tarefa_atrasada, com_tarefa_hoje, sem_tarefa,
        aguardando_resposta, com_mensagens_nao_lidas,
        com_telefone, sem_nome_real, search,
        limit: limitQ, offset: offsetQ
      } = req.query;

      const filtros: FiltrosLead = {
        arquivado: arquivados === 'true',
        responsavel_id: responsavel_id ? parseInt(responsavel_id as string) : undefined,
        temperatura: temperatura as string,
        origem: origem ? (origem as string).trim() : undefined,
        com_tarefa_atrasada: com_tarefa_atrasada === 'true',
        com_tarefa_hoje: com_tarefa_hoje === 'true',
        sem_tarefa: sem_tarefa === 'true',
        aguardando_resposta: aguardando_resposta === 'true' ? true : (aguardando_resposta === 'false' ? false : undefined),
        com_mensagens_nao_lidas: com_mensagens_nao_lidas === 'true',
        com_telefone: com_telefone === 'true',
        sem_nome_real: sem_nome_real === 'true',
        search: search ? (search as string).trim() : undefined
      };

      const limit = limitQ ? parseInt(limitQ as string) : 100;
      const offset = offsetQ ? parseInt(offsetQ as string) : 0;

      const leads = await leadsService.listByEstagio(parseInt(estagioId), empresaId, filtros, limit, offset);
      const leadsComStatus = leads.map(lead => ({
        ...lead,
        status_tarefa: leadsService.getStatusTarefa(lead)
      }));

      res.json(leadsComStatus);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const lead = await leadsService.getById(parseInt(id), empresaId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      res.json({
        ...lead,
        status_tarefa: leadsService.getStatusTarefa(lead)
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const {
        funil_id, estagio_id, contato_whatsapp_id, responsavel_id,
        nome, telefone, email, empresa, cargo, titulo, cpf_cnpj,
        valor_potencial, temperatura, probabilidade, origem, notas,
        tarefa_inicial, sem_tarefa_obrigatoria, bypass_duplicata
      } = req.body;

      if (!funil_id) {
        return res.status(400).json({ message: 'funil_id é obrigatório' });
      }
      if (!nome) {
        return res.status(400).json({ message: 'nome é obrigatório' });
      }

      // Por padrão exige tarefa, a menos que sem_tarefa_obrigatoria seja true
      const requireTarefa = !sem_tarefa_obrigatoria;

      const lead = await leadsService.create(empresaId, usuarioId, {
        funil_id,
        estagio_id,
        contato_whatsapp_id,
        responsavel_id,
        nome,
        telefone,
        email,
        empresa,
        cargo,
        titulo,
        cpf_cnpj,
        valor_potencial,
        temperatura,
        probabilidade,
        origem,
        notas,
        bypass_duplicata,
        tarefa_inicial
      }, requireTarefa);

      res.status(201).json({
        ...lead,
        status_tarefa: leadsService.getStatusTarefa(lead)
      });
    } catch (error: any) {
      if (error.message.includes('não possui estágio') ||
          error.message.includes('obrigatório agendar') ||
          error.message.includes('Já existe um lead')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async createFromWhatsApp(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { contato_whatsapp_id, funil_id } = req.body;

      if (!contato_whatsapp_id || !funil_id) {
        return res.status(400).json({ message: 'contato_whatsapp_id e funil_id são obrigatórios' });
      }

      const lead = await leadsService.createFromWhatsApp(empresaId, usuarioId, contato_whatsapp_id, funil_id);
      res.status(201).json(lead);
    } catch (error: any) {
      if (error.message.includes('não encontrado') ||
          error.message.includes('Já existe') ||
          error.message.includes('não possui estág')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { id } = req.params;
      const {
        responsavel_id, nome, telefone, email, empresa, cargo, titulo, cpf_cnpj,
        valor_potencial, temperatura, probabilidade,
        data_previsao_fechamento, notas, arquivado, origem
      } = req.body;

      const lead = await leadsService.update(parseInt(id), empresaId, usuarioId, {
        responsavel_id,
        nome,
        telefone,
        email,
        empresa,
        cargo,
        titulo,
        cpf_cnpj,
        valor_potencial,
        temperatura,
        probabilidade,
        data_previsao_fechamento,
        notas,
        arquivado,
        origem
      });

      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      res.json({
        ...lead,
        status_tarefa: leadsService.getStatusTarefa(lead)
      });
    } catch (error: any) {
      if (error.message.includes('Já existe um lead')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async mover(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { id } = req.params;
      const {
        novo_estagio_id, nova_ordem,
        numero_parcelas, valor_venda, criar_receita,
        descricao, data, taxa_servico_percentual, produto, tipo_pagamento
      } = req.body;

      if (!novo_estagio_id) {
        return res.status(400).json({ message: 'novo_estagio_id é obrigatório' });
      }

      const taxaParsed = taxa_servico_percentual !== undefined && taxa_servico_percentual !== null && taxa_servico_percentual !== ''
        ? parseFloat(String(taxa_servico_percentual).replace(',', '.'))
        : undefined;
      if (taxaParsed !== undefined && (isNaN(taxaParsed) || taxaParsed < 0 || taxaParsed > 100)) {
        return res.status(400).json({ message: 'taxa_servico_percentual inválida (0–100)' });
      }

      const { lead, clienteCriado } = await leadsService.mover(parseInt(id), empresaId, usuarioId, {
        novo_estagio_id,
        nova_ordem,
        numero_parcelas: numero_parcelas ? parseInt(numero_parcelas) : undefined,
        valor_venda: valor_venda ? parseFloat(valor_venda) : undefined,
        criar_receita: criar_receita !== false,
        descricao: typeof descricao === 'string' ? descricao : undefined,
        data: typeof data === 'string' && data ? data : undefined,
        taxa_servico_percentual: taxaParsed,
        produto: typeof produto === 'string' ? produto : undefined,
        tipo_pagamento: tipo_pagamento === 'a_vista' || tipo_pagamento === 'parcelado' ? tipo_pagamento : undefined
      });

      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      res.json({
        ...lead,
        status_tarefa: leadsService.getStatusTarefa(lead),
        cliente_criado: clienteCriado
      });
    } catch (error: any) {
      if (error.message === 'Estágio não encontrado') {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async transferirFunil(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { id } = req.params;
      const { novo_funil_id } = req.body;

      if (!novo_funil_id) {
        return res.status(400).json({ message: 'novo_funil_id é obrigatório' });
      }

      const lead = await leadsService.transferirFunil(parseInt(id), empresaId, usuarioId, parseInt(novo_funil_id));

      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      res.json(lead);
    } catch (error: any) {
      if (['Lead já está neste funil', 'Funil não encontrado', 'Funil destino não possui estágios'].includes(error.message)) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const deleted = await leadsService.delete(parseInt(id), empresaId);
      if (!deleted) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async arquivar(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { id } = req.params;

      const lead = await leadsService.arquivar(parseInt(id), empresaId, usuarioId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      res.json(lead);
    } catch (error) {
      next(error);
    }
  },

  async reativar(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { id } = req.params;

      const lead = await leadsService.reativar(parseInt(id), empresaId, usuarioId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      res.json(lead);
    } catch (error) {
      next(error);
    }
  },

  async getAtividades(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { limit } = req.query;

      const atividades = await leadsService.getAtividades(
        parseInt(id),
        empresaId,
        limit ? parseInt(limit as string) : 50
      );
      res.json(atividades);
    } catch (error) {
      next(error);
    }
  },

  async addTag(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { id } = req.params;
      const { tag_id } = req.body;

      if (!tag_id) {
        return res.status(400).json({ message: 'tag_id é obrigatório' });
      }

      await leadsService.addTag(parseInt(id), tag_id, empresaId, usuarioId);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'Lead não encontrado') {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  async removeTag(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const { id, tagId } = req.params;

      await leadsService.removeTag(parseInt(id), parseInt(tagId), empresaId, usuarioId);
      res.status(204).send();
    } catch (error: any) {
      if (error.message === 'Lead não encontrado') {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  // Verificar duplicata de telefone
  async verificarDuplicata(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { telefone, exclude_id, funil_id } = req.query;

      if (!telefone) {
        return res.status(400).json({ message: 'telefone é obrigatório' });
      }

      const resultado = await leadsService.telefoneExiste(
        telefone as string,
        empresaId,
        exclude_id ? parseInt(exclude_id as string) : undefined,
        funil_id ? parseInt(funil_id as string) : undefined
      );

      res.json(resultado);
    } catch (error) {
      next(error);
    }
  },

  // Enviar mensagem WhatsApp pelo lead (auto-cria contato se necessario)
  async enviarMensagemWhatsApp(req: Request, res: Response, next: NextFunction) {
    try {
      const usuarioId = (req as any).user.id;
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { mensagem } = req.body;

      if (!mensagem) {
        return res.status(400).json({ message: 'mensagem é obrigatória' });
      }

      const lead = await leadsService.getById(parseInt(id), empresaId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      // Se o lead não tem contato vinculado, criar/encontrar pelo telefone
      let contatoId = lead.contato_whatsapp_id;
      if (!contatoId) {
        if (!lead.telefone) {
          return res.status(400).json({ message: 'Lead não possui telefone nem contato WhatsApp vinculado' });
        }

        const contato = await contatosService.findOrCreateByNumero(lead.telefone, usuarioId, empresaId);
        contatoId = contato.id;

        // Vincular contato ao lead
        const { query } = require('../../../config/database');
        await query(
          `UPDATE leads SET contato_whatsapp_id = $1 WHERE id = $2 AND empresa_id = $3`,
          [contatoId, parseInt(id), empresaId]
        );
      }

      const resultado = await contatosService.enviarMensagem(
        usuarioId,
        empresaId,
        contatoId,
        mensagem,
        parseInt(id)
      );

      if (!resultado.success) {
        return res.status(400).json({ message: resultado.error });
      }

      // Transferir propriedade do lead se o executor for diferente do dono atual
      await leadsService.transferirPropriedadeSeDiferente(
        parseInt(id),
        usuarioId,
        empresaId,
        'mensagem_individual'
      );

      // Registrar atividade
      await leadsService.registrarAtividade(
        parseInt(id),
        usuarioId,
        empresaId,
        'mensagem_enviada',
        `Mensagem enviada: "${mensagem.substring(0, 50)}${mensagem.length > 50 ? '...' : ''}"`,
        { mensagem, messageId: resultado.messageId }
      );

      res.json({ ...resultado, contato_whatsapp_id: contatoId });
    } catch (error: any) {
      if (error.message.includes('não encontrado') || error.message.includes('não configurado') || error.message.includes('invalido')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  // Enviar media WhatsApp pelo lead (auto-cria contato se necessario)
  async enviarMediaWhatsApp(req: Request, res: Response, next: NextFunction) {
    try {
      const usuarioId = (req as any).user.id;
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { caption } = req.body;
      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({ message: 'Arquivo obrigatorio' });
      }

      const lead = await leadsService.getById(parseInt(id), empresaId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      // Se o lead não tem contato vinculado, criar/encontrar pelo telefone
      let contatoId = lead.contato_whatsapp_id;
      if (!contatoId) {
        if (!lead.telefone) {
          return res.status(400).json({ message: 'Lead não possui telefone nem contato WhatsApp vinculado' });
        }

        const contato = await contatosService.findOrCreateByNumero(lead.telefone, usuarioId, empresaId);
        contatoId = contato.id;

        // Vincular contato ao lead
        const { query } = require('../../../config/database');
        await query(
          `UPDATE leads SET contato_whatsapp_id = $1 WHERE id = $2 AND empresa_id = $3`,
          [contatoId, parseInt(id), empresaId]
        );
      }

      const resultado = await contatosService.enviarMedia(
        usuarioId,
        empresaId,
        contatoId,
        file.path,
        file.originalname,
        file.mimetype,
        file.size,
        caption,
        parseInt(id)
      );

      if (!resultado.success) {
        return res.status(400).json({ message: resultado.error });
      }

      // Registrar atividade
      await leadsService.registrarAtividade(
        parseInt(id),
        usuarioId,
        empresaId,
        'mensagem_enviada',
        `Midia enviada: ${file.originalname}`,
        { filename: file.originalname, mimetype: file.mimetype, messageId: resultado.messageId }
      );

      // Limpar arquivo temporario do multer
      const fs = require('fs');
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      res.json({ ...resultado, contato_whatsapp_id: contatoId });
    } catch (error: any) {
      if (error.message.includes('não encontrado') || error.message.includes('não configurado') || error.message.includes('invalido')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  // Obter historico de mensagens WhatsApp pelo lead
  async getHistoricoWhatsApp(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;
      const { limit } = req.query;

      const lead = await leadsService.getById(parseInt(id), empresaId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      if (!lead.contato_whatsapp_id) {
        return res.json([]);
      }

      const mensagens = await contatosService.getHistoricoMensagens(
        lead.contato_whatsapp_id,
        empresaId,
        limit ? parseInt(limit as string) : 50
      );
      res.json(mensagens);
    } catch (error) {
      next(error);
    }
  },

  async getOrigens(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { funilId } = req.query;
      const origens = await leadsService.getOrigens(
        empresaId,
        funilId ? parseInt(funilId as string) : undefined
      );
      res.json(origens);
    } catch (error) {
      next(error);
    }
  },

  // Marcar mensagens como lidas pelo lead
  async marcarLidoWhatsApp(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { id } = req.params;

      const lead = await leadsService.getById(parseInt(id), empresaId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead não encontrado' });
      }

      if (lead.contato_whatsapp_id) {
        await contatosService.marcarLido(lead.contato_whatsapp_id, empresaId, parseInt(id));
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
};
