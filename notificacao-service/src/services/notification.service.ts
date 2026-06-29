import { query } from '../config/database';
import { sendEmail, createPaymentOverdueEmail, createPaymentReminderEmail } from './email.service';

interface ClienteVencido {
  id: number;
  codigo: string;
  nome: string;
  email: string;
  telefone: string;
  data_vencimento_pagamento: Date;
  valor_mensalidade: number;
  usuario_id: number;
  dias_atraso: number;
}

// Função auxiliar para processar notificação preventiva
const processarNotificacaoPreventiva = async (cliente: any): Promise<string> => {
  console.log(`\n🔔 Processando notificação preventiva: ${cliente.nome} (${cliente.email})`);
  console.log(`   Vencimento: amanhã`);

  try {
    // Verificar se já foi enviada notificação preventiva
    const jaNotificado = await query(`
      SELECT id FROM notificacoes_enviadas
      WHERE cliente_id = $1
        AND tipo = 'pagamento_proximo_vencimento'
        AND data_envio > NOW() - INTERVAL '24 hours'
        AND status = 'enviado'
      LIMIT 1
    `, [cliente.id]);

    if (jaNotificado.rows.length > 0) {
      console.log('   ⏭️  Notificação preventiva já enviada. Pulando...');
      return 'pulado';
    }

    const assunto = `🔔 Lembrete: Pagamento vence amanhã`;
    const html = createPaymentReminderEmail(cliente.nome, cliente.valor_mensalidade);

    await sendEmail({
      to: cliente.email,
      subject: assunto,
      html: html
    });

    await query(`
      INSERT INTO notificacoes_enviadas (
        cliente_id,
        usuario_id,
        tipo,
        email_destinatario,
        assunto,
        corpo,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      cliente.id,
      cliente.usuario_id,
      'pagamento_proximo_vencimento',
      cliente.email,
      assunto,
      html,
      'enviado'
    ]);

    console.log(`   ✅ Notificação preventiva enviada!`);
    return 'sucesso';
  } catch (error: any) {
    console.error(`   ❌ Erro: ${error.message}`);
    return 'erro';
  }
};

// Função auxiliar para processar notificação de vencido
const processarNotificacaoVencido = async (cliente: ClienteVencido): Promise<string> => {
  console.log(`\n📤 Processando cliente vencido: ${cliente.nome} (${cliente.email})`);
  console.log(`   Dias de atraso: ${cliente.dias_atraso}`);

  try {
    // Verificar se já foi enviada notificação nas últimas 24h
    const jaNotificado = await query(`
      SELECT id FROM notificacoes_enviadas
      WHERE cliente_id = $1
        AND tipo = 'pagamento_vencido'
        AND data_envio > NOW() - INTERVAL '24 hours'
        AND status = 'enviado'
      LIMIT 1
    `, [cliente.id]);

    if (jaNotificado.rows.length > 0) {
      console.log('   ⏭️  Notificação já enviada nas últimas 24h. Pulando...');
      return 'pulado';
    }

    const assunto = `⚠️ Pagamento Vencido - ${cliente.dias_atraso} dia(s) de atraso`;
    const html = createPaymentOverdueEmail(
      cliente.nome,
      cliente.dias_atraso,
      cliente.valor_mensalidade
    );

    await sendEmail({
      to: cliente.email,
      subject: assunto,
      html: html
    });

    await query(`
      INSERT INTO notificacoes_enviadas (
        cliente_id,
        usuario_id,
        tipo,
        email_destinatario,
        assunto,
        corpo,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      cliente.id,
      cliente.usuario_id,
      'pagamento_vencido',
      cliente.email,
      assunto,
      html,
      'enviado'
    ]);

    await query(`
      UPDATE clientes
      SET status_pagamento = 'atrasado'
      WHERE id = $1
    `, [cliente.id]);

    console.log(`   ✅ E-mail enviado com sucesso!`);
    return 'sucesso';
  } catch (error: any) {
    console.error(`   ❌ Erro: ${error.message}`);

    await query(`
      INSERT INTO notificacoes_enviadas (
        cliente_id,
        usuario_id,
        tipo,
        email_destinatario,
        assunto,
        status,
        erro
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      cliente.id,
      cliente.usuario_id,
      'pagamento_vencido',
      cliente.email,
      'Erro ao enviar notificação',
      'erro',
      error.message
    ]);

    return 'erro';
  }
};

export const verificarENotificarVencimentos = async (): Promise<void> => {
  console.log('\n🔍 Iniciando verificação de pagamentos vencidos e próximos ao vencimento...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`);

  try {
    // 1. Buscar clientes que vencem AMANHÃ (notificação preventiva)
    console.log('📋 Verificando pagamentos que vencem amanhã...');
    const proximosVencimento = await query(`
      SELECT
        c.id,
        c.codigo,
        c.nome,
        c.email,
        c.telefone,
        c.data_vencimento_pagamento,
        c.valor_mensalidade,
        c.usuario_id,
        c.data_vencimento_pagamento - CURRENT_DATE AS dias_restantes
      FROM clientes c
      WHERE
        c.data_vencimento_pagamento IS NOT NULL
        AND c.data_vencimento_pagamento = CURRENT_DATE + INTERVAL '1 day'
        AND c.status_pagamento != 'pago'
        AND c.email IS NOT NULL
        AND c.email != ''
        AND c.email LIKE '%@%'
      ORDER BY c.data_vencimento_pagamento ASC
    `);

    console.log(`📊 Clientes com vencimento amanhã: ${proximosVencimento.rows.length}`);

    // Processar notificações preventivas
    for (const cliente of proximosVencimento.rows) {
      await processarNotificacaoPreventiva(cliente);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 2. Buscar clientes com pagamentos vencidos que possuem e-mail
    console.log('\n📋 Verificando pagamentos vencidos...');
    const result = await query(`
      SELECT
        c.id,
        c.codigo,
        c.nome,
        c.email,
        c.telefone,
        c.data_vencimento_pagamento,
        c.valor_mensalidade,
        c.usuario_id,
        CURRENT_DATE - c.data_vencimento_pagamento AS dias_atraso
      FROM clientes c
      WHERE
        c.data_vencimento_pagamento IS NOT NULL
        AND c.data_vencimento_pagamento < CURRENT_DATE
        AND c.status_pagamento != 'pago'
        AND c.email IS NOT NULL
        AND c.email != ''
        AND c.email LIKE '%@%'
      ORDER BY c.data_vencimento_pagamento ASC
    `);

    const clientesVencidos: ClienteVencido[] = result.rows;

    console.log(`📊 Total de clientes com pagamento vencido: ${clientesVencidos.length}`);

    let sucessos = 0;
    let erros = 0;

    // Processar cada cliente vencido
    for (const cliente of clientesVencidos) {
      const resultado = await processarNotificacaoVencido(cliente);
      if (resultado === 'sucesso') sucessos++;
      else if (resultado === 'erro') erros++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA EXECUÇÃO');
    console.log('='.repeat(60));
    console.log(`Preventivas (vence amanhã): ${proximosVencimento.rows.length}`);
    console.log(`Vencidos processados: ${clientesVencidos.length}`);
    console.log(`✅ Sucessos: ${sucessos}`);
    console.log(`❌ Erros: ${erros}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Erro crítico ao verificar vencimentos:', error);
    throw error;
  }
};

export const getHistoricoNotificacoes = async (filters?: {
  usuario_id?: number;
  cliente_id?: number;
  limit?: number;
}) => {
  let where = '1=1';
  const params: any[] = [];
  let paramCount = 1;

  if (filters?.usuario_id) {
    where += ` AND n.usuario_id = $${paramCount}`;
    params.push(filters.usuario_id);
    paramCount++;
  }

  if (filters?.cliente_id) {
    where += ` AND n.cliente_id = $${paramCount}`;
    params.push(filters.cliente_id);
    paramCount++;
  }

  const limit = filters?.limit || 100;

  const result = await query(`
    SELECT
      n.*,
      c.nome as cliente_nome,
      c.email as cliente_email,
      u.nome as usuario_nome
    FROM notificacoes_enviadas n
    INNER JOIN clientes c ON n.cliente_id = c.id
    INNER JOIN usuarios u ON n.usuario_id = u.id
    WHERE ${where}
    ORDER BY n.data_envio DESC
    LIMIT ${limit}
  `, params);

  return result.rows;
};
