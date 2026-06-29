import { query } from '../../config/database';
import { pluggyClient, PluggyItem } from './pluggy.client';

const CATEGORY_MAP: Record<string, string> = {
  'Food and drinks': 'Alimentação',
  'Transportation': 'Transporte',
  'Health': 'Saúde',
  'Housing': 'Moradia',
  'Entertainment': 'Lazer',
  'Education': 'Desenvolvimento Pessoal',
  'Shopping': 'Compras',
  'Services': 'Serviços',
  'Financial services': 'Financeiro',
  'Travel': 'Viagens e Aniversário',
  'Transfer': 'Transferência',
  'Taxes': 'Impostos',
};

function mapCategoria(pluggyCategory?: string): string {
  if (!pluggyCategory) return 'Outros';
  return CATEGORY_MAP[pluggyCategory] ?? 'Outros';
}

export const pluggyService = {
  async getConnectToken(usuarioId: number): Promise<string> {
    return pluggyClient.createConnectToken(String(usuarioId));
  },

  async registrarConexao(usuarioId: number, itemId: string): Promise<any> {
    let item: PluggyItem;
    try {
      item = await pluggyClient.getItem(itemId);
    } catch (err: any) {
      throw new Error(`Não foi possível verificar o item Pluggy: ${err.message}`);
    }

    const instituicao = item.connector?.name ?? 'Instituição desconhecida';

    const existing = await query(
      `SELECT id FROM conexoes_pluggy WHERE pluggy_item_id = $1`,
      [itemId]
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE conexoes_pluggy SET ativo = true, status = $1, updated_at = NOW() WHERE pluggy_item_id = $2`,
        [item.status, itemId]
      );
      return existing.rows[0];
    }

    const res = await query(
      `INSERT INTO conexoes_pluggy (usuario_id, pluggy_item_id, instituicao, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuarioId, itemId, instituicao, item.status]
    );

    return res.rows[0];
  },

  async sincronizarTransacoes(itemId: string): Promise<void> {
    const conexaoRes = await query(
      `SELECT * FROM conexoes_pluggy WHERE pluggy_item_id = $1 AND ativo = true`,
      [itemId]
    );

    if (conexaoRes.rows.length === 0) {
      console.warn(`[Pluggy] Conexão não encontrada para itemId=${itemId}`);
      return;
    }

    const conexao = conexaoRes.rows[0];

    let item: PluggyItem;
    try {
      item = await pluggyClient.getItem(itemId);
    } catch (err: any) {
      console.error(`[Pluggy] Erro ao buscar item ${itemId}:`, err.message);
      return;
    }

    await query(
      `UPDATE conexoes_pluggy SET status = $1, instituicao = $2, updated_at = NOW() WHERE pluggy_item_id = $3`,
      [item.status, item.connector?.name ?? conexao.instituicao, itemId]
    );

    if (item.status !== 'UPDATED') {
      console.log(`[Pluggy] Item ${itemId} status=${item.status} — aguardando, sync adiado`);
      return;
    }

    const accounts = await pluggyClient.listAccounts(itemId);
    const importarCartao = conexao.importar_cartao !== false;
    // Conta corrente sempre; cartão de crédito somente se habilitado na conexão
    const contasRelevantes = accounts.filter(
      a => a.type === 'BANK' || (a.type === 'CREDIT' && importarCartao)
    );

    if (contasRelevantes.length === 0) {
      console.log(`[Pluggy] Nenhuma conta relevante para item ${itemId}`);
      return;
    }

    const from = conexao.ultima_sync_em
      ? new Date(new Date(conexao.ultima_sync_em).getTime() - 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0]
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const to = new Date().toISOString().split('T')[0];
    const nomeBanco = item.connector?.name ?? conexao.instituicao;
    let importadas = 0;

    for (const account of contasRelevantes) {
      const transactions = await pluggyClient.listTransactions(account.id, from, to);
      // Despesa = saída de dinheiro (amount < 0): cobre débito em conta corrente
      // e compra no cartão de crédito (que vem como type=CREDIT e amount negativo).
      const despesasTx = transactions.filter(t => t.status === 'POSTED' && t.amount < 0);

      // Para cartão, identificar a fonte pelo nome da conta (ex.: "Mastercard Black")
      const nomeFonte = account.type === 'CREDIT'
        ? (account.marketingName || account.name || nomeBanco)
        : nomeBanco;

      for (const tx of despesasTx) {
        // Se o cartão é importado, ignorar o pagamento de fatura na conta corrente
        // para não duplicar com as compras individuais já importadas do cartão.
        if (importarCartao && account.type === 'BANK' && tx.category === 'Credit card payment') {
          continue;
        }

        const categoria = mapCategoria(tx.category);
        const valor = Math.abs(tx.amount);
        const data = tx.date.split('T')[0];
        const descricao = tx.description || tx.descriptionRaw || 'Transação bancária';

        const inserted = await query(
          `INSERT INTO despesas
             (descricao, valor, data, categoria, tipo_pagamento, status, pago,
              origem, pluggy_transaction_id, conexao_pluggy_id, instituicao, usuario_id)
           VALUES ($1,$2,$3,$4,'a_vista','pago',true,
                   'open_finance',$5,$6,$7,$8)
           ON CONFLICT (pluggy_transaction_id) DO NOTHING
           RETURNING id`,
          [descricao, valor, data, categoria, tx.id, conexao.id, nomeFonte, conexao.usuario_id]
        );

        if (inserted.rows.length > 0) {
          importadas++;
          await this._checarDuplicataManual(conexao.usuario_id, valor, data, inserted.rows[0].id);
        }
      }
    }

    await query(
      `UPDATE conexoes_pluggy SET ultima_sync_em = NOW(), updated_at = NOW() WHERE pluggy_item_id = $1`,
      [itemId]
    );

    console.log(`[Pluggy] Sync concluído ${itemId}: ${importadas} despesas importadas`);
  },

  async _checarDuplicataManual(usuarioId: number, valor: number, data: string, novaId: string): Promise<void> {
    const dupes = await query(
      `SELECT id FROM despesas
       WHERE usuario_id = $1
         AND origem = 'manual'
         AND status_conciliacao = 'ok'
         AND valor = $2
         AND data BETWEEN ($3::date - INTERVAL '2 days') AND ($3::date + INTERVAL '2 days')
       LIMIT 1`,
      [usuarioId, valor, data]
    );

    if (dupes.rows.length > 0) {
      await query(
        `UPDATE despesas SET status_conciliacao = 'possivel_duplicata' WHERE id = $1`,
        [novaId]
      );
    }
  },

  async listarConexoes(usuarioId: number): Promise<any[]> {
    const res = await query(
      `SELECT * FROM conexoes_pluggy WHERE usuario_id = $1 AND ativo = true ORDER BY created_at DESC`,
      [usuarioId]
    );
    return res.rows;
  },

  async desativarConexao(conexaoId: string, usuarioId: number): Promise<void> {
    const res = await query(
      `UPDATE conexoes_pluggy SET ativo = false, updated_at = NOW()
       WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [conexaoId, usuarioId]
    );
    if (res.rows.length === 0) throw new Error('Conexão não encontrada');
  },

  async atualizarConexao(
    conexaoId: string,
    usuarioId: number,
    data: { importar_cartao?: boolean }
  ): Promise<any> {
    if (data.importar_cartao === undefined) {
      throw new Error('Nenhum campo para atualizar');
    }

    const res = await query(
      `UPDATE conexoes_pluggy SET importar_cartao = $1, updated_at = NOW()
       WHERE id = $2 AND usuario_id = $3 AND ativo = true
       RETURNING *`,
      [data.importar_cartao, conexaoId, usuarioId]
    );
    if (res.rows.length === 0) throw new Error('Conexão não encontrada');

    return res.rows[0];
  },
};
