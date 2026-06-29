import { query } from '../../config/database';
import { enviarEmailCobrancaParcela } from '../../services/email.service';
import { configuracoesSmtpService } from '../configuracoes-smtp/configuracoes-smtp.service';

export const parcelasService = {
  async listReceitas(filters: any) {
    let where = '1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Multi-tenancy: ADMIN vê tudo, usuário vê apenas suas parcelas
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND r.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    if (filters.status) {
      where += ` AND pr.status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    if (filters.cliente_id) {
      where += ` AND r.cliente_id = $${paramCount}`;
      params.push(filters.cliente_id);
      paramCount++;
    }

    if (filters.data_ini) {
      where += ` AND pr.data_vencimento >= $${paramCount}`;
      params.push(filters.data_ini);
      paramCount++;
    }

    if (filters.data_fim) {
      where += ` AND pr.data_vencimento <= $${paramCount}`;
      params.push(filters.data_fim);
      paramCount++;
    }

    const result = await query(
      `SELECT
        pr.id,
        pr.receita_id,
        pr.numero_parcela,
        pr.total_parcelas,
        pr.valor,
        pr.data_vencimento,
        pr.data_pagamento,
        pr.status,
        pr.created_at,
        pr.updated_at,
        r.descricao as receita_descricao,
        r.valor as receita_valor_total,
        r.fonte as receita_fonte,
        r.cliente_id,
        c.nome as cliente_nome,
        (
          SELECT ne.data_envio
          FROM notificacoes_enviadas ne
          WHERE ne.parcela_id = pr.id
          ORDER BY ne.data_envio DESC
          LIMIT 1
        ) as ultimo_email_enviado
      FROM parcelas_receitas pr
      INNER JOIN receitas r ON pr.receita_id = r.id
      LEFT JOIN clientes c ON r.cliente_id = c.id
      WHERE ${where}
      ORDER BY pr.data_vencimento ASC`,
      params
    );

    return result.rows;
  },

  async listDespesas(filters: any) {
    let where = '1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Multi-tenancy: ADMIN vê tudo, usuário vê apenas suas parcelas
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND d.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    if (filters.status) {
      where += ` AND pd.status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    if (filters.data_ini) {
      where += ` AND pd.data_vencimento >= $${paramCount}`;
      params.push(filters.data_ini);
      paramCount++;
    }

    if (filters.data_fim) {
      where += ` AND pd.data_vencimento <= $${paramCount}`;
      params.push(filters.data_fim);
      paramCount++;
    }

    const result = await query(
      `SELECT
        pd.id,
        pd.despesa_id,
        pd.numero_parcela,
        pd.total_parcelas,
        pd.valor,
        pd.data_vencimento,
        pd.data_pagamento,
        pd.status,
        pd.created_at,
        pd.updated_at,
        d.descricao as despesa_descricao,
        d.valor as despesa_valor_total,
        d.categoria as despesa_categoria
      FROM parcelas_despesas pd
      INNER JOIN despesas d ON pd.despesa_id = d.id
      WHERE ${where}
      ORDER BY pd.data_vencimento ASC`,
      params
    );

    return result.rows;
  },

  async updateParcelaReceita(id: string, data: any, filters?: any) {
    let where = 'pr.id = $1';
    const params: any[] = [id];
    let paramCount = 2;

    // Multi-tenancy: apenas o dono pode atualizar
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND r.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    // Verificar permissão primeiro
    const checkResult = await query(
      `SELECT pr.id FROM parcelas_receitas pr
       INNER JOIN receitas r ON pr.receita_id = r.id
       WHERE ${where}`,
      params
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Parcela não encontrada ou sem permissão');
    }

    // Atualizar parcela
    const updateParams: any[] = [];
    const fields: string[] = [];
    paramCount = 1;

    if (data.valor !== undefined) {
      fields.push(`valor = $${paramCount}`);
      updateParams.push(data.valor);
      paramCount++;
    }

    if (data.data_vencimento !== undefined) {
      fields.push(`data_vencimento = $${paramCount}`);
      updateParams.push(data.data_vencimento);
      paramCount++;
    }

    if (data.status !== undefined) {
      fields.push(`status = $${paramCount}`);
      updateParams.push(data.status);
      paramCount++;
    }

    if (data.data_pagamento !== undefined) {
      fields.push(`data_pagamento = $${paramCount}`);
      updateParams.push(data.data_pagamento);
      paramCount++;
    }

    if (fields.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    updateParams.push(id);

    const result = await query(
      `UPDATE parcelas_receitas SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount} RETURNING *`,
      updateParams
    );

    return result.rows[0];
  },

  async updateParcelaDespesa(id: string, data: any, filters?: any) {
    let where = 'pd.id = $1';
    const params: any[] = [id];
    let paramCount = 2;

    // Multi-tenancy: apenas o dono pode atualizar
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND d.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    // Verificar permissão primeiro
    const checkResult = await query(
      `SELECT pd.id FROM parcelas_despesas pd
       INNER JOIN despesas d ON pd.despesa_id = d.id
       WHERE ${where}`,
      params
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Parcela não encontrada ou sem permissão');
    }

    // Atualizar parcela
    const updateParams: any[] = [];
    const fields: string[] = [];
    paramCount = 1;

    if (data.valor !== undefined) {
      fields.push(`valor = $${paramCount}`);
      updateParams.push(data.valor);
      paramCount++;
    }

    if (data.data_vencimento !== undefined) {
      fields.push(`data_vencimento = $${paramCount}`);
      updateParams.push(data.data_vencimento);
      paramCount++;
    }

    if (data.status !== undefined) {
      fields.push(`status = $${paramCount}`);
      updateParams.push(data.status);
      paramCount++;
    }

    if (data.data_pagamento !== undefined) {
      fields.push(`data_pagamento = $${paramCount}`);
      updateParams.push(data.data_pagamento);
      paramCount++;
    }

    if (fields.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    updateParams.push(id);

    const result = await query(
      `UPDATE parcelas_despesas SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount} RETURNING *`,
      updateParams
    );

    return result.rows[0];
  },

  async enviarEmailsCobrancaManuais(parcelaIds: string[], usuarioId?: number, nivel?: string, empresaId?: number) {
    const resultados = {
      enviados: [] as any[],
      erros: [] as any[],
      jaEnviados: [] as any[]
    };

    // Buscar configurações SMTP da empresa (se existir)
    let smtpCredentials: any = undefined;
    if (empresaId) {
      const smtpConfig = await configuracoesSmtpService.getDecrypted(empresaId);
      if (smtpConfig && smtpConfig.ativo && smtpConfig.smtp_pass) {
        smtpCredentials = {
          smtp_host: smtpConfig.smtp_host,
          smtp_port: smtpConfig.smtp_port,
          smtp_user: smtpConfig.smtp_user,
          smtp_pass: smtpConfig.smtp_pass,
          email_from: smtpConfig.email_from,
          email_from_name: smtpConfig.email_from_name,
        };
      }
    }

    for (const parcelaId of parcelaIds) {
      try {
        // Buscar informações da parcela, cliente e mentor
        const parcelaQuery = await query(`
          SELECT
            pr.id,
            pr.numero_parcela,
            pr.total_parcelas,
            pr.valor,
            pr.data_vencimento,
            pr.status,
            r.descricao,
            r.cliente_id,
            r.usuario_id,
            c.nome as cliente_nome,
            c.email as cliente_email,
            u.nome as mentor_nome,
            u.email as mentor_email,
            CURRENT_DATE - pr.data_vencimento AS dias_atraso
          FROM parcelas_receitas pr
          INNER JOIN receitas r ON pr.receita_id = r.id
          LEFT JOIN clientes c ON r.cliente_id = c.id
          LEFT JOIN usuarios u ON r.usuario_id = u.id
          WHERE pr.id = $1
            ${nivel !== 'super_admin' && usuarioId ? 'AND r.usuario_id = $2' : ''}
        `, nivel !== 'super_admin' && usuarioId ? [parcelaId, usuarioId] : [parcelaId]);

        if (parcelaQuery.rows.length === 0) {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela não encontrada ou sem permissão'
          });
          continue;
        }

        const parcela = parcelaQuery.rows[0];

        // Validações
        if (!parcela.cliente_id) {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela não está vinculada a um cliente'
          });
          continue;
        }

        if (!parcela.cliente_email) {
          resultados.erros.push({
            parcelaId,
            erro: 'Cliente não possui e-mail cadastrado'
          });
          continue;
        }

        if (parcela.status === 'PAGO' || parcela.status === 'CANCELADO') {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela já está paga ou cancelada'
          });
          continue;
        }

        if (parcela.dias_atraso <= 0) {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela ainda não está vencida'
          });
          continue;
        }

        // Verificar se já foi enviado e-mail nas últimas 24h
        const ultimoEnvio = await query(`
          SELECT id, data_envio
          FROM notificacoes_enviadas
          WHERE parcela_id = $1
            AND tipo = 'cobranca_manual'
            AND data_envio > NOW() - INTERVAL '24 hours'
          ORDER BY data_envio DESC
          LIMIT 1
        `, [parcelaId]);

        if (ultimoEnvio.rows.length > 0) {
          resultados.jaEnviados.push({
            parcelaId,
            clienteNome: parcela.cliente_nome,
            ultimoEnvio: ultimoEnvio.rows[0].data_envio
          });
          continue;
        }

        // Enviar e-mail
        await enviarEmailCobrancaParcela({
          clienteNome: parcela.cliente_nome,
          clienteEmail: parcela.cliente_email,
          valorParcela: parseFloat(parcela.valor),
          numeroParcela: parcela.numero_parcela,
          totalParcelas: parcela.total_parcelas,
          diasAtraso: parcela.dias_atraso,
          descricao: parcela.descricao,
          mentorNome: parcela.mentor_nome,
          mentorEmail: parcela.mentor_email
        }, smtpCredentials);

        // Registrar envio no banco
        await query(`
          INSERT INTO notificacoes_enviadas (
            cliente_id,
            usuario_id,
            parcela_id,
            tipo,
            email_destinatario,
            assunto,
            corpo,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          parcela.cliente_id,
          parcela.usuario_id,
          parcelaId,
          'cobranca_manual',
          parcela.cliente_email,
          `⚠️ Cobrança de Parcela em Atraso - ${parcela.dias_atraso} dia(s)`,
          'E-mail de cobrança manual',
          'enviado'
        ]);

        resultados.enviados.push({
          parcelaId,
          clienteNome: parcela.cliente_nome,
          clienteEmail: parcela.cliente_email
        });

      } catch (error: any) {
        resultados.erros.push({
          parcelaId,
          erro: error.message
        });
      }
    }

    return {
      totalProcessado: parcelaIds.length,
      totalEnviados: resultados.enviados.length,
      totalErros: resultados.erros.length,
      totalJaEnviados: resultados.jaEnviados.length,
      detalhes: resultados
    };
  },

  async enviarWhatsAppCobrancaManuais(parcelaIds: string[], usuarioId?: number, nivel?: string) {
    const axios = require('axios');
    const resultados = {
      enviados: [] as any[],
      erros: [] as any[],
      jaEnviados: [] as any[]
    };

    for (const parcelaId of parcelaIds) {
      try {
        // Buscar informações da parcela, cliente e mentor (usuário)
        const parcelaQuery = await query(`
          SELECT
            pr.id,
            pr.numero_parcela,
            pr.total_parcelas,
            pr.valor,
            pr.data_vencimento,
            pr.status,
            r.descricao,
            r.cliente_id,
            r.usuario_id,
            c.nome as cliente_nome,
            c.telefone as cliente_telefone,
            u.nome as mentor_nome,
            u.whatsapp_porta,
            u.whatsapp_conectado,
            CURRENT_DATE - pr.data_vencimento AS dias_atraso
          FROM parcelas_receitas pr
          INNER JOIN receitas r ON pr.receita_id = r.id
          LEFT JOIN clientes c ON r.cliente_id = c.id
          INNER JOIN usuarios u ON r.usuario_id = u.id
          WHERE pr.id = $1
            ${nivel !== 'super_admin' && usuarioId ? 'AND r.usuario_id = $2' : ''}
        `, nivel !== 'super_admin' && usuarioId ? [parcelaId, usuarioId] : [parcelaId]);

        if (parcelaQuery.rows.length === 0) {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela não encontrada ou sem permissão'
          });
          continue;
        }

        const parcela = parcelaQuery.rows[0];

        // Validações
        if (!parcela.cliente_id) {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela não está vinculada a um cliente'
          });
          continue;
        }

        if (!parcela.cliente_telefone) {
          resultados.erros.push({
            parcelaId,
            erro: 'Cliente não possui telefone cadastrado'
          });
          continue;
        }

        if (!parcela.whatsapp_porta) {
          resultados.erros.push({
            parcelaId,
            erro: 'Você não tem WhatsApp configurado. Configure em Menu > WhatsApp'
          });
          continue;
        }

        if (!parcela.whatsapp_conectado) {
          resultados.erros.push({
            parcelaId,
            erro: 'Seu WhatsApp está desconectado. Conecte em Menu > WhatsApp'
          });
          continue;
        }

        if (parcela.status === 'PAGO' || parcela.status === 'CANCELADO') {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela já está paga ou cancelada'
          });
          continue;
        }

        if (parcela.dias_atraso <= 0) {
          resultados.erros.push({
            parcelaId,
            erro: 'Parcela ainda não está vencida'
          });
          continue;
        }

        // Verificar se já foi enviado WhatsApp nas últimas 24h
        const ultimoEnvio = await query(`
          SELECT id, data_envio
          FROM notificacoes_enviadas
          WHERE parcela_id = $1
            AND tipo = 'whatsapp_cobranca_manual'
            AND data_envio > NOW() - INTERVAL '24 hours'
          ORDER BY data_envio DESC
          LIMIT 1
        `, [parcelaId]);

        if (ultimoEnvio.rows.length > 0) {
          resultados.jaEnviados.push({
            parcelaId,
            clienteNome: parcela.cliente_nome,
            ultimoEnvio: ultimoEnvio.rows[0].data_envio
          });
          continue;
        }

        // Montar mensagem
        const mensagem = `🔔 *Cobrança - ${parcela.mentor_nome}*

Olá *${parcela.cliente_nome}*!

📋 Parcela *${parcela.numero_parcela}/${parcela.total_parcelas}* está em atraso
💰 Valor: *R$ ${parseFloat(parcela.valor).toFixed(2)}*
📅 Vencimento: ${new Date(parcela.data_vencimento).toLocaleDateString('pt-BR')}
⚠️ Dias em atraso: *${parcela.dias_atraso} dia(s)*

Por favor, regularize sua situação o quanto antes.

_Mensagem automática - Sistema DuoFuturo_`;

        // Enviar via WhatsApp
        const response = await axios.post(
          `http://localhost:${parcela.whatsapp_porta}/send`,
          {
            number: parcela.cliente_telefone,
            message: mensagem
          },
          { timeout: 10000 }
        );

        if (!response.data.success) {
          throw new Error(response.data.error || 'Erro ao enviar WhatsApp');
        }

        // Registrar envio no banco
        await query(`
          INSERT INTO notificacoes_enviadas (
            cliente_id,
            usuario_id,
            parcela_id,
            tipo,
            email_destinatario,
            assunto,
            corpo,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          parcela.cliente_id,
          parcela.usuario_id,
          parcelaId,
          'whatsapp_cobranca_manual',
          parcela.cliente_telefone,
          `WhatsApp: Cobrança de Parcela - ${parcela.dias_atraso} dia(s) de atraso`,
          mensagem,
          'enviado'
        ]);

        resultados.enviados.push({
          parcelaId,
          clienteNome: parcela.cliente_nome,
          clienteTelefone: parcela.cliente_telefone
        });

        // Delay de 2s entre mensagens (anti-ban WhatsApp)
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error: any) {
        resultados.erros.push({
          parcelaId,
          erro: error.message
        });
      }
    }

    return {
      totalProcessado: parcelaIds.length,
      totalEnviados: resultados.enviados.length,
      totalErros: resultados.erros.length,
      totalJaEnviados: resultados.jaEnviados.length,
      detalhes: resultados
    };
  }
};
