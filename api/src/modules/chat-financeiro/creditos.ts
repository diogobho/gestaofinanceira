import { query } from '../../config/database';

/**
 * Crédito do Duo por empresa (decisão do dono, 21/10/2026).
 *
 * O chat roda SEMPRE pela chave da DuoFuturo (`DUO_ANTHROPIC_API_KEY`). Cada empresa
 * ganha um crédito de teste no primeiro uso; acabou, compra crédito na plataforma e a
 * DuoFuturo faz o meio de campo com a Anthropic. O extrato é `duo_creditos_mov`
 * (saldo = soma de `valor_brl`; consumo entra negativo).
 *
 * Valores por env, para ajustar sem deploy de código:
 *   DUO_CREDITO_TESTE_BRL       crédito de teste por empresa       (padrão 10)
 *   DUO_DOLAR_BRL               câmbio usado no consumo            (padrão 5.60)
 *   DUO_MARGEM                  multiplicador sobre o custo da API (padrão 1)
 *   DUO_EMPRESAS_SEM_COBRANCA   ids separados por vírgula          (padrão "1,32": contas internas)
 */

const num = (v: string | undefined, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
};

const CREDITO_TESTE_BRL = () => num(process.env.DUO_CREDITO_TESTE_BRL, 10);
const DOLAR_BRL = () => num(process.env.DUO_DOLAR_BRL, 5.6);
const MARGEM = () => num(process.env.DUO_MARGEM, 1);
const SEM_COBRANCA = () =>
  new Set((process.env.DUO_EMPRESAS_SEM_COBRANCA ?? '1,32').split(',').map(s => Number(s.trim())).filter(Boolean));

// US$ por milhão de tokens: entrada, saída, leitura de cache, escrita de cache (5 min).
const PRECOS: Record<string, [number, number, number, number]> = {
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-opus-5-5': [4, 20, 0.4, 5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
};

export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export const usoVazio = (): UsoTokens => ({
  input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
});

/** Soma o `usage` de uma resposta da API no acumulado da mensagem. */
export function somarUso(total: UsoTokens, usage: any) {
  total.input_tokens += Number(usage?.input_tokens) || 0;
  total.output_tokens += Number(usage?.output_tokens) || 0;
  total.cache_read_input_tokens += Number(usage?.cache_read_input_tokens) || 0;
  total.cache_creation_input_tokens += Number(usage?.cache_creation_input_tokens) || 0;
}

export function custoUsd(modelo: string, u: UsoTokens): number {
  const [ent, sai, lei, esc] = PRECOS[modelo] || PRECOS['claude-sonnet-5-5'];
  return (u.input_tokens * ent + u.output_tokens * sai
    + u.cache_read_input_tokens * lei + u.cache_creation_input_tokens * esc) / 1_000_000;
}

export const duoCreditos = {
  semCobranca(empresaId: number): boolean {
    return SEM_COBRANCA().has(Number(empresaId));
  },

  /** Saldo em R$. Lança o crédito de teste na primeira consulta da empresa. */
  async saldo(empresaId: number): Promise<number> {
    await query(
      `INSERT INTO duo_creditos_mov (empresa_id, tipo, valor_brl, detalhe)
       VALUES ($1, 'teste', $2, '{"origem":"primeiro uso do Duo"}')
       ON CONFLICT (empresa_id) WHERE tipo = 'teste' DO NOTHING`,
      [empresaId, CREDITO_TESTE_BRL()]
    );
    const r = await query(
      `SELECT COALESCE(SUM(valor_brl), 0) AS saldo FROM duo_creditos_mov WHERE empresa_id = $1`,
      [empresaId]
    );
    return Number(r.rows[0].saldo);
  },

  /** Desconta o que a mensagem custou. Empresa sem cobrança também fica no extrato, com valor 0. */
  async registrarConsumo(empresaId: number, usuarioId: number, modelo: string, uso: UsoTokens) {
    const usd = custoUsd(modelo, uso);
    const brl = this.semCobranca(empresaId) ? 0 : usd * DOLAR_BRL() * MARGEM();
    await query(
      `INSERT INTO duo_creditos_mov (empresa_id, usuario_id, tipo, valor_brl, detalhe)
       VALUES ($1, $2, 'consumo', $3, $4)`,
      [empresaId, usuarioId, -brl, JSON.stringify({ modelo, ...uso, custo_usd: Number(usd.toFixed(6)) })]
    );
  },
};

// ─── Recarga pela plataforma (111, 23/10/2026) ────────────────────────────────
// Pacotes fixos: valor redondo é mais fácil de entender do que "quantas mensagens".
// Ajustáveis por env (DUO_PACOTES_BRL="20,50,100") sem deploy de código.
export const pacotesCredito = (): number[] =>
  (process.env.DUO_PACOTES_BRL ?? '20,50,100')
    .split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 5);

const REF_PREFIXO = 'duo_credito:';

