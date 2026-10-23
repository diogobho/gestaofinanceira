import crypto from 'crypto';
import { query } from '../../config/database';

/**
 * Programa de indicação (111, regra de 113 — 23/10/2026). Sugestão da Ive no grupo dos
 * fundadores; valores do dono.
 *
 * - O link é da CONTA (empresa): `duofuturo.tech/gestao/register?ref=<codigo>`.
 * - Só conta paga e ativa gera link.
 * - Cada indicada que assina rende AFILIADO_RECOMPENSA_BRL (padrão R$ 20) a quem indicou,
 *   uma vez só, depois do primeiro pagamento CONFIRMADO no Asaas (conferido na API).
 * - Quem indicou escolhe o destino de cada recompensa: saldo do Duo (uso da IA) ou abater
 *   na próxima cobrança da assinatura. A escolha é de quem administra a conta.
 *
 * A tabela é `afiliado_comissoes` (nome de 111); `valor_comissao` = a recompensa.
 */
const RECOMPENSA = () => {
  const n = Number(process.env.AFILIADO_RECOMPENSA_BRL ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
};
// O Asaas não emite cobrança abaixo de R$ 5: o abatimento nunca desce dali.
const MINIMO_COBRANCA = 5;
const URL_CADASTRO = 'https://duofuturo.tech/gestao/register';

// Sem 0/O/1/I/L: o código também é ditado e digitado à mão.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function novoCodigo(): string {
  const b = crypto.randomBytes(7);
  return Array.from(b, x => ALFABETO[x % ALFABETO.length]).join('');
}

