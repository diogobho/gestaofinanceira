/**
 * Receitas do Asaas (105) — como a cobrança vira receita. A regra que importa: estornada ou
 * excluída fica SEM parcela, senão o dashboard (que só conhece PAGO/PENDENTE) a contaria
 * como dinheiro a receber.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { receitaDaCobranca, CobrancaAsaas } from '../src/modules/asaas-receitas/asaas-receitas.service';

const base: CobrancaAsaas = { id: 'pay_1', customer: 'cus_1', value: 197.5, status: 'PENDING', dueDate: '2026-10-10' };

describe('receitaDaCobranca', () => {
  test('pendente fica no vencimento, com parcela a receber', () => {
    const r = receitaDaCobranca(base, 'Ana');
    assert.equal(r.status, 'pendente');
    assert.equal(r.data, '2026-10-10');
    assert.equal(r.pagoEm, null);
    assert.equal(r.temParcela, true);
    assert.equal(r.descricao, 'Cobrança Asaas — Ana');
  });

  test('paga fica no dia em que o dinheiro caiu', () => {
    const r = receitaDaCobranca({ ...base, status: 'RECEIVED', paymentDate: '2026-10-09', clientPaymentDate: '2026-10-08' });
    assert.equal(r.status, 'pago');
    assert.equal(r.data, '2026-10-09');
    assert.equal(r.vencimento, '2026-10-10');
  });

  test('parcela de cartão confirmada segue a receber até cair', () => {
    const r = receitaDaCobranca({ ...base, status: 'CONFIRMED', confirmedDate: '2026-10-05', dueDate: '2027-03-10' });
    assert.equal(r.status, 'pendente');
    assert.equal(r.data, '2027-03-10');
    assert.equal(r.temParcela, true);
  });

  test('vencida vira atrasado e continua a receber', () => {
    const r = receitaDaCobranca({ ...base, status: 'OVERDUE' });
    assert.equal(r.status, 'atrasado');
    assert.equal(r.temParcela, true);
  });

  test('estornada e excluída ficam sem parcela', () => {
    assert.deepEqual([receitaDaCobranca({ ...base, status: 'REFUNDED' }).status, receitaDaCobranca({ ...base, status: 'REFUNDED' }).temParcela], ['estornado', false]);
    const exc = receitaDaCobranca({ ...base, status: 'RECEIVED', deleted: true });
    assert.equal(exc.status, 'cancelado');
    assert.equal(exc.temParcela, false);
  });

  test('descrição traz a parcela do parcelamento', () => {
    assert.equal(receitaDaCobranca({ ...base, description: 'Plano anual', installmentNumber: 3 }).descricao, 'Plano anual (parcela 3)');
  });
});

test('taxa do Asaas: só na cobrança paga, pela diferença entre valor e líquido', () => {
  const base = { id: 'pay_1', customer: 'cus_1', value: 189, dueDate: '2026-10-01' };
  assert.equal(receitaDaCobranca({ ...base, status: 'RECEIVED', netValue: 184.51, paymentDate: '2026-10-02' }).taxa, 4.49);
  assert.equal(receitaDaCobranca({ ...base, status: 'PENDING', netValue: 184.51 }).taxa, 0);
  assert.equal(receitaDaCobranca({ ...base, status: 'REFUNDED', netValue: 184.51 }).taxa, 0);
  assert.equal(receitaDaCobranca({ ...base, status: 'RECEIVED_IN_CASH', netValue: 189 }).taxa, 0);
  assert.equal(receitaDaCobranca({ ...base, status: 'RECEIVED' }).taxa, 0);
});