export const duoRecarga = {
  /** Saldo, pacotes, compras e o extrato resumido por dia — o que a tela de créditos mostra. */
  async painel(empresaId: number) {
    const saldo = await duoCreditos.saldo(empresaId);
    const [compras, extrato] = await Promise.all([
      query(
        `SELECT id, valor_brl::float8 AS valor, status, invoice_url, created_at, paga_at
           FROM duo_creditos_compras WHERE empresa_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [empresaId]
      ),
      // Consumo agrupado por dia: uma linha por mensagem viraria centenas de centavos.
      query(
        `SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, tipo,
                SUM(valor_brl)::float8 AS valor, COUNT(*)::int AS qtd
           FROM duo_creditos_mov
          WHERE empresa_id = $1 AND created_at > now() - interval '60 days'
          GROUP BY 1, 2 ORDER BY 1 DESC, 2 LIMIT 120`,
        [empresaId]
      ),
    ]);
    return {
      saldo,
      sem_cobranca: duoCreditos.semCobranca(empresaId),
      pacotes: pacotesCredito(),
      compras: compras.rows,
      extrato: extrato.rows,
    };
  },

  /**
   * Cria a cobrança no Asaas e devolve o link da fatura (PIX, boleto ou cartão, a
   * pessoa escolhe lá). O crédito NÃO entra aqui: só quando o pagamento confirma.
   */
  async comprar(empresaId: number, usuarioId: number, valor: number, cpfCnpj?: string) {
    if (!pacotesCredito().includes(valor)) throw new Error('Escolha um dos valores de recarga.');
    // asaasService importado aqui para o módulo de consumo não depender do Asaas.
    const { asaasService } = await import('../../services/asaas.service');
    await asaasService.garantirContaCorreta();

    const emp = await query(
      `SELECT e.nome, e.email, e.cnpj, a.asaas_customer_id,
              (SELECT email FROM usuarios WHERE id = $2) AS email_usuario
         FROM empresas e LEFT JOIN assinaturas a ON a.empresa_id = e.id
        WHERE e.id = $1`,
      [empresaId, usuarioId]
    );
    const e = emp.rows[0];
    if (!e) throw new Error('Empresa não encontrada');

    let customerId: string | null = e.asaas_customer_id || null;
    if (!customerId) {
      const email = e.email || e.email_usuario;
      const doc = String(cpfCnpj || e.cnpj || '').replace(/\D/g, '');
      let customer = email ? await asaasService.findCustomerByEmail(email) : null;
      if (!customer) {
        if (doc.length !== 11 && doc.length !== 14) {
          const err: any = new Error('Informe o CPF ou CNPJ para emitir a cobrança.');
          err.status = 422;
          err.code = 'PRECISA_DOCUMENTO';
          throw err;
        }
        customer = await asaasService.createCustomer({ name: e.nome, email, cpfCnpj: doc });
      }
      customerId = customer.id;
    }

    const ins = await query(
      `INSERT INTO duo_creditos_compras (empresa_id, usuario_id, valor_brl) VALUES ($1, $2, $3) RETURNING id`,
      [empresaId, usuarioId, valor]
    );
    const compraId: number = ins.rows[0].id;
    const vence = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    try {
      const pagamento = await asaasService.createOneTimePayment({
        customerId: customerId!,
        billingType: 'UNDEFINED',
        value: valor,
        dueDate: vence,
        description: `Crédito do Duo — R$ ${valor.toFixed(2).replace('.', ',')}`,
        externalReference: `${REF_PREFIXO}${compraId}`,
      });
      await query(
        `UPDATE duo_creditos_compras SET asaas_payment_id = $2, invoice_url = $3 WHERE id = $1`,
        [compraId, pagamento.id, pagamento.invoiceUrl]
      );
      return { compra_id: compraId, invoice_url: pagamento.invoiceUrl };
    } catch (err) {
      await query(`UPDATE duo_creditos_compras SET status = 'cancelada' WHERE id = $1`, [compraId]);
      throw err;
    }
  },

  ehReferencia(ref: unknown): boolean {
    return typeof ref === 'string' && ref.startsWith(REF_PREFIXO);
  },

  /**
   * Webhook do Asaas. O endpoint é público: o corpo só diz QUAL pagamento olhar. O
   * status e o valor vêm da API do Asaas, e o crédito entra uma vez só (a compra
   * passa de pendente a paga numa única UPDATE, nas 3 instâncias da API).
   */
  async aoEventoAsaas(event: string, payload: any): Promise<void> {
    const compraId = Number(String(payload?.externalReference || '').slice(REF_PREFIXO.length));
    if (!compraId || !payload?.id) return;
    const { asaasService } = await import('../../services/asaas.service');

    if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_OVERDUE') {
      await query(
        `UPDATE duo_creditos_compras SET status = 'cancelada' WHERE id = $1 AND asaas_payment_id = $2 AND status = 'pendente'`,
        [compraId, payload.id]
      );
      return;
    }
    if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_RECEIVED') return;

    const real = await asaasService.getPayment(payload.id);
    if (!real || !['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(real.status)) return;
    if (real.externalReference !== `${REF_PREFIXO}${compraId}`) return;

    const upd = await query(
      `UPDATE duo_creditos_compras SET status = 'paga', paga_at = now()
        WHERE id = $1 AND asaas_payment_id = $2 AND status = 'pendente' AND valor_brl <= $3
        RETURNING empresa_id, usuario_id, valor_brl::float8 AS valor`,
      [compraId, payload.id, Number(real.value)]
    );
    const c = upd.rows[0];
    if (!c) return;
    await query(
      `INSERT INTO duo_creditos_mov (empresa_id, usuario_id, tipo, valor_brl, detalhe)
       VALUES ($1, $2, 'compra', $3, $4)`,
      [c.empresa_id, c.usuario_id, c.valor, JSON.stringify({ compra_id: compraId, asaas_payment_id: payload.id })]
    );
    console.log(`[Duo] Recarga de R$ ${c.valor} paga — empresa ${c.empresa_id} (compra ${compraId})`);
  },
};