async function contaAtivaPaga(empresaId: number): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM assinaturas
      WHERE empresa_id = $1 AND status = 'ativa'
        AND (asaas_subscription_id IS NOT NULL OR asaas_installment_id IS NOT NULL OR plano_ativo_ate IS NULL)`,
    [empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Abater só existe para quem tem assinatura recorrente: é nela que há "próxima cobrança". */
async function assinaturaRecorrente(empresaId: number): Promise<string | null> {
  const r = await query(
    `SELECT asaas_subscription_id FROM assinaturas WHERE empresa_id = $1 AND status = 'ativa' AND asaas_subscription_id IS NOT NULL`,
    [empresaId]
  );
  return r.rows[0]?.asaas_subscription_id ?? null;
}

export class ErroRecompensa extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const afiliadosService = {
  /** Painel: link (se a conta pode indicar), indicadas e recompensas. */
  async painel(empresaId: number, usuarioId: number) {
    const pode = await contaAtivaPaga(empresaId);
    let codigo: string | null = null;
    if (pode) {
      const atual = await query(`SELECT codigo FROM afiliados WHERE empresa_id = $1`, [empresaId]);
      codigo = atual.rows[0]?.codigo ?? null;
      for (let i = 0; !codigo && i < 5; i++) {
        const r = await query(
          `INSERT INTO afiliados (empresa_id, codigo, usuario_id) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING RETURNING codigo`,
          [empresaId, novoCodigo(), usuarioId]
        );
        codigo = r.rows[0]?.codigo
          ?? (await query(`SELECT codigo FROM afiliados WHERE empresa_id = $1`, [empresaId])).rows[0]?.codigo
          ?? null;
      }
    }
    // Da indicada só o primeiro nome da empresa e a situação: o resto é dado dela.
    const indicadas = await query(
      `SELECT split_part(e.nome, ' ', 1) AS nome, e.created_at,
              COALESCE(a.status, 'trial') AS situacao,
              c.id AS recompensa_id, c.valor_comissao::float8 AS valor, c.status AS recompensa_status
         FROM empresas e
         LEFT JOIN assinaturas a ON a.empresa_id = e.id
         LEFT JOIN afiliado_comissoes c ON c.indicada_empresa_id = e.id
        WHERE e.indicada_por_empresa_id = $1
        ORDER BY e.created_at DESC LIMIT 100`,
      [empresaId]
    );
    const tot = await query(
      `SELECT COALESCE(SUM(valor_comissao) FILTER (WHERE status = 'disponivel'), 0)::float8 AS disponivel,
              COALESCE(SUM(valor_comissao) FILTER (WHERE status = 'credito_duo'), 0)::float8 AS em_credito,
              COALESCE(SUM(valor_comissao) FILTER (WHERE status = 'desconto_pendente'), 0)::float8 AS a_abater,
              COALESCE(SUM(valor_comissao) FILTER (WHERE status = 'descontado'), 0)::float8 AS abatido
         FROM afiliado_comissoes WHERE afiliado_empresa_id = $1`,
      [empresaId]
    );
    return {
      pode_indicar: pode,
      link: codigo ? `${URL_CADASTRO}?ref=${codigo}` : null,
      codigo,
      recompensa: RECOMPENSA(),
      pode_abater: !!(await assinaturaRecorrente(empresaId)),
      indicadas: indicadas.rows,
      ...tot.rows[0],
    };
  },

  /** No cadastro: grava quem indicou. Nunca derruba o cadastro. */
  async vincularIndicacao(empresaId: number, ref: unknown): Promise<void> {
    const codigo = typeof ref === 'string' ? ref.trim().toUpperCase().slice(0, 20) : '';
    if (!codigo) return;
    try {
      await query(
        `UPDATE empresas e SET indicada_por_empresa_id = a.empresa_id, indicada_codigo = a.codigo
           FROM afiliados a
          WHERE e.id = $1 AND a.codigo = $2 AND a.empresa_id <> $1 AND e.indicada_por_empresa_id IS NULL`,
        [empresaId, codigo]
      );
    } catch (err: any) {
      console.error('[Afiliados] vincular indicação', err.message);
    }
  },

  /**
   * Primeiro pagamento confirmado de uma assinatura → recompensa de quem indicou.
   * Conferido na API do Asaas: o webhook é público e isto vira dinheiro.
   */
  async aoPagamentoAssinatura(empresaId: number, payload: any, parcelas?: number | null): Promise<void> {
    try {
      const emp = await query(`SELECT indicada_por_empresa_id FROM empresas WHERE id = $1`, [empresaId]);
      const afiliado = emp.rows[0]?.indicada_por_empresa_id;
      if (!afiliado || !payload?.id) return;
      const ja = await query(`SELECT 1 FROM afiliado_comissoes WHERE indicada_empresa_id = $1`, [empresaId]);
      if ((ja.rowCount ?? 0) > 0) return;

      const { asaasService } = await import('../../services/asaas.service');
      const real = await asaasService.getPayment(payload.id);
      if (!real || !['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(real.status)) return;

      const pago = Number(real.value) * (payload.installment && parcelas ? Number(parcelas) : 1);
      const r = await query(
        `INSERT INTO afiliado_comissoes
           (afiliado_empresa_id, indicada_empresa_id, asaas_payment_id, valor_pagamento, valor_comissao)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (indicada_empresa_id) DO NOTHING RETURNING id`,
        [afiliado, empresaId, payload.id, pago, RECOMPENSA()]
      );
      if (r.rows[0]) console.log(`[Afiliados] Recompensa de R$ ${RECOMPENSA()} para a empresa ${afiliado} (indicada ${empresaId})`);
    } catch (err: any) {
      console.error('[Afiliados] recompensa', err.message);
    }
  },

  /** Destino de uma recompensa disponível: saldo do Duo agora, ou abater na próxima cobrança. */
  async escolher(empresaId: number, usuarioId: number, recompensaId: number, destino: unknown) {
    if (destino !== 'credito_duo' && destino !== 'desconto') throw new ErroRecompensa('Escolha crédito do Duo ou abater no pagamento.');
    if (destino === 'desconto' && !(await assinaturaRecorrente(empresaId))) {
      throw new ErroRecompensa('Abater no pagamento só vale para assinatura com cobrança recorrente. Use como crédito do Duo.');
    }
    // A troca de status é o claim: duas abas ou dois cliques não usam a mesma recompensa.
    const r = await query(
      `UPDATE afiliado_comissoes SET status = $3, escolhido_em = now()
        WHERE id = $1 AND afiliado_empresa_id = $2 AND status = 'disponivel'
        RETURNING valor_comissao::float8 AS valor`,
      [recompensaId, empresaId, destino === 'credito_duo' ? 'credito_duo' : 'desconto_pendente']
    );
    const rec = r.rows[0];
    if (!rec) throw new ErroRecompensa('Recompensa não encontrada ou já usada.', 404);

    if (destino === 'credito_duo') {
      await query(
        `INSERT INTO duo_creditos_mov (empresa_id, usuario_id, tipo, valor_brl, detalhe)
         VALUES ($1, $2, 'indicacao', $3, $4)`,
        [empresaId, usuarioId, rec.valor, JSON.stringify({ recompensa_id: recompensaId })]
      );
      return { destino, valor: rec.valor };
    }
    const aplicado = await this.aplicarDescontos(empresaId);
    return { destino, valor: rec.valor, ja_abatido: aplicado > 0 };
  },

  /**
   * Abate as recompensas `desconto_pendente` na próxima cobrança em aberto da assinatura.
   * Roda na escolha e quando o Asaas avisa que criou a cobrança do ciclo (PAYMENT_CREATED).
   * Sem cobrança em aberto ainda, ficam pendentes. Devolve quanto foi abatido.
   */
  async aplicarDescontos(empresaId: number): Promise<number> {
    try {
      const subscriptionId = await assinaturaRecorrente(empresaId);
      if (!subscriptionId) return 0;
      const pend = await query(
        `SELECT id, valor_comissao::float8 AS valor FROM afiliado_comissoes
          WHERE afiliado_empresa_id = $1 AND status = 'desconto_pendente' ORDER BY id`,
        [empresaId]
      );
      if (pend.rows.length === 0) return 0;

      const { asaasService } = await import('../../services/asaas.service');
      const abertas = (await asaasService.getSubscriptionPayments(subscriptionId))
        .filter(p => p.status === 'PENDING')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const cobranca = abertas[0];
      if (!cobranca) return 0;

      // Quantas recompensas cabem sem levar a cobrança abaixo do mínimo do Asaas.
      let valor = Number(cobranca.value);
      const ids: number[] = [];
      for (const p of pend.rows) {
        if (valor - p.valor < MINIMO_COBRANCA) break;
        valor = Math.round((valor - p.valor) * 100) / 100;
        ids.push(p.id);
      }
      if (ids.length === 0) return 0;

      const claim = await query(
        `UPDATE afiliado_comissoes SET status = 'descontado', desconto_payment_id = $2
          WHERE id = ANY($1::int[]) AND status = 'desconto_pendente' RETURNING id`,
        [ids, cobranca.id]
      );
      if (claim.rowCount !== ids.length) {
        // Outra instância pegou parte delas no mesmo instante: devolve e deixa para a próxima vez.
        await query(`UPDATE afiliado_comissoes SET status = 'desconto_pendente', desconto_payment_id = NULL WHERE id = ANY($1::int[])`,
          [claim.rows.map((x: any) => x.id)]);
        return 0;
      }
      try {
        await asaasService.updatePaymentValue(cobranca.id, valor);
      } catch (err: any) {
        await query(`UPDATE afiliado_comissoes SET status = 'desconto_pendente', desconto_payment_id = NULL WHERE id = ANY($1::int[])`, [ids]);
        console.error('[Afiliados] abater no Asaas', err?.response?.data || err.message);
        return 0;
      }
      const abatido = Math.round((Number(cobranca.value) - valor) * 100) / 100;
      console.log(`[Afiliados] R$ ${abatido} abatidos na cobrança ${cobranca.id} da empresa ${empresaId}`);
      return abatido;
    } catch (err: any) {
      console.error('[Afiliados] aplicar descontos', err.message);
      return 0;
    }
  },
};
