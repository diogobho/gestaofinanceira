/**
 * Serviço de Notificações WhatsApp Multi-Usuário
 * Cada usuário (mentor) envia mensagens do seu próprio WhatsApp
 */

import { Pool } from 'pg';

// Importar biblioteca de integração WhatsApp (JavaScript)
const GestaoFinanceiraWhatsApp = require('/var/www/apps/whatsapp-integration/lib/integracoes/gestao-financeira');

interface Usuario {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  whatsapp_porta?: number;
  whatsapp_conectado?: boolean;
}

interface Cliente {
  id: string;
  nome_completo: string;
  telefone: string;
  email: string;
  mentor_id: string;
}

interface Parcela {
  id: string;
  cliente_id: string;
  valor: number;
  data_vencimento: Date;
  status: string;
  numero_parcela: number;
  total_parcelas: number;
}

interface ParcelaRow {
  parcela_id: string;
  valor: string;
  data_vencimento: Date;
  status: string;
  numero_parcela: number;
  total_parcelas: number;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_email: string;
  mentor_id: string;
  mentor_nome: string;
  mentor_email: string;
  mentor_telefone: string;
  whatsapp_porta: number;
  whatsapp_conectado: boolean;
}

export class WhatsAppNotificacoesService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Obtém cliente WhatsApp do usuário específico
   */
  private getClienteWhatsApp(usuario: Usuario): any {
    if (!usuario.whatsapp_porta) {
      throw new Error(`Usuário ${usuario.nome} não tem WhatsApp configurado`);
    }

    if (!usuario.whatsapp_conectado) {
      throw new Error(`WhatsApp do usuário ${usuario.nome} está desconectado`);
    }

    const url = `http://localhost:${usuario.whatsapp_porta}`;
    return new GestaoFinanceiraWhatsApp(url);
  }

  /**
   * Envia lembrete de parcela atrasada
   * Usa o WhatsApp do MENTOR (dono do cliente)
   */
  async enviarLembreteParcelaAtrasada(
    mentor: Usuario,
    cliente: Cliente,
    parcela: Parcela
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Pega WhatsApp do mentor (não do cliente!)
      const whatsapp = this.getClienteWhatsApp(mentor);

      // Dados do cliente para enviar mensagem
      const clienteData = {
        nome: cliente.nome_completo,
        telefone: cliente.telefone,
        data_vencimento_pagamento: parcela.data_vencimento,
        valor_mensalidade: parcela.valor,
        numero_parcela: parcela.numero_parcela,
        total_parcelas: parcela.total_parcelas
      };

      // Enviar usando o WhatsApp do mentor
      const resultado = await whatsapp.enviarCobranca(clienteData);

      if (resultado.success) {
        console.log(`✅ Cobrança enviada do WhatsApp de ${mentor.nome} para ${cliente.nome_completo}`);
        return { success: true };
      } else {
        console.error(`❌ Erro ao enviar cobrança: ${resultado.error}`);
        return { success: false, error: resultado.error };
      }

    } catch (error: any) {
      console.error(`Erro ao enviar lembrete:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia lembrete de pagamento (antes do vencimento)
   */
  async enviarLembretePagamento(
    mentor: Usuario,
    cliente: Cliente,
    parcela: Parcela
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const whatsapp = this.getClienteWhatsApp(mentor);

      const clienteData = {
        nome: cliente.nome_completo,
        telefone: cliente.telefone,
        data_vencimento_pagamento: parcela.data_vencimento,
        valor_mensalidade: parcela.valor,
        numero_parcela: parcela.numero_parcela,
        total_parcelas: parcela.total_parcelas,
        email: cliente.email
      };

      const resultado = await whatsapp.enviarLembretePagamento(clienteData);

      if (resultado.success) {
        console.log(`✅ Lembrete enviado do WhatsApp de ${mentor.nome} para ${cliente.nome_completo}`);
        return { success: true };
      } else {
        console.error(`❌ Erro ao enviar lembrete: ${resultado.error}`);
        return { success: false, error: resultado.error };
      }

    } catch (error: any) {
      console.error(`Erro ao enviar lembrete:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Processa todas as parcelas atrasadas
   * Agrupa por mentor e envia do WhatsApp de cada mentor
   */
  async processarParcelasAtrasadas(): Promise<{
    total: number;
    enviados: number;
    erros: number;
  }> {
    try {
      console.log('\n🔔 Processando parcelas atrasadas...\n');

      // Buscar parcelas atrasadas com informações do mentor e cliente
      const query = `
        SELECT
          p.id as parcela_id,
          p.valor,
          p.data_vencimento,
          p.status,
          p.numero_parcela,
          v.qtde_parcelas as total_parcelas,
          c.nome_completo as cliente_nome,
          c.telefone as cliente_telefone,
          c.email as cliente_email,
          c.mentor_id,
          u.nome as mentor_nome,
          u.email as mentor_email,
          u.telefone as mentor_telefone,
          u.whatsapp_porta,
          u.whatsapp_conectado
        FROM parcelas p
        INNER JOIN vendas v ON v.id = p.venda_id
        INNER JOIN clientes c ON c.id = v.cliente_id
        INNER JOIN usuarios u ON u.id = c.mentor_id
        WHERE p.status = 'PENDENTE'
          AND p.data_vencimento < CURRENT_DATE
          AND c.telefone IS NOT NULL
          AND u.whatsapp_conectado = TRUE
        ORDER BY u.id, p.data_vencimento
      `;

      const result = await this.pool.query(query);
      const parcelas = result.rows as ParcelaRow[];

      if (parcelas.length === 0) {
        console.log('ℹ️  Nenhuma parcela atrasada encontrada');
        return { total: 0, enviados: 0, erros: 0 };
      }

      // Agrupar por mentor
      const parcelasPorMentor = new Map<string, ParcelaRow[]>();
      parcelas.forEach(p => {
        if (!parcelasPorMentor.has(p.mentor_id)) {
          parcelasPorMentor.set(p.mentor_id, []);
        }
        parcelasPorMentor.get(p.mentor_id)!.push(p);
      });

      console.log(`📊 ${parcelas.length} parcelas atrasadas de ${parcelasPorMentor.size} mentores\n`);

      let enviados = 0;
      let erros = 0;

      // Processar cada mentor
      for (const [mentorId, parcelasMentor] of parcelasPorMentor) {
        const primeiraRow = parcelasMentor[0];

        const mentor: Usuario = {
          id: mentorId,
          nome: primeiraRow.mentor_nome,
          email: primeiraRow.mentor_email,
          telefone: primeiraRow.mentor_telefone,
          whatsapp_porta: primeiraRow.whatsapp_porta,
          whatsapp_conectado: primeiraRow.whatsapp_conectado
        };

        console.log(`👤 ${mentor.nome} (${parcelasMentor.length} cobranças):`);

        for (const row of parcelasMentor) {
          const cliente: Cliente = {
            id: row.parcela_id,
            nome_completo: row.cliente_nome,
            telefone: row.cliente_telefone,
            email: row.cliente_email,
            mentor_id: mentorId
          };

          const parcela: Parcela = {
            id: row.parcela_id,
            cliente_id: row.parcela_id,
            valor: parseFloat(row.valor),
            data_vencimento: row.data_vencimento,
            status: row.status,
            numero_parcela: row.numero_parcela,
            total_parcelas: row.total_parcelas
          };

          try {
            console.log(`   ├─ ${cliente.nome_completo}...`);
            const resultado = await this.enviarLembreteParcelaAtrasada(mentor, cliente, parcela);

            if (resultado.success) {
              enviados++;
            } else {
              erros++;
            }

            // Delay de 3 segundos entre mensagens (anti-ban)
            await this.delay(3000);

          } catch (error) {
            console.error(`❌ Erro ao processar parcela ${parcela.id}:`, error);
            erros++;
          }
        }

        console.log('');
      }

      console.log('✅ Processamento concluído');
      console.log(`📊 Total: ${parcelas.length} | Enviados: ${enviados} | Erros: ${erros}\n`);

      return {
        total: parcelas.length,
        enviados,
        erros
      };

    } catch (error) {
      console.error('Erro ao processar parcelas atrasadas:', error);
      throw error;
    }
  }

  /**
   * Processa lembretes de pagamento (antes do vencimento)
   * Envia 1 dia antes do vencimento
   */
  async processarLembretesPagamento(): Promise<{
    total: number;
    enviados: number;
    erros: number;
  }> {
    try {
      console.log('\n📅 Processando lembretes de pagamento...\n');

      // Buscar parcelas que vencem amanhã
      const query = `
        SELECT
          p.id as parcela_id,
          p.valor,
          p.data_vencimento,
          p.status,
          p.numero_parcela,
          v.qtde_parcelas as total_parcelas,
          c.nome_completo as cliente_nome,
          c.telefone as cliente_telefone,
          c.email as cliente_email,
          c.mentor_id,
          u.nome as mentor_nome,
          u.email as mentor_email,
          u.telefone as mentor_telefone,
          u.whatsapp_porta,
          u.whatsapp_conectado
        FROM parcelas p
        INNER JOIN vendas v ON v.id = p.venda_id
        INNER JOIN clientes c ON c.id = v.cliente_id
        INNER JOIN usuarios u ON u.id = c.mentor_id
        WHERE p.status = 'PENDENTE'
          AND p.data_vencimento = CURRENT_DATE + INTERVAL '1 day'
          AND c.telefone IS NOT NULL
          AND u.whatsapp_conectado = TRUE
        ORDER BY u.id, p.data_vencimento
      `;

      const result = await this.pool.query(query);
      const parcelas = result.rows as ParcelaRow[];

      if (parcelas.length === 0) {
        console.log('ℹ️  Nenhum lembrete para enviar hoje');
        return { total: 0, enviados: 0, erros: 0 };
      }

      console.log(`📊 ${parcelas.length} lembretes para enviar\n`);

      let enviados = 0;
      let erros = 0;

      for (const row of parcelas) {
        const mentor: Usuario = {
          id: row.mentor_id,
          nome: row.mentor_nome,
          email: row.mentor_email,
          telefone: row.mentor_telefone,
          whatsapp_porta: row.whatsapp_porta,
          whatsapp_conectado: row.whatsapp_conectado
        };

        const cliente: Cliente = {
          id: row.parcela_id,
          nome_completo: row.cliente_nome,
          telefone: row.cliente_telefone,
          email: row.cliente_email,
          mentor_id: row.mentor_id
        };

        const parcela: Parcela = {
          id: row.parcela_id,
          cliente_id: row.parcela_id,
          valor: parseFloat(row.valor),
          data_vencimento: row.data_vencimento,
          status: row.status,
          numero_parcela: row.numero_parcela,
          total_parcelas: row.total_parcelas
        };

        try {
          console.log(`📤 ${mentor.nome} → ${cliente.nome_completo}...`);
          const resultado = await this.enviarLembretePagamento(mentor, cliente, parcela);

          if (resultado.success) {
            enviados++;
          } else {
            erros++;
          }

          await this.delay(3000);

        } catch (error) {
          console.error(`❌ Erro:`, error);
          erros++;
        }
      }

      console.log('\n✅ Lembretes processados');
      console.log(`📊 Total: ${parcelas.length} | Enviados: ${enviados} | Erros: ${erros}\n`);

      return {
        total: parcelas.length,
        enviados,
        erros
      };

    } catch (error) {
      console.error('Erro ao processar lembretes:', error);
      throw error;
    }
  }

  /**
   * Verifica status do WhatsApp de um usuário
   */
  async verificarStatusWhatsApp(usuario: Usuario): Promise<boolean> {
    if (!usuario.whatsapp_porta) {
      return false;
    }

    try {
      const whatsapp = new GestaoFinanceiraWhatsApp(`http://localhost:${usuario.whatsapp_porta}`);
      return await whatsapp.whatsapp.isConnected();
    } catch (error) {
      console.error(`Erro ao verificar WhatsApp de ${usuario.nome}:`, error);
      return false;
    }
  }

  /**
   * Atualiza status de conexão WhatsApp no banco
   */
  async atualizarStatusWhatsApp(usuarioId: string, conectado: boolean): Promise<void> {
    const query = `
      UPDATE usuarios
      SET whatsapp_conectado = $1,
          whatsapp_ultima_conexao = CASE WHEN $1 = TRUE THEN NOW() ELSE whatsapp_ultima_conexao END
      WHERE id = $2
    `;

    await this.pool.query(query, [conectado, usuarioId]);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default WhatsAppNotificacoesService;
