/**
 * Cria a parcela que faltou nos lançamentos À VISTA.
 *
 *   node api/scripts/backfill_parcelas_a_vista_20260909.js                    # simulação
 *   node api/scripts/backfill_parcelas_a_vista_20260909.js --empresa=33        # simula só uma
 *   node api/scripts/backfill_parcelas_a_vista_20260909.js --empresa=33 --aplicar
 *
 * Por que: o dashboard, a tela de Parcelas e o chat financeiro leem TUDO de
 * `parcelas_receitas`/`parcelas_despesas` com INNER JOIN. Até 09/09/2026 só o
 * cadastro PARCELADO gerava parcela, então todo lançamento à vista era
 * invisível para os três. A Loja Mageense (empresa 33) cadastrou 39 lançamentos
 * e viu o dashboard zerado; a Panteras tinha 19 receitas na mesma situação.
 * A conta demo (empresa 31) parecia certa porque as parcelas dela vieram do
 * seed — foi o que escondeu a falha dos prints do guia de onboarding.
 *
 * O cadastro já foi corrigido (receitas/despesas.service.ts). Isto é só o
 * passado. É idempotente: só toca em lançamento à vista que não tem NENHUMA
 * parcela, então rodar duas vezes não duplica.
 *
 * Status: a parcela nasce PAGO quando o lançamento está pago, senão PENDENTE —
 * o job `atualizar-parcelas-atrasadas` vira para ATRASADO o que já venceu.
 */
const { Pool } = require('pg');
require('dotenv').config();

const APLICAR = process.argv.includes('--aplicar');
// Sem --empresa vale a base inteira. Com ela dá para corrigir um cliente por
// vez: fazer 19 receitas aparecerem no dashboard de quem já olhava o número
// todo dia é uma mudança que o cliente precisa saber que vem.
const alvo = process.argv.find((a) => a.startsWith('--empresa='));
const EMPRESA = alvo ? Number(alvo.split('=')[1]) : null;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// `tipo_pagamento` é NULL nos registros antigos: só 'parcelado' fica de fora.
const SELECT = (tabela, fk, tabelaParcelas) => `
  SELECT l.id, l.descricao, l.valor, l.data, l.status, u.empresa_id
    FROM ${tabela} l
    JOIN usuarios u ON u.id = l.usuario_id
   WHERE (l.tipo_pagamento IS DISTINCT FROM 'parcelado')
     AND NOT EXISTS (SELECT 1 FROM ${tabelaParcelas} p WHERE p.${fk} = l.id)
     ${EMPRESA ? 'AND u.empresa_id = $1' : ''}
   ORDER BY u.empresa_id, l.data`;

async function processar(cliente, { tabela, fk, tabelaParcelas, rotulo }) {
  const { rows } = await cliente.query(SELECT(tabela, fk, tabelaParcelas), EMPRESA ? [EMPRESA] : []);
  const porEmpresa = {};
  for (const r of rows) porEmpresa[r.empresa_id] = (porEmpresa[r.empresa_id] || 0) + 1;
  console.log(`\n${rotulo}: ${rows.length} sem parcela`, porEmpresa);

  if (!APLICAR) {
    rows.slice(0, 3).forEach((r) =>
      console.log(`   ex.: ${String(r.data).slice(0, 10)}  R$ ${r.valor}  ${r.descricao.slice(0, 60)}`)
    );
    return 0;
  }

  let criadas = 0;
  for (const r of rows) {
    const pago = String(r.status || '').toLowerCase() === 'pago';
    const vencimento = new Date(r.data).toISOString().slice(0, 10);
    await cliente.query(
      `INSERT INTO ${tabelaParcelas} (${fk}, numero_parcela, total_parcelas, valor, data_vencimento, status, data_pagamento)
       VALUES ($1, 1, 1, $2, $3, $4, $5)`,
      [r.id, r.valor, vencimento, pago ? 'PAGO' : 'PENDENTE', pago ? vencimento : null]
    );
    criadas++;
  }
  return criadas;
}

(async () => {
  const cliente = await pool.connect();
  console.log(EMPRESA ? `Escopo: empresa ${EMPRESA}` : 'Escopo: base inteira');
  try {
    await cliente.query('BEGIN');
    const r = await processar(cliente, {
      tabela: 'receitas', fk: 'receita_id', tabelaParcelas: 'parcelas_receitas', rotulo: 'RECEITAS',
    });
    const d = await processar(cliente, {
      tabela: 'despesas', fk: 'despesa_id', tabelaParcelas: 'parcelas_despesas', rotulo: 'DESPESAS',
    });
    if (APLICAR) {
      await cliente.query('COMMIT');
      console.log(`\n✔ ${r} parcelas de receita e ${d} de despesa criadas.`);
    } else {
      await cliente.query('ROLLBACK');
      console.log('\nSimulação — nada gravado. Rode com --aplicar.');
    }
  } catch (e) {
    await cliente.query('ROLLBACK');
    console.error('ERRO, nada gravado:', e.message);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
})();
