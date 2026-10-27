import { escopoDono, type FiltroDono } from '../../shared/escopoFinanceiro';
import { query, pool } from '../../config/database';
import { enviarEmailCobrancaParcela } from '../../services/email.service';
import { configuracoesSmtpService } from '../configuracoes-smtp/configuracoes-smtp.service';
import { instancia } from '../whatsapp/canal/instancia';

export const parcelasService = {
  async listReceitas(filters: any) {
    let where = '1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Multi-tenancy: ADMIN vê tudo, usuário vê apenas suas parcelas
    where += escopoDono(filters, params, 'r.usuario_id');
    paramCount = params.length + 1;

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

    // `base=pagamento` (regime de caixa, Dashboard): o período olha o dia em que o
    // dinheiro entrou/saiu, e só a parcela paga tem esse dia.
    const colunaData = filters.base === 'pagamento' ? 'pr.data_pagamento' : 'pr.data_vencimento';
    if (filters.base === 'pagamento') where += ` AND pr.status = 'PAGO'`;

    if (filters.data_ini) {
      where += ` AND ${colunaData} >= $${paramCount}`;
      params.push(filters.data_ini);
      paramCount++;
    }

    if (filters.data_fim) {
      where += ` AND ${colunaData} <= $${paramCount}`;
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
        -- Origem para o filtro do dashboard: veio do Asaas, do Conta Azul ou foi lançada no Duo.
        CASE WHEN EXISTS (SELECT 1 FROM asaas_cobrancas ac WHERE ac.receita_id = r.id) THEN 'asaas'
             WHEN EXISTS (SELECT 1 FROM contaazul_lancamentos cl WHERE cl.receita_id = r.id) THEN 'contaazul'
             ELSE 'manual' END as origem,
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
    where += escopoDono(filters, params, 'd.usuario_id');
    paramCount = params.length + 1;

    if (filters.status) {
      where += ` AND pd.status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    // `base=pagamento` (regime de caixa, Dashboard): o período olha o dia em que o
    // dinheiro entrou/saiu, e só a parcela paga tem esse dia.
    const colunaData = filters.base === 'pagamento' ? 'pd.data_pagamento' : 'pd.data_vencimento';
    if (filters.base === 'pagamento') where += ` AND pd.status = 'PAGO'`;

    if (filters.data_ini) {
      where += ` AND ${colunaData} >= $${paramCount}`;
      params.push(filters.data_ini);
      paramCount++;
    }

    if (filters.data_fim) {
      where += ` AND ${colunaData} <= $${paramCount}`;
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
        d.categoria as despesa_categoria,
        COALESCE(d.origem, 'manual') as origem
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
    where += escopoDono(filters, params, 'r.usuario_id');
    paramCount = params.length + 1;

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

  /**
   * Exclui UMA parcela. As que sobram são renumeradas (1 de N…) e o lançamento passa a valer a
   * soma delas; sobrando uma, vira à vista (`*_parcelas_minimo` exige 2+ no parcelado); sem
   * nenhuma, o lançamento sai junto. Receita do Asaas/Conta Azul apagada assim não volta.
   */
  async excluirParcela(tipo: 'receitas' | 'despesas', id: string, filters?: any) {
    const t = tipo === 'receitas'
      ? { parcelas: 'parcelas_receitas', fk: 'receita_id', pai: 'receitas' }
      : { parcelas: 'parcelas_despesas', fk: 'despesa_id', pai: 'despesas' };
    const params: any[] = [id];
    const escopo = escopoDono(filters, params, 'l.usuario_id');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const par = (await db.query(
        `SELECT p.${t.fk} AS pai_id FROM ${t.parcelas} p JOIN ${t.pai} l ON l.id = p.${t.fk}
          WHERE p.id = $1${escopo} FOR UPDATE OF p, l`, params)).rows[0];
      if (!par) throw new Error('Parcela não encontrada ou sem permissão');

      await db.query(`DELETE FROM ${t.parcelas} WHERE id = $1`, [id]);
      const resto = (await db.query(
        `SELECT id, valor FROM ${t.parcelas} WHERE ${t.fk} = $1 ORDER BY numero_parcela, data_vencimento`,
        [par.pai_id])).rows;

      if (resto.length === 0) {
        await db.query(`DELETE FROM ${t.pai} WHERE id = $1`, [par.pai_id]);
        await db.query('COMMIT');
        return { lancamento_excluido: true };
      }
      for (let i = 0; i < resto.length; i++) {
        await db.query(
          `UPDATE ${t.parcelas} SET numero_parcela = $1, total_parcelas = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [i + 1, resto.length, resto[i].id]);
      }
      const total = resto.reduce((s: number, r: any) => s + Number(r.valor), 0);
      const n = resto.length;
      await db.query(
        `UPDATE ${t.pai} SET valor = $1,
                parcelado = $2 > 1,
                tipo_pagamento = CASE WHEN $2 > 1 THEN tipo_pagamento ELSE 'a_vista' END,
                numero_parcelas = CASE WHEN $2 > 1 THEN $2 END,
                parcela_atual = CASE WHEN $2 > 1 THEN LEAST(COALESCE(parcela_atual, 1), $2) END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $3`, [Math.round(total * 100) / 100, n, par.pai_id]);
      await db.query('COMMIT');
      return { lancamento_excluido: false, parcelas_restantes: n };
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  },

  async updateParcelaDespesa(id: string, data: any, filters?: any) {
    let where = 'pd.id = $1';
    const params: any[] = [id];
    let paramCount = 2;

    // Multi-tenancy: apenas o dono pode atualizar
    where += escopoDono(filters, params, 'd.usuario_id');
    paramCount = params.length + 1;

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

  async enviarEmailsCobrancaManuais(parcelaIds: string[], filtro: FiltroDono, empresaId?: number) {
    const resultados = {
      enviados: [] as any[],
      erros: [] as any[],
      jaEnviados: [] as any[]
    };

    // Só o e-mail da própria empresa. Sem ele, cada parcela volta com o aviso.
    const smtpCredentials = empresaId
      ? await configuracoesSmtpService.credenciaisDaEmpresa(empresaId)
      : null;

    for (const parcelaId of parcelaIds) {
      try {
        // Buscar informações da parcela, cliente e mentor
        const paramsParcela: any[] = [parcelaId];
        const escopo = escopoDono(filtro, paramsParcela, 'r.usuario_id');
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
          WHERE pr.id = $1 ${escopo}
        `, paramsParcela);

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
        }, smtpCredentials ?? undefined);

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

  async enviarWhatsAppCobrancaManuais(parcelaIds: string[], filtro: FiltroDono) {
    const axios = require('axios');
    const resultados = {
      enviados: [] as any[],
      erros: [] as any[],
      jaEnviados: [] as any[]
    };

    for (const parcelaId of parcelaIds) {
      try {
        // Buscar informações da parcela, cliente e mentor (usuário)
        const paramsParcela: any[] = [parcelaId];
        const escopo = escopoDono(filtro, paramsParcela, 'r.usuario_id');
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
          WHERE pr.id = $1 ${escopo}
        `, paramsParcela);

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
        const response = await instancia(parcela.whatsapp_porta).post(`/send`,
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
