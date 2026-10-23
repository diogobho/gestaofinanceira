import { PoolClient } from 'pg';

/**
 * Asaas e Conta Azul conectados juntos (09/10/2026). Quem emite o boleto no Asaas costuma lançar
 * a mesma conta a receber no Conta Azul — sem isto, cada uma virava uma receita e o Dashboard
 * contava em dobro. A receita é UMA só, e quem manda nela é o Asaas (avisa o pagamento na hora,
 * traz a taxa); a parcela do Conta Azul fica registrada como espelho (`espelho_asaas`).
 *
 * Gêmeas = mesma empresa, mesmo valor, mesmo vencimento e a mesma pessoa: o mesmo cliente do
 * CRM, ou o mesmo nome (sem acento, maiúscula ou espaço sobrando) — o Conta Azul não manda CPF.
 * Valor ou data diferentes NÃO casam, como no `absorverParcelaManual`.
 */

/** Nome comparável em SQL: minúsculo, sem acento, espaços colapsados. */
const norm = (expr: string) =>
  `translate(lower(regexp_replace(trim(${expr}), '\\s+', ' ', 'g')),
             'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;

/** Do lado do Conta Azul: a receita do Asaas que é a mesma conta a receber. */
export async function receitaAsaasGemea(
  db: PoolClient, empresaId: number, clienteId: number | null, nome: string | null,
  valor: number, vencimento: string,
): Promise<string | null> {
  const r = await db.query(
    `SELECT r.id
       FROM asaas_cobrancas a
       JOIN asaas_conexoes c ON c.id = a.conexao_id AND c.empresa_id = $1
       JOIN receitas r ON r.id = a.receita_id
       JOIN parcelas_receitas p ON p.receita_id = r.id
       LEFT JOIN clientes cl ON cl.id = r.cliente_id
      WHERE p.valor = $3 AND p.data_vencimento = $4::date
        AND r.status NOT IN ('cancelado', 'estornado')
        AND (r.cliente_id = $2::int OR ($5 <> '' AND ${norm('cl.nome')} = ${norm('$5')}))
        AND NOT EXISTS (SELECT 1 FROM contaazul_lancamentos l WHERE l.receita_id = r.id)
      LIMIT 1
      FOR UPDATE OF r`,
    [empresaId, clienteId, valor, vencimento, (nome || '').trim()]);
  return r.rows[0]?.id ?? null;
}

/**
 * Do lado do Asaas: a receita que veio do Conta Azul e é a mesma cobrança. Achou, ela passa a
 * ser do Asaas — a parcela do Conta Azul vira espelho e o job dele deixa de mexer nela.
 */
export async function adotarReceitaContaAzul(
  db: PoolClient, empresaId: number, clienteId: number | null, nome: string | null,
  valor: number, vencimento: string,
): Promise<string | null> {
  const r = await db.query(
    `SELECT r.id
       FROM contaazul_lancamentos l
       JOIN contaazul_importacao i ON i.conexao_id = l.conexao_id AND i.empresa_id = $1
       JOIN receitas r ON r.id = l.receita_id
       JOIN parcelas_receitas p ON p.receita_id = r.id
      WHERE l.tipo = 'receita' AND NOT l.espelho_asaas
        AND p.valor = $3 AND p.data_vencimento = $4::date
        AND r.status NOT IN ('cancelado', 'estornado')
        AND (r.cliente_id = $2::int OR ($5 <> '' AND ${norm('l.parte_nome')} = ${norm('$5')}))
        AND NOT EXISTS (SELECT 1 FROM asaas_cobrancas a WHERE a.receita_id = r.id)
      LIMIT 1
      FOR UPDATE OF r, l`,
    [empresaId, clienteId, valor, vencimento, (nome || '').trim()]);
  const id: string | undefined = r.rows[0]?.id;
  if (!id) return null;
  await db.query(
    `UPDATE contaazul_lancamentos SET espelho_asaas = true, atualizado_em = now() WHERE receita_id = $1`, [id]);
  console.log(`[AsaasReceitas] empresa ${empresaId}: receita ${id} do Conta Azul passou para o Asaas (mesma cobrança)`);
  return id;
}
